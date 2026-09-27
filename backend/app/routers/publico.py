"""Cardápio digital — endpoints PÚBLICOS (sem token), SOMENTE LEITURA.

Pedido pelo QR foi DESATIVADO (só atendente cria pedido): o POST de pedido
responde 410 Gone para que QRs impressos exibam mensagem clara.

Segurança: sem autenticação por design (o cliente não tem conta). Mitigações:
- flag `cardapioDigitalAtivo` nas configurações do restaurante;
- rate limit simples por IP em memória;
- preços SEMPRE resolvidos no servidor (no cardápio exibido)."""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request, Response

from app.services import produtos_service
from app.services.base import config_doc, items_col, list_items

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


@router.post("/{restaurant_id}/mesas/{mesa_id}/pedido", status_code=410)
def pedir_na_mesa(restaurant_id: str, mesa_id: str) -> dict:
    """Pedido pelo QR DESATIVADO — somente o atendente cria pedidos.

    Mantido como 410 Gone (em vez de remover a rota) para que QRs já
    impressos exibam mensagem clara em vez de 404 seco. Cardápio e fotos
    seguem públicos.
    """
    raise HTTPException(410, "Pedidos pelo QR desativados — chame o atendente")


def restaurant_doc_exists(restaurant_id: str) -> bool:
    from app.core.firebase import get_db

    return get_db().document(f"restaurantes/{restaurant_id}").get().exists


# evita warning de unused import em items_col (usado indiretamente pelos services)
_ = items_col
