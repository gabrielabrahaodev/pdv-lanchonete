"""Produção e estufa, somente membros autenticados do restaurante."""
from fastapi import APIRouter, Depends, Header, Query, Response
from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import ProducaoCreate, PerdaProducao, ConversaoProducao
from app.services import producao_service

router = APIRouter(prefix='/producao', tags=['producao'])
OPERAR = require_roles('admin', 'gerente', 'caixa', 'cozinha')
CHAVE = Header(alias='Idempotency-Key', min_length=1, max_length=128, pattern=r'^[A-Za-z0-9_-]+$')

@router.get('/lotes')
def lotes(auth: CurrentAuth = Depends(require_restaurant)):
    return producao_service.listar(auth.restaurant_id)

@router.get('/historico')
def historico(response: Response, limit: int = Query(default=50, ge=1, le=100),
              cursor: str | None = None, auth: CurrentAuth = Depends(OPERAR)):
    docs, proximo = producao_service.historico(auth.restaurant_id, limit, cursor)
    if proximo:
        response.headers['X-Next-Cursor'] = proximo
    return docs

@router.post('/lotes', status_code=201)
def produzir(payload: ProducaoCreate, chave: str = CHAVE, auth: CurrentAuth = Depends(OPERAR)):
    return producao_service.produzir(auth.restaurant_id, auth.uid, payload, chave)

@router.post('/lotes/{lote_id}/perdas')
def perda(lote_id: str, payload: PerdaProducao, chave: str = CHAVE, auth: CurrentAuth = Depends(OPERAR)):
    return producao_service.registrar_perda(auth.restaurant_id, auth.uid, lote_id, payload, chave)

@router.post('/lotes/{lote_id}/converter', status_code=201)
def converter(lote_id: str, payload: ConversaoProducao, chave: str = CHAVE, auth: CurrentAuth = Depends(OPERAR)):
    return producao_service.converter(auth.restaurant_id, auth.uid, lote_id, payload, chave)
