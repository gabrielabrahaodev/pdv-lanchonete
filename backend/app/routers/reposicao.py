"""Reposição de insumos: compras por fornecedor e recebimento transacional."""
from fastapi import APIRouter, Depends

from app.core.security import CurrentAuth, require_roles
from app.models.models import PedidoReposicaoCreate, ReceberPedidoReposicao
from app.services import reposicao_service

router = APIRouter(prefix='/reposicao', tags=['reposicao'])
GESTAO = require_roles('admin', 'gerente')


@router.get('/candidatos')
def candidatos(auth: CurrentAuth = Depends(GESTAO)) -> list[dict]:
    return reposicao_service.candidatos(auth.restaurant_id)


@router.get('/pedidos')
def pedidos(auth: CurrentAuth = Depends(GESTAO)) -> list[dict]:
    return reposicao_service.listar(auth.restaurant_id)


@router.post('/pedidos', status_code=201)
def criar(payload: PedidoReposicaoCreate, auth: CurrentAuth = Depends(GESTAO)) -> dict:
    return reposicao_service.criar(auth.restaurant_id, auth.uid, payload)


@router.post('/pedidos/{pedido_id}/receber')
def receber(pedido_id: str, payload: ReceberPedidoReposicao, auth: CurrentAuth = Depends(GESTAO)) -> dict:
    return reposicao_service.receber(auth.restaurant_id, auth.uid, pedido_id, payload)


@router.post('/pedidos/{pedido_id}/cancelar')
def cancelar(pedido_id: str, auth: CurrentAuth = Depends(GESTAO)) -> dict:
    return reposicao_service.cancelar(auth.restaurant_id, auth.uid, pedido_id)
