"""Sessões de caixa."""
from fastapi import APIRouter, Depends, Query, Response

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import CashMovement, SessionClose, SessionOpen
from app.services import caixa_service

router = APIRouter(prefix="/caixa", tags=["caixa"])

CAIXA = require_roles("admin", "gerente", "caixa")


@router.get("/sessoes")
def listar(
    response: Response,
    limit: int | None = Query(default=None, ge=1, le=200, description="Sem limit → lista completa (compat)"),
    cursor: str | None = Query(default=None),
    restaurant_id: str = Depends(require_restaurant),
) -> list[dict]:
    docs, next_cursor = caixa_service.listar_sessoes_paginado(
        restaurant_id.restaurant_id, limit=limit, cursor_id=cursor
    )
    if next_cursor:
        response.headers["X-Next-Cursor"] = next_cursor
    return docs


@router.get("/sessao-atual")
def atual(restaurant_id: str = Depends(require_restaurant)) -> dict | None:
    return caixa_service.sessao_atual(restaurant_id.restaurant_id)


@router.post("/abrir", status_code=201)
def abrir(payload: SessionOpen, auth: CurrentAuth = Depends(CAIXA)) -> dict:
    return caixa_service.abrir(auth.restaurant_id, auth.uid, payload.valor_inicial)


@router.post("/suprimento")
def suprimento(payload: CashMovement, auth: CurrentAuth = Depends(CAIXA)) -> dict:
    return caixa_service.movimentacao_caixa(auth.restaurant_id, auth.uid, "suprimento", payload.valor, payload.observacao)


@router.post("/sangria")
def sangria(payload: CashMovement, auth: CurrentAuth = Depends(CAIXA)) -> dict:
    return caixa_service.movimentacao_caixa(auth.restaurant_id, auth.uid, "sangria", payload.valor, payload.observacao)


@router.post("/fechar")
def fechar(payload: SessionClose, auth: CurrentAuth = Depends(CAIXA)) -> dict:
    return caixa_service.fechar(auth.restaurant_id, payload.valor_contado)
