"""Financeiro: despesas (insumos, folha manual, contas fixas e outras)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from app.models.models import DespesaCreate, DespesaPagar, DespesaUpdate
from app.services.base import (
    ensure_parent,
    get_item,
    item_doc,
    items_col,
    list_items,
    now_utc,
    stamp_create,
    stamp_update,
)

CATEGORIAS = {"insumo", "folha", "conta_fixa", "outra"}


def _dt(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, "ToDatetime"):
        return value.ToDatetime().replace(tzinfo=timezone.utc)
    return None


def listar(
    restaurant_id: str,
    *,
    inicio: datetime | None = None,
    fim: datetime | None = None,
    status: str | None = None,
    categoria: str | None = None,
    fornecedor_id: str | None = None,
    usuario_id: str | None = None,
) -> list[dict]:
    if categoria and categoria not in CATEGORIAS:
        raise HTTPException(422, f"Categoria deve ser uma de: {', '.join(sorted(CATEGORIAS))}")
    docs = list_items(restaurant_id, "despesas")
    for d in docs:
        d["_dtComp"] = _dt(d.get("data"))
    if inicio is not None:
        docs = [d for d in docs if d["_dtComp"] and d["_dtComp"] >= inicio]
    if fim is not None:
        docs = [d for d in docs if d["_dtComp"] and d["_dtComp"] <= fim]
    if status:
        docs = [d for d in docs if d.get("status") == status]
    if categoria:
        docs = [d for d in docs if d.get("categoria") == categoria]
    if fornecedor_id:
        docs = [d for d in docs if d.get("fornecedorId") == fornecedor_id]
    if usuario_id:
        docs = [d for d in docs if d.get("usuarioId") == usuario_id]
    for d in docs:
        d.pop("_dtComp", None)
    return docs


def obter(restaurant_id: str, despesa_id: str) -> dict:
    doc = get_item(restaurant_id, "despesas", despesa_id)
    if not doc:
        raise HTTPException(404, "Despesa não encontrada")
    return doc


def criar(restaurant_id: str, payload: DespesaCreate) -> dict:
    ensure_parent(restaurant_id, "despesas")
    ref = items_col(restaurant_id, "despesas").document()
    data = payload.model_dump(by_alias=True)
    data.setdefault("status", "pendente")
    ref.set(stamp_create({**data, "restaurantId": restaurant_id}))
    return obter(restaurant_id, ref.id)


def atualizar(restaurant_id: str, despesa_id: str, payload: DespesaUpdate) -> dict:
    obter(restaurant_id, despesa_id)
    dump = payload.model_dump(by_alias=True)
    reabrir = dump.pop("ativoPago", None)  # True=marca pago agora; False=reabre (limpa pagoEm)
    changes = {k: v for k, v in dump.items() if v is not None}
    if reabrir is True:
        changes["status"] = "pago"
        changes["pagoEm"] = now_utc()
    elif reabrir is False:
        from google.cloud.firestore_v1 import DELETE_FIELD

        changes["status"] = "pendente"
        changes["pagoEm"] = DELETE_FIELD
    if changes:
        item_doc(restaurant_id, "despesas", despesa_id).update(stamp_update(changes))
    return obter(restaurant_id, despesa_id)


def marcar_pago(restaurant_id: str, despesa_id: str, payload: DespesaPagar | None) -> dict:
    obter(restaurant_id, despesa_id)
    changes: dict = {"status": "pago", "pagoEm": now_utc()}
    if payload and payload.forma_pagamento:
        changes["formaPagamento"] = payload.forma_pagamento
    item_doc(restaurant_id, "despesas", despesa_id).update(stamp_update(changes))
    return obter(restaurant_id, despesa_id)


def remover(restaurant_id: str, despesa_id: str) -> None:
    obter(restaurant_id, despesa_id)
    item_doc(restaurant_id, "despesas", despesa_id).delete()
