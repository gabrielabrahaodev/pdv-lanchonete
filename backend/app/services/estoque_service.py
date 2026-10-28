"""Estoque: itens de inventário e movimentações."""

from __future__ import annotations
from app.services.base import executar_transacao

import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from app.services.unidades import UNIDADES, quantidade_controle, converter
from google.cloud.firestore import transactional

from app.core.firebase import get_db
from app.models.models import InventoryItemCreate, InventoryItemUpdate, MovementCreate
from app.services.base import (
    ensure_parent,
    get_item,
    item_doc,
    items_col,
    list_items,
    list_items_paginado,
    stamp_create,
    stamp_update,
)


# ------------------------------------------------------------------ itens
def _validar_fornecedor(rid: str, fornecedor_id: str | None) -> None:
    if not fornecedor_id:
        return
    fornecedor = get_item(rid, 'fornecedores', fornecedor_id)
    if not fornecedor or fornecedor.get('ativo') is False:
        raise HTTPException(422, 'Fornecedor não encontrado ou inativo neste restaurante')


def listar_itens(restaurant_id: str, *, apenas_alertas: bool = False) -> list[dict]:
    docs = list_items(restaurant_id, "estoque")
    if apenas_alertas:
        docs = [
            d
            for d in docs
            if float(d.get("quantidadeAtual", 0)) <= float(d.get("minimo", 0))
        ]
    return docs


def obter_item(restaurant_id: str, item_id: str) -> dict:
    doc = get_item(restaurant_id, "estoque", item_id)
    if not doc:
        raise HTTPException(404, "Item de estoque não encontrado")
    return doc


def _referencias(t, rid, iid):
    produtos = list(t.get(items_col(rid, "produtos")))
    movimentos = list(
        t.get(
            items_col(rid, "movimentacoes_estoque").where("itemId", "==", iid).limit(1)
        )
    )
    vinculado = any(
        (p.to_dict() or {}).get("itemRevendaId") == iid
        or any(
            i.get("itemId") == iid for i in (p.to_dict() or {}).get("ingredientes", [])
        )
        for p in produtos
    )
    if vinculado or movimentos:
        return True
    # Fontes históricas legadas também impedem excluir/permutar a unidade.
    lotes = list(t.get(items_col(rid, "lotes_producao")))
    pedidos = list(t.get(items_col(rid, "pedidos")))
    return any(
        any(i.get("itemId") == iid for i in (l.to_dict() or {}).get("ingredientes", []))
        for l in lotes
    ) or any(
        any(
            iid in i.get("consumoEstoque", {})
            for i in (p.to_dict() or {}).get("itens", [])
        )
        for p in pedidos
    )


def _validar_cadastro(data):
    if not data.get("nome", "").strip():
        raise HTTPException(422, "Informe o nome do insumo")
    if data.get("unidadeCompra") and data["unidadeCompra"] not in UNIDADES:
        raise HTTPException(422, "Unidade de compra inválida")
    if data.get("unidadeCompra"):
        converter(
            1,
            data["unidadeCompra"],
            data["unidade"],
            data["unidadeCompra"],
            data.get("fatorCompra"),
        )
    if data.get("unidadeCompra") in {"cx", "pct"} and not data.get("fatorCompra"):
        raise HTTPException(
            422, "Informe quantas unidades de controle existem na embalagem"
        )


def criar_item(
    restaurant_id: str, payload: InventoryItemCreate, usuario_id=None
) -> dict:
    data = payload.model_dump(by_alias=True, exclude_none=True)
    if data["unidade"] not in UNIDADES:
        raise HTTPException(422, "Unidade de controle inválida")
    _validar_cadastro(data)
    _validar_fornecedor(restaurant_id, data.get('fornecedorId'))
    ref = items_col(restaurant_id, "estoque").document()

    @transactional
    def executar(t):
        t.set(
            ref,
            stamp_create(
                {
                    **data,
                    "nome": data["nome"].strip(),
                    "ativo": True,
                    "restaurantId": restaurant_id,
                }
            ),
        )
        if data["quantidadeAtual"]:
            t.set(
                items_col(restaurant_id, "movimentacoes_estoque").document(),
                stamp_create(
                    {
                        "tipo": "ajuste",
                        "itemId": ref.id,
                        "qtd": data["quantidadeAtual"],
                        "saldoApos": data["quantidadeAtual"],
                        "custoUnitario": data["custoMedio"],
                        "observacao": "Saldo inicial do cadastro",
                        "usuarioId": usuario_id,
                        "restaurantId": restaurant_id,
                    }
                ),
            )

    executar_transacao(executar)
    return obter_item(restaurant_id, ref.id)


