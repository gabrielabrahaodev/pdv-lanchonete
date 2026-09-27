"""Relatórios."""
from datetime import datetime

from fastapi import APIRouter, Depends, Query

from app.core.security import require_restaurant, require_roles
from app.services import agregados_service, relatorios_service

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


@router.get("/agregado")
def agregado(
    tipo: str = Query(pattern="^(dia|mes)$"),
    ref: str = Query(examples=["2026-09-26"]),
    _: str = Depends(VISUALIZACAO),
    restaurant_id: str = Depends(require_restaurant),
) -> dict:
    """Resumo pré-computado do dia/mês (1–2 leituras em vez de scans)."""
    return agregados_service.resumo_agregado(restaurant_id.restaurant_id, tipo, ref)
