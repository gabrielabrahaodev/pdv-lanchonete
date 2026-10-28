"""APIs de BI segregadas por tenant com autorização revalidada antes do cache."""
from datetime import date
from fastapi import APIRouter, Depends, Query
from app.core.security import CurrentAuth, require_roles
from app.services import bi_service as bi
router=APIRouter(prefix='/bi',tags=['BI'])
FINANCEIRO=require_roles('admin','gerente','caixa')


def contexto(inicio:date,fim:date,horizonte:int=Query(7,ge=7,le=90),auth:CurrentAuth=Depends(FINANCEIRO)):
    return bi.painel(auth.restaurant_id,auth.papel,inicio,fim,horizonte)


@router.get('/visao-geral')
def geral(d=Depends(contexto)):return d


@router.get('/evolucao')
def evolucao(d=Depends(contexto)):return d['evolucao']


@router.get('/despesas')
def despesas(d=Depends(contexto)):return {'categorias':d['atual']['categorias'],'total':d['atual']['despesas']}


@router.get('/fornecedores')
def fornecedores(d=Depends(contexto)):return d['atual']['fornecedores']


@router.get('/previsao')
def previsao(d=Depends(contexto)):return d['previsao']


@router.get('/contas-a-pagar')
def contas(auth:CurrentAuth=Depends(FINANCEIRO)):return bi.contas(auth.restaurant_id)


@router.get('/produtos/ranking')
def ranking(ordem:str=Query('receita',pattern='^(receita|quantidade|lucroBruto|margemRealizada)$'),d=Depends(contexto)):
    return sorted(d['produtos'],key=lambda r:r.get(ordem) if r.get(ordem) is not None else float('-inf'),reverse=True)


@router.get('/produtos')
def produtos(produto_id:str|None=None,categoria:str|None=None,d=Depends(contexto)):
    return [r for r in d['produtos'] if (not produto_id or r['produtoId']==produto_id) and (not categoria or r['categoriaId']==categoria)]


@router.get('/produtos/{produto_id}/evolucao')
def produto_evolucao(produto_id:str,inicio:date,fim:date,variacao:str|None=None,auth:CurrentAuth=Depends(FINANCEIRO)):
    return bi.produto_evolucao(auth.restaurant_id,inicio,fim,produto_id,variacao,auth.papel)


@router.get('/produtos/{produto_id}')
def produto(produto_id:str,d=Depends(contexto)):return [r for r in d['produtos'] if r['produtoId']==produto_id]
