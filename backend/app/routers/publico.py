"""Cardápio digital — endpoints PÚBLICOS (sem token) para o cliente na mesa.

Segurança: sem autenticação por design (o cliente não tem conta). Mitigações:
- flag `cardapioDigitalAtivo` nas configurações do restaurante;
- rate limit simples por IP em memória;
- preços SEMPRE resolvidos no servidor; mesa valida existência/estado.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request, Response

from app.models.models import OrderItemAdd
from app.services import pedidos_service, produtos_service
from app.services.base import config_doc, get_item, items_col, list_items

router = APIRouter(prefix="/publico", tags=["cardapio-digital"])

_RATE: dict[str, deque[float]] = defaultdict(deque)
RATE_MAX = 12          # requisições
RATE_JANELA_S = 60.0   # por minuto


def _rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "?"
    agora = time.monotonic()
    janela = _RATE[ip]
    while janela and agora - janela[0] > RATE_JANELA_S:
        janela.popleft()
    if len(janela) >= RATE_MAX:
        raise HTTPException(429, "Muitas requisições. Aguarde um instante.")
    janela.append(agora)


def _garantir_cardapio_ativo(restaurant_id: str) -> None:
    snap = config_doc(restaurant_id).get()
    if snap.exists and not (snap.to_dict() or {}).get("cardapioDigitalAtivo", True):
        raise HTTPException(403, "Cardápio digital desativado neste restaurante")


@router.get("/{restaurant_id}/cardapio")
def cardapio(restaurant_id: str, request: Request) -> dict:
    """Categorias + produtos ativos, formato enxuto para o cliente."""
    _rate_limit(request)
    _garantir_cardapio_ativo(restaurant_id)

    raiz = restaurant_doc_exists(restaurant_id)
    if not raiz:
        raise HTTPException(404, "Restaurante não encontrado")

    categorias = [
        {"id": c["id"], "nome": c.get("nome"), "icone": c.get("icone"), "ordem": c.get("ordem", 0)}
        for c in list_items(restaurant_id, "categorias")
        if c.get("ativo", True)
    ]
    produtos = [
        {
            "id": p["id"],
            "nome": p.get("nome"),
            "categoriaId": p.get("categoriaId"),
            "preco": p.get("preco"),
            "imagemUrl": p.get("imagemUrl"),
            "temImagem": bool(p.get("temImagem")),
            "variacoes": [
                {"id": v["id"], "nome": v.get("nome"), "precoAdicional": v.get("precoAdicional", 0)}
                for v in (p.get("variacoes") or [])
                if v.get("ativo", True)
            ],
        }
        for p in produtos_service.listar(restaurant_id, apenas_ativos=True)
    ]
    return {"categorias": sorted(categorias, key=lambda c: c["ordem"]), "produtos": produtos}


@router.get("/{restaurant_id}/imagens/{produto_id}")
def imagem_produto(restaurant_id: str, produto_id: str) -> Response:
    """Bytes da foto do produto — usada em <img> pelo app e pelo cardápio QR.

    Fora do rate limit de propósito: a página do cardápio dispara N fotos em
    rajada. Sem o gate cardapioDigitalAtivo também (foto é conteúdo público de
    venda; quem desativar o cardápio não tem o menu listando os produtos).
    """
    if not restaurant_doc_exists(restaurant_id):
        raise HTTPException(404, "Restaurante não encontrado")
    dados = produtos_service.bytes_imagem(restaurant_id, produto_id)
    if not dados:
        raise HTTPException(404, "Imagem não encontrada")
    conteudo, mime = dados
    return Response(
        content=conteudo,
        media_type=mime,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.post("/{restaurant_id}/mesas/{mesa_id}/pedido", status_code=201)
def pedir_na_mesa(restaurant_id: str, mesa_id: str, request: Request, body: dict) -> dict:
    """Cliente envia o pedido pela mesa.

    Mesa livre -> cria novo pedido; mesa ocupada -> adiciona itens ao pedido ativo.
    """
    _rate_limit(request)
    _garantir_cardapio_ativo(restaurant_id)

    bruto = body.get("itens") or []
    if not isinstance(bruto, list) or not bruto or len(bruto) > 30:
        raise HTTPException(422, "Envie de 1 a 30 itens")
    try:
        itens_payload = [
            OrderItemAdd(
                produto_id=str(x["produtoId"]),
                variacao_id=x.get("variacaoId"),
                qtd=int(x["qtd"]),
                observacoes=(x.get("observacoes") or None)[:200] if x.get("observacoes") else None,
            )
            for x in bruto
        ]
    except (KeyError, TypeError, ValueError):
        raise HTTPException(422, "Formato de item inválido")

    mesa = get_item(restaurant_id, "mesas", mesa_id)
    if not mesa:
        raise HTTPException(404, "Mesa não encontrada")
    if mesa.get("status") == "inativa":
        raise HTTPException(409, "Mesa indisponível")

    if mesa.get("status") == "ocupada" and mesa.get("pedidoAtivoId"):
        for payload in itens_payload:
            pedidos_service.adicionar_item(restaurant_id, "cardapio_digital", mesa["pedidoAtivoId"], payload)
        return {"pedidoId": mesa["pedidoAtivoId"], "mesaId": mesa_id, "adicionadoA": True}

    pedido = pedidos_service.criar(
        restaurant_id,
        usuario_id="cardapio_digital",
        mesa_id=mesa_id,
        tipo="local",
        itens_payload=itens_payload,
    )
    return {"pedidoId": pedido["id"], "mesaId": mesa_id, "adicionadoA": False}


def restaurant_doc_exists(restaurant_id: str) -> bool:
    from app.core.firebase import get_db

    return get_db().document(f"restaurantes/{restaurant_id}").get().exists


# evita warning de unused import em items_col (usado indiretamente pelos services)
_ = items_col
