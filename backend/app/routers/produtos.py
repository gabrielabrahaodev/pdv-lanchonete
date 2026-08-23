"""CRUD de produtos."""
from fastapi import APIRouter, Depends, Query

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import ProductCreate, ProductUpdate
from app.services import produtos_service

router = APIRouter(prefix="/produtos", tags=["produtos"])

ESCRITA = require_roles("admin", "gerente", "caixa")


@router.get("")
def listar(
    categoria_id: str | None = Query(default=None),
    apenas_ativos: bool = Query(default=False),
    restaurant_id: str = Depends(require_restaurant),
) -> list[dict]:
    return produtos_service.listar(restaurant_id.restaurant_id, categoria_id=categoria_id, apenas_ativos=apenas_ativos)


@router.get("/{produto_id}")
def obter(produto_id: str, restaurant_id: str = Depends(require_restaurant)) -> dict:
    return produtos_service.obter(restaurant_id.restaurant_id, produto_id)


@router.post("", status_code=201)
def criar(payload: ProductCreate, auth: CurrentAuth = Depends(ESCRITA)) -> dict:
    return produtos_service.criar(auth.restaurant_id, payload)


@router.patch("/{produto_id}")
def atualizar(produto_id: str, payload: ProductUpdate, auth: CurrentAuth = Depends(ESCRITA)) -> dict:
    return produtos_service.atualizar(auth.restaurant_id, produto_id, payload)


@router.delete("/{produto_id}", status_code=204)
def remover(produto_id: str, auth: CurrentAuth = Depends(ESCRITA)) -> None:
    produtos_service.remover(auth.restaurant_id, produto_id)
