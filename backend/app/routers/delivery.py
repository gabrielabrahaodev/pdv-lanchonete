"""Delivery."""
from fastapi import APIRouter, Depends, Query

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import DeliveryOrderCreate, DeliveryStatusUpdate
from app.services import delivery_service

router = APIRouter(prefix="/delivery", tags=["delivery"])

ESCRITA = require_roles("admin", "gerente", "caixa", "garcom")
STATUS = require_roles("admin", "gerente", "caixa", "garcom", "cozinha")


@router.get("/pedidos")
def listar(
    status: str | None = Query(default=None),
    restaurant_id: str = Depends(require_restaurant),
) -> list[dict]:
    return delivery_service.listar(restaurant_id.restaurant_id, status=status)


@router.get("/pedidos/{delivery_id}")
def obter(delivery_id: str, restaurant_id: str = Depends(require_restaurant)) -> dict:
    return delivery_service.obter(restaurant_id.restaurant_id, delivery_id)


@router.post("/pedidos", status_code=201)
def criar(payload: DeliveryOrderCreate, auth: CurrentAuth = Depends(ESCRITA)) -> dict:
    return delivery_service.criar(auth.restaurant_id, payload)


@router.patch("/pedidos/{delivery_id}/status")
def status(delivery_id: str, payload: DeliveryStatusUpdate, auth: CurrentAuth = Depends(STATUS)) -> dict:
    return delivery_service.atualizar_status(auth.restaurant_id, delivery_id, payload)
