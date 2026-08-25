"""CRUD de categorias."""
from __future__ import annotations

from fastapi import HTTPException

from app.models.models import CategoryCreate, CategoryUpdate
from app.services.base import ensure_parent, get_item, item_doc, items_col, list_items, stamp_create, stamp_update


def listar(restaurant_id: str) -> list[dict]:
    docs = list_items(restaurant_id, "categorias")
    docs.sort(key=lambda d: d.get("ordem", 0))
    return docs


def criar(restaurant_id: str, payload: CategoryCreate) -> dict:
    ensure_parent(restaurant_id, "categorias")
    ref = items_col(restaurant_id, "categorias").document()
    data = payload.model_dump(by_alias=True)
    ref.set(stamp_create({**data, "restaurantId": restaurant_id}))
    return get_item(restaurant_id, "categorias", ref.id)  # type: ignore[return-value]


def atualizar(restaurant_id: str, categoria_id: str, payload: CategoryUpdate) -> dict:
    if not item_doc(restaurant_id, "categorias", categoria_id).get().exists:
        raise HTTPException(404, "Categoria não encontrada")
    changes = {k: v for k, v in payload.model_dump(by_alias=True).items() if v is not None}
    if changes:
        item_doc(restaurant_id, "categorias", categoria_id).update(stamp_update(changes))
    return get_item(restaurant_id, "categorias", categoria_id)  # type: ignore[return-value]


def remover(restaurant_id: str, categoria_id: str) -> None:
    if not item_doc(restaurant_id, "categorias", categoria_id).get().exists:
        raise HTTPException(404, "Categoria não encontrada")
    vinculados = list(
        items_col(restaurant_id, "produtos")
        .where("categoriaId", "==", categoria_id)
        .stream()
    )
    if vinculados:
        raise HTTPException(
            409,
            f"Categoria tem {len(vinculados)} produto(s) vinculado(s); "
            "remova ou reclassifique os produtos antes de excluir",
        )
    item_doc(restaurant_id, "categorias", categoria_id).delete()
