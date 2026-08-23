"""CRUD de produtos (com variações e ingredientes)."""
from __future__ import annotations

from fastapi import HTTPException

from app.models.models import ProductCreate, ProductUpdate
from app.services.base import ensure_parent, get_item, item_doc, items_col, list_items, stamp_create, stamp_update


def listar(restaurant_id: str, *, categoria_id: str | None = None, apenas_ativos: bool = False) -> list[dict]:
    docs = list_items(restaurant_id, "produtos")
    if categoria_id:
        docs = [d for d in docs if d.get("categoriaId") == categoria_id]
    if apenas_ativos:
        docs = [d for d in docs if d.get("ativo", True)]
    return docs


def obter(restaurant_id: str, produto_id: str) -> dict:
    doc = get_item(restaurant_id, "produtos", produto_id)
    if not doc:
        raise HTTPException(404, "Produto não encontrado")
    return doc


def criar(restaurant_id: str, payload: ProductCreate) -> dict:
    ensure_parent(restaurant_id, "produtos")
    data = payload.model_dump(by_alias=True)
    ref = items_col(restaurant_id, "produtos").document()
    ref.set(stamp_create({**data, "restaurantId": restaurant_id}))
    return obter(restaurant_id, ref.id)


def atualizar(restaurant_id: str, produto_id: str, payload: ProductUpdate) -> dict:
    obter(restaurant_id, produto_id)  # 404 se não existir
    changes = {k: v for k, v in payload.model_dump(by_alias=True).items() if v is not None}
    if changes:
        item_doc(restaurant_id, "produtos", produto_id).update(stamp_update(changes))
    return obter(restaurant_id, produto_id)


def remover(restaurant_id: str, produto_id: str) -> None:
    item_doc(restaurant_id, "produtos", produto_id).delete()
