"""Financeiro: CRUD de fornecedores."""
from fastapi import APIRouter, Depends, Query

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import FornecedorCreate, FornecedorUpdate
from app.services import fornecedores_service

router = APIRouter(prefix="/fornecedores", tags=["financeiro"])

ESCRITA = require_roles("admin", "gerente", "caixa")


@router.get("")
def listar(
    apenas_ativos: bool = Query(default=False),
    restaurant_id: str = Depends(require_restaurant),
) -> list[dict]:
    return fornecedores_service.listar(restaurant_id.restaurant_id, apenas_ativos=apenas_ativos)


@router.get("/{fornecedor_id}")
def obter(fornecedor_id: str, restaurant_id: str = Depends(require_restaurant)) -> dict:
    return fornecedores_service.obter(restaurant_id.restaurant_id, fornecedor_id)


@router.post("", status_code=201)
def criar(payload: FornecedorCreate, auth: CurrentAuth = Depends(ESCRITA)) -> dict:
    return fornecedores_service.criar(auth.restaurant_id, payload)


@router.patch("/{fornecedor_id}")
def atualizar(
    fornecedor_id: str, payload: FornecedorUpdate, auth: CurrentAuth = Depends(ESCRITA)
) -> dict:
    return fornecedores_service.atualizar(auth.restaurant_id, fornecedor_id, payload)


@router.delete("/{fornecedor_id}", status_code=204)
def remover(fornecedor_id: str, auth: CurrentAuth = Depends(ESCRITA)) -> None:
    fornecedores_service.remover(auth.restaurant_id, fornecedor_id)
