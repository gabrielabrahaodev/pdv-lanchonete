"""Estoque: itens de inventário e movimentações."""
from __future__ import annotations

from fastapi import HTTPException
from google.cloud.firestore import transactional

from app.core.firebase import get_db
from app.models.models import InventoryItemCreate, InventoryItemUpdate, MovementCreate
from app.services.base import (
    ensure_parent,
    get_item,
    item_doc,
    items_col,
    list_items,
    stamp_create,
    stamp_update,
)


# ------------------------------------------------------------------ itens
def listar_itens(restaurant_id: str, *, apenas_alertas: bool = False) -> list[dict]:
    docs = list_items(restaurant_id, "estoque")
    if apenas_alertas:
        docs = [d for d in docs if float(d.get("quantidadeAtual", 0)) <= float(d.get("minimo", 0))]
    return docs


def obter_item(restaurant_id: str, item_id: str) -> dict:
    doc = get_item(restaurant_id, "estoque", item_id)
    if not doc:
        raise HTTPException(404, "Item de estoque não encontrado")
    return doc


def criar_item(restaurant_id: str, payload: InventoryItemCreate) -> dict:
    ensure_parent(restaurant_id, "estoque")
    ref = items_col(restaurant_id, "estoque").document()
    ref.set(stamp_create({**payload.model_dump(by_alias=True), "restaurantId": restaurant_id}))
    return obter_item(restaurant_id, ref.id)


def atualizar_item(restaurant_id: str, item_id: str, payload: InventoryItemUpdate) -> dict:
    obter_item(restaurant_id, item_id)
    changes = {k: v for k, v in payload.model_dump(by_alias=True).items() if v is not None}
    if changes:
        item_doc(restaurant_id, "estoque", item_id).update(stamp_update(changes))
    return obter_item(restaurant_id, item_id)


def remover_item(restaurant_id: str, item_id: str) -> None:
    obter_item(restaurant_id, item_id)
    item_doc(restaurant_id, "estoque", item_id).delete()


# ------------------------------------------------------------------ movimentações
def registrar_movimentacao(
    restaurant_id: str, usuario_id: str, payload: MovementCreate
) -> tuple[dict, dict]:
    """Registra entrada/saida/ajuste e aplica no saldo do item.

    Transação no saldo: evita perda de update com movimentações simultâneas.
    Retorna (item_atualizado, movimentacao).
    """
    if payload.tipo not in {"entrada", "saida", "ajuste"}:
        raise HTTPException(422, "Tipo deve ser 'entrada', 'saida' ou 'ajuste'")

    item_ref = item_doc(restaurant_id, "estoque", payload.item_id)
    qtd = float(payload.qtd)

    @transactional
    def _exec(t) -> str:
        snap = next(iter(t.get(item_ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Item de estoque não encontrado")
        atual = float((snap.to_dict() or {}).get("quantidadeAtual", 0))

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
        }
        mov_ref = items_col(restaurant_id, "movimentacoes_estoque").document()
        t.set(mov_ref, stamp_create(mov_data))
        t.update(item_ref, stamp_update({"quantidadeAtual": novo_saldo}))
        return mov_ref.id

    mov_id = _exec(get_db().transaction())
    return obter_item(restaurant_id, payload.item_id), get_item(
        restaurant_id, "movimentacoes_estoque", mov_id
    )  # type: ignore[return-value]


def listar_movimentacoes(restaurant_id: str, *, item_id: str | None = None, limit: int = 100) -> list[dict]:
    docs = list_items(restaurant_id, "movimentacoes_estoque")
    if item_id:
        docs = [d for d in docs if d.get("itemId") == item_id]
    return docs[:limit]
