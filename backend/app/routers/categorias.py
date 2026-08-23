"""CRUD de categorias."""
from fastapi import APIRouter, Depends

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import CategoryCreate, CategoryUpdate
from app.services import categorias_service

router = APIRouter(prefix="/categorias", tags=["categorias"])

ESCRITA = require_roles("admin", "gerente", "caixa")


@router.get("")
def listar(restaurant_id: str = Depends(require_restaurant)) -> list[dict]:
    return categorias_service.listar(restaurant_id.restaurant_id)


@router.post("", status_code=201)
def criar(
    payload: CategoryCreate,
    auth: CurrentAuth = Depends(ESCRITA),
) -> dict:
    return categorias_service.criar(auth.restaurant_id, payload)


@router.patch("/{categoria_id}")
def atualizar(
    categoria_id: str,
    payload: CategoryUpdate,
    auth: CurrentAuth = Depends(ESCRITA),
) -> dict:
    return categorias_service.atualizar(auth.restaurant_id, categoria_id, payload)


@router.delete("/{categoria_id}", status_code=204)
def remover(categoria_id: str, auth: CurrentAuth = Depends(ESCRITA)) -> None:
    categorias_service.remover(auth.restaurant_id, categoria_id)
