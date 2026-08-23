"""KDS — endpoints da cozinha."""
from fastapi import APIRouter, Depends

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.services import cozinha_service, pedidos_service

router = APIRouter(prefix="/cozinha", tags=["cozinha"])

STATUS = require_roles("admin", "gerente", "caixa", "cozinha")


@router.get("/fila")
def fila(restaurant_id: str = Depends(require_restaurant)) -> list[dict]:
    return cozinha_service.fila(restaurant_id.restaurant_id)


@router.patch("/pedidos/{pedido_id}/itens/{item_id}/status")
def status_item(
    pedido_id: str,
    item_id: str,
    novo_status: str,
    auth: CurrentAuth = Depends(STATUS),
) -> dict:
    return pedidos_service.atualizar_status_item(
        auth.restaurant_id, pedido_id, item_id, novo_status, usuario_id=auth.uid
    )