def atualizar_item(
    restaurant_id: str, item_id: str, payload: InventoryItemUpdate, usuario_id=None
) -> dict:
    ref = item_doc(restaurant_id, "estoque", item_id)
    changes = payload.model_dump(by_alias=True, exclude_none=True)
    # String vazia permite remover o vínculo sem apagar histórico do insumo.
    if payload.fornecedor_id is not None:
        changes['fornecedorId'] = payload.fornecedor_id.strip()

    @transactional
    def executar(t):
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Item não encontrado")
        atual = snap.to_dict() or {}
        if 'fornecedorId' in changes and changes['fornecedorId']:
            fornecedor = next(iter(t.get(item_doc(restaurant_id, 'fornecedores', changes['fornecedorId']))), None)
            if not fornecedor or not fornecedor.exists or (fornecedor.to_dict() or {}).get('ativo') is False:
                raise HTTPException(422, 'Fornecedor não encontrado ou inativo neste restaurante')
        _validar_cadastro({**atual, **changes})
        if changes.get("unidade", atual["unidade"]) != atual["unidade"]:
            if (
                changes["unidade"] not in UNIDADES
                or atual.get("quantidadeAtual", 0) != 0
                or _referencias(t, restaurant_id, item_id)
            ):
                raise HTTPException(
                    409,
                    "Unidade com saldo, receita ou histórico não pode mudar. Cadastre outro insumo.",
                )
        if "custoMedio" in changes and changes["custoMedio"] != atual.get(
            "custoMedio", 0
        ):
            t.set(
                items_col(restaurant_id, "movimentacoes_estoque").document(),
                stamp_create(
                    {
                        "tipo": "custo",
                        "itemId": item_id,
                        "qtd": 0,
                        "custoAnterior": atual.get("custoMedio", 0),
                        "custoUnitario": changes["custoMedio"],
                        "usuarioId": usuario_id,
                        "observacao": "Correção cadastral de custo",
                        "restaurantId": restaurant_id,
                    }
                ),
            )
        t.update(ref, stamp_update(changes))

    executar_transacao(executar)
    return obter_item(restaurant_id, item_id)


def remover_item(restaurant_id: str, item_id: str) -> None:
    ref = item_doc(restaurant_id, "estoque", item_id)

    @transactional
    def executar(t):
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Item não encontrado")
        if (snap.to_dict() or {}).get("quantidadeAtual", 0) != 0 or _referencias(
            t, restaurant_id, item_id
        ):
            raise HTTPException(
                409, "Insumo com saldo, receita ou histórico: arquive em vez de excluir"
            )
        t.delete(ref)

    executar_transacao(executar)


