"""Financeiro: CRUD de despesas + marcação de pagamento."""
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo
from app.core.config import settings
from fastapi import HTTPException

from fastapi import APIRouter, Depends, Query, Response

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import DespesaCreate, DespesaPagar, DespesaUpdate
from app.services import despesas_service

router = APIRouter(prefix="/despesas", tags=["financeiro"])

ESCRITA = require_roles("admin", "gerente", "caixa")

LIMIT_PAGINACAO = Query(default=None, ge=1, le=200, description="Sem limit → lista completa (compat)")


@router.get("")
def listar(
    response: Response,
    inicio: datetime | None = Query(default=None),
    fim: datetime | None = Query(default=None),
    status: str | None = Query(default=None),
    categoria: str | None = Query(default=None),
    fornecedor_id: str | None = Query(default=None),
    usuario_id: str | None = Query(default=None),
    limit: int | None = LIMIT_PAGINACAO,
    cursor: str | None = Query(default=None),
    restaurant_id: str = Depends(ESCRITA),
) -> list[dict]:
    docs, next_cursor = despesas_service.listar_paginado(
        restaurant_id.restaurant_id,
        inicio=inicio,
        fim=fim,
        status=status,
        categoria=categoria,
        fornecedor_id=fornecedor_id,
        usuario_id=usuario_id,
        limit=limit,
        cursor_id=cursor,
    )
    if next_cursor:
        response.headers["X-Next-Cursor"] = next_cursor
    return docs


@router.get('/pagina')
def pagina(inicio: datetime | None = None, fim: datetime | None = None,
           status: str | None = None, categoria: str | None = None,
           fornecedor_id: str | None = None, limit: int = Query(50, ge=1, le=200),
           cursor: str | None = None, data_inicio: date | None = None, data_fim: date | None = None, auth: CurrentAuth = Depends(ESCRITA)) -> dict:
    if data_inicio is not None:inicio=datetime.combine(data_inicio,time.min,ZoneInfo(settings.timezone))
    if data_fim is not None:fim=datetime.combine(data_fim,time.max,ZoneInfo(settings.timezone))
    if inicio is not None and inicio.tzinfo is None:inicio=inicio.replace(tzinfo=timezone.utc)
    if fim is not None and fim.tzinfo is None:fim=fim.replace(tzinfo=timezone.utc)
    if inicio and fim and inicio>fim:raise HTTPException(422,'Início deve ser anterior ao fim')
    docs, proximo = despesas_service.listar_paginado(auth.restaurant_id, inicio=inicio, fim=fim,
        status=status, categoria=categoria, fornecedor_id=fornecedor_id, limit=limit, cursor_id=cursor)
    return {'items': docs, 'nextCursor': proximo}


@router.get("/{despesa_id}")
def obter(despesa_id: str, restaurant_id: str = Depends(ESCRITA)) -> dict:
    return despesas_service.obter(restaurant_id.restaurant_id, despesa_id)


@router.post("", status_code=201)
def criar(payload: DespesaCreate, auth: CurrentAuth = Depends(ESCRITA)) -> dict:
    return despesas_service.criar(auth.restaurant_id, payload)


@router.post("/{despesa_id}/pagar")
def marcar_pago(
    despesa_id: str, payload: DespesaPagar | None = None, auth: CurrentAuth = Depends(ESCRITA)
) -> dict:
    return despesas_service.marcar_pago(auth.restaurant_id, despesa_id, payload)


@router.patch("/{despesa_id}")
def atualizar(
    despesa_id: str, payload: DespesaUpdate, auth: CurrentAuth = Depends(ESCRITA)
) -> dict:
    return despesas_service.atualizar(auth.restaurant_id, despesa_id, payload)


@router.delete("/{despesa_id}", status_code=204)
def remover(despesa_id: str, auth: CurrentAuth = Depends(ESCRITA)) -> None:
    despesas_service.remover(auth.restaurant_id, despesa_id)
