"""Estoque: itens e movimentações."""
from fastapi import APIRouter, Depends, Query, Response, Header

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import InventoryItemCreate, InventoryItemUpdate, MovementCreate
from app.services import estoque_service

router = APIRouter(prefix="/estoque", tags=["estoque"])

GESTAO = require_roles("admin", "gerente")


@router.get("/itens")
def listar_itens(
    apenas_alertas: bool = Query(default=False),
    restaurant_id: str = Depends(require_restaurant),
) -> list[dict]:
    return estoque_service.listar_itens(restaurant_id.restaurant_id, apenas_alertas=apenas_alertas)


@router.get("/itens/{item_id}")
def obter_item(item_id: str, restaurant_id: str = Depends(require_restaurant)) -> dict:
    return estoque_service.obter_item(restaurant_id.restaurant_id, item_id)


@router.post("/itens", status_code=201)
def criar_item(payload: InventoryItemCreate, auth: CurrentAuth = Depends(GESTAO)) -> dict:
    return estoque_service.criar_item(auth.restaurant_id, payload, auth.uid)


@router.patch("/itens/{item_id}")
def atualizar_item(
    item_id: str, payload: InventoryItemUpdate, auth: CurrentAuth = Depends(GESTAO)
) -> dict:
    return estoque_service.atualizar_item(auth.restaurant_id, item_id, payload, auth.uid)


@router.delete("/itens/{item_id}", status_code=204)
def remover_item(item_id: str, auth: CurrentAuth = Depends(GESTAO)) -> None:
    estoque_service.remover_item(auth.restaurant_id, item_id)


@router.post("/movimentacoes", status_code=201)
def registrar_movimentacao(
    payload: MovementCreate,
    chave: str | None = Header(default=None, alias="Idempotency-Key", min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"),
    auth: CurrentAuth = Depends(GESTAO),
) -> dict:
    item, mov = estoque_service.registrar_movimentacao(auth.restaurant_id, auth.uid, payload, chave)
    return {"item": item, "movimentacao": mov}


@router.get("/movimentacoes")
def listar_movimentacoes(
    response: Response,
    item_id: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=500, description="Sem limit → lista completa (compat)"),
    cursor: str | None = Query(default=None),
    restaurant_id: str = Depends(require_restaurant),
) -> list[dict]:
    docs, next_cursor = estoque_service.listar_movimentacoes_paginado(
        restaurant_id.restaurant_id, item_id=item_id, limit=limit, cursor_id=cursor
    )
    if next_cursor:
        response.headers["X-Next-Cursor"] = next_cursor
    return docs