# ------------------------------------------------------------------ movimentações
def registrar_movimentacao(
    restaurant_id: str,
    usuario_id: str,
    payload: MovementCreate,
    chave: str | None = None,
) -> tuple[dict, dict]:
    """Registra entrada/saida/ajuste e aplica no saldo do item.

    Transação no saldo: evita perda de update com movimentações simultâneas.
    Retorna (item_atualizado, movimentacao).
    """
    if payload.tipo not in {"entrada", "saida", "ajuste"}:
        raise HTTPException(422, "Tipo deve ser 'entrada', 'saida' ou 'ajuste'")

    item_ref = item_doc(restaurant_id, "estoque", payload.item_id)
    corpo = payload.model_dump(by_alias=True)
    fp = hashlib.sha256(json.dumps(corpo, sort_keys=True).encode()).hexdigest()
    evento = item_doc(restaurant_id, "eventos_estoque", chave) if chave else None

    @transactional
    def _exec(t) -> str:
        if evento:
            ev = next(iter(t.get(evento)), None)
            if ev and ev.exists:
                data = ev.to_dict()
                if data["fingerprint"] != fp:
                    raise HTTPException(409, "Chave já usada com outra movimentação")
                return data["movId"]
        snap = next(iter(t.get(item_ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Item de estoque não encontrado")
        item = snap.to_dict() or {}
        if item.get("ativo") is False:
            raise HTTPException(409, "Reative o insumo antes de movimentar")
        qtd = quantidade_controle(payload.qtd, payload.unidade, item)
        if qtd <= 0 and payload.tipo != "ajuste":
            raise HTTPException(422, "Informe uma quantidade maior que zero")
        if payload.valor_total_compra is not None and payload.tipo != "entrada":
            raise HTTPException(422, "Valor de compra disponível somente em entrada")
        atual = float(item.get("quantidadeAtual", 0))
        custo = float(item.get("custoMedio", 0))
        novo_custo = custo
        if payload.valor_total_compra is not None:
            # Saldo negativo não representa estoque com valor disponível.
            base = max(Decimal(str(atual)), Decimal(0))
            novo_custo = float(
                (
                    (
                        base * Decimal(str(custo))
                        + Decimal(str(payload.valor_total_compra))
                    )
                    / (base + Decimal(str(qtd)))
                ).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
            )

        if payload.tipo == "entrada":
            novo_saldo = round(atual + qtd, 3)
        elif payload.tipo == "saida":
            novo_saldo = round(atual - qtd, 3)
        else:
            novo_saldo = round(qtd, 3)

        mov_data = {
            "tipo": payload.tipo,
            "itemId": payload.item_id,
            "qtd": qtd,
            "saldoApos": novo_saldo,
            "observacao": payload.observacao,
            "pedidoId": None,
            "usuarioId": usuario_id,
            "restaurantId": restaurant_id,
            "unidade": item["unidade"],
            "quantidadeCompra": payload.qtd,
            "unidadeCompra": payload.unidade or item["unidade"],
            "valorTotalCompra": payload.valor_total_compra,
            "custoUnitario": custo,
            "custoMedioApos": novo_custo,
        }
        mov_ref = items_col(restaurant_id, "movimentacoes_estoque").document()
        t.set(mov_ref, stamp_create(mov_data))
        t.update(
            item_ref,
            stamp_update({"quantidadeAtual": novo_saldo, "custoMedio": novo_custo}),
        )
        if evento:
            t.set(evento, {"fingerprint": fp, "movId": mov_ref.id})
        return mov_ref.id

    mov_id = executar_transacao(_exec)
    return obter_item(restaurant_id, payload.item_id), get_item(
        restaurant_id, "movimentacoes_estoque", mov_id
    )  # type: ignore[return-value]


def listar_movimentacoes(
    restaurant_id: str, *, item_id: str | None = None, limit: int = 100
) -> list[dict]:
    docs = list_items(restaurant_id, "movimentacoes_estoque")
    if item_id:
        docs = [d for d in docs if d.get("itemId") == item_id]
    return sorted(
        docs,
        key=lambda d: str(d.get("criadoEm") or d.get("createdAt") or ""),
        reverse=True,
    )[:limit]


def listar_movimentacoes_paginado(
    restaurant_id: str,
    *,
    limit: int | None = None,
    cursor_id: str | None = None,
    item_id: str | None = None,
) -> tuple[list[dict], str | None]:
    """Histórico de movimentações paginado (P1-L).

    Sem `item_id`: consulta server-side (createdAt DESC — índice automático).
    Com `item_id`: caminho integral antigo (filtro em outra coleção-campo
    exigiria índice composto) — next_cursor None.
    """
    if limit is None or item_id:
        return listar_movimentacoes(restaurant_id, item_id=item_id), None
    if limit <= 0:
        raise HTTPException(422, "limit deve ser maior que zero")
    return list_items_paginado(
        restaurant_id, "movimentacoes_estoque", limit=limit, cursor_id=cursor_id
    )
