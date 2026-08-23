"""Gestão de mesas."""
from fastapi import APIRouter, Depends

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.services import mesas_service

router = APIRouter(prefix="/mesas", tags=["mesas"])

CRUD = require_roles("admin", "gerente", "caixa")
# garcom pode alterar apenas o status (ex.: reservada/livre)
STATUS = require_roles("admin", "gerente", "caixa", "garcom")


@router.get("")
def listar(restaurant_id: str = Depends(require_restaurant)) -> list[dict]:
    return mesas_service.listar(restaurant_id.restaurant_id)


@router.get("/{mesa_id}")
def obter(mesa_id: str, restaurant_id: str = Depends(require_restaurant)) -> dict:
    return mesas_service.obter(restaurant_id.restaurant_id, mesa_id)


@router.post("", status_code=201)
def criar(numero: int, auth: CurrentAuth = Depends(CRUD)) -> dict:
    return mesas_service.criar(auth.restaurant_id, numero)


@router.patch("/{mesa_id}")
def atualizar_status(mesa_id: str, novo_status: str, auth: CurrentAuth = Depends(STATUS)) -> dict:
    return mesas_service.atualizar_status(auth.restaurant_id, mesa_id, novo_status)


@router.delete("/{mesa_id}", status_code=204)
def remover(mesa_id: str, auth: CurrentAuth = Depends(CRUD)) -> None:
    mesas_service.remover(auth.restaurant_id, mesa_id)
