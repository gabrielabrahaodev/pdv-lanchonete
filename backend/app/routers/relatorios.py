"""Relatórios."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query

from app.core.security import require_restaurant, require_roles
from app.services import relatorios_service

router = APIRouter(prefix="/relatorios", tags=["relatorios"])

VISUALIZACAO = require_roles("admin", "gerente", "caixa")


@router.get("/resumo")
def resumo(
    inicio: datetime = Query(...),
    fim: datetime = Query(...),
    _: str = Depends(VISUALIZACAO),
    restaurant_id: str = Depends(require_restaurant),
) -> dict:
    return relatorios_service.resumo(restaurant_id.restaurant_id, inicio, fim)
