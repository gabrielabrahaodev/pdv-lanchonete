"""Pedidos e itens."""
from fastapi import APIRouter, Depends, Query

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import OrderItemAdd
from app.services import pedidos_service

router = APIRouter(prefix="/pedidos", tags=["pedidos"])

# garcom monta pedidos; cozinha não cria (apenas status de itens)
ESCRITA = require_roles("admin", "gerente", "caixa", "garcom")
STATUS = require_roles("admin", "gerente", "caixa", "cozinha")


@router.get("")
def listar(
    status: str | None = Query(default=None),
    mesa_id: str | None = Query(default=None),
    restaurant_id: str = Depends(require_restaurant),
) -> list[dict]:
    return pedidos_service.listar(restaurant_id.restaurant_id, status=status, mesa_id=mesa_id)


@router.get("/{pedido_id}")
def obter(pedido_id: str, restaurant_id: str = Depends(require_restaurant)) -> dict:
    return pedidos_service.obter(restaurant_id.restaurant_id, pedido_id)


@router.post("", status_code=201)
def criar(
    mesa_id: str,
    itens: list[OrderItemAdd],
    tipo: str = Query(default="local"),
    auth: CurrentAuth = Depends(ESCRITA),
) -> dict:
    return pedidos_service.criar(auth.restaurant_id, auth.uid, mesa_id, tipo, itens)


@router.post("/{pedido_id}/itens", status_code=201)
def adicionar_item(
    pedido_id: str,
    payload: OrderItemAdd,
    auth: CurrentAuth = Depends(ESCRITA),
) -> dict:
    return pedidos_service.adicionar_item(auth.restaurant_id, auth.uid, pedido_id, payload)


@router.delete("/{pedido_id}/itens/{item_id}")
def remover_item(pedido_id: str, item_id: str, auth: CurrentAuth = Depends(ESCRITA)) -> dict:
    return pedidos_service.remover_item(auth.restaurant_id, pedido_id, item_id)


@router.patch("/{pedido_id}/itens/{item_id}/status")
def status_item(
    pedido_id: str,
    item_id: str,
    novo_status: str,
    auth: CurrentAuth = Depends(STATUS),
) -> dict:
    return pedidos_service.atualizar_status_item(auth.restaurant_id, pedido_id, item_id, novo_status)


@router.post("/{pedido_id}/cancelar")
def cancelar(pedido_id: str, auth: CurrentAuth = Depends(require_roles("admin", "gerente", "caixa"))) -> dict:
    return pedidos_service.cancelar(auth.restaurant_id, pedido_id)
