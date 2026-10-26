"""Venda sem mesa: dinheiro, estoque, estufa, repeticao e autorizacao."""
from copy import deepcopy
from datetime import timedelta
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.core.security import CurrentAuth, get_current_auth
from app.models.models import OrderItemAdd, ProducaoCreate
from app.services import pedidos_service as pedidos, caixa_service as caixa, producao_service as producao, cozinha_service
from tests.conftest import RID, seed, doc_path
from tests.test_pagamento_transacional import _mesa, _sessao
from tests.fs_stub import fake_dtt

@pytest.fixture
def loja(db, monkeypatch):
    _mesa(db); _sessao(db)
    monkeypatch.setattr(producao, 'now_utc', fake_dtt)
    seed(db,RID,'estoque','agua',{'nome':'Agua','quantidadeAtual':20,'custoMedio':1})
    seed(db,RID,'estoque','cafe',{'nome':'Cafe','quantidadeAtual':10,'custoMedio':5})
    seed(db,RID,'produtos','bebida',{'nome':'Bebida','ativo':True,'preco':6,'precisaPreparar':False,'ingredientes':[{'itemId':'agua','qtd':1}]})
    seed(db,RID,'produtos','espresso',{'nome':'Espresso','ativo':True,'preco':8,'precisaPreparar':True,'ingredientes':[{'itemId':'agua','qtd':1},{'itemId':'cafe','qtd':0.1}]})
    seed(db,RID,'produtos','pao',{'nome':'Pao','ativo':True,'preco':3,'modoEstoque':'antecipado','precisaPreparar':False,'ingredientes':[{'itemId':'cafe','qtd':1}]})
    return db

def criar(pid='bebida',qtd=2,chave='nova'):
    return pedidos.criar_balcao(RID,'u',[OrderItemAdd(produtoId=pid,qtd=qtd)],chave)

def pagar(p, **kw):
    return caixa.registrar_pagamento(RID,'u',p['id'],tipo=kw.pop('tipo','pix'),valor=kw.pop('valor',p['total']),idempotency_key=kw.pop('key','pag1'),**kw)

def test_balcao_sem_mesa_preco_e_estoque_idempotentes(loja):
    db=loja; mesas=deepcopy(db.store.data[doc_path(RID,'mesas','m1')])
    p=criar(); replay=criar()
    assert p['id']==replay['id'] and p['mesaId'] is None and p['tipo']=='balcao' and p['total']==12
    assert db.store.data[doc_path(RID,'estoque','agua')]['quantidadeAtual']==18
    assert len(list(db.collection(doc_path(RID,'movimentacoes_estoque')).stream()))==1
    assert db.store.data[doc_path(RID,'mesas','m1')]==mesas
    # Competencia do novo consumo usa o relogio real do agregado; confira pelo conjunto.
    assert sum(d.get('saidasPorItem',{}).get('agua',0) for path,d in db.store.data.items() if '/agregados_diarios/' in path)==2


def test_balcao_chave_com_outro_corpo_bloqueada(loja):
    criar()
    with pytest.raises(HTTPException) as e: criar(qtd=3)
    assert e.value.status_code==409


@pytest.mark.parametrize('momento',['criar','pagar'])
def test_balcao_exige_caixa_aberto(loja,momento):
    p=criar() if momento=='pagar' else None
    loja.store.data[doc_path(RID,'sessoes_caixa','s1')]['status']='fechado'
    antes=deepcopy(loja.store.data)
    with pytest.raises(HTTPException) as e: pagar(p) if p else criar()
    assert e.value.status_code==409 and loja.store.data==antes


@pytest.mark.parametrize('tipo',['dinheiro','pix','credito','debito'])
def test_pagamento_balcao_credita_uma_vez_e_nao_toca_mesa(loja,tipo):
    p=criar(); antes=deepcopy(loja.store.data[doc_path(RID,'mesas','m1')])
    for _ in range(2): out=pagar(p,tipo=tipo,troco=8 if tipo=='dinheiro' else None)
    assert out['status']=='pago' and len(out['pagamentos'])==1
    assert loja.store.data[doc_path(RID,'sessoes_caixa','s1')]['totalVendas']==12
    assert loja.store.data[doc_path(RID,'sessoes_caixa','s1')]['vendasPorFormaPagamento']=={tipo:12}
    assert loja.store.data[doc_path(RID,'mesas','m1')]==antes
    with pytest.raises(HTTPException): pagar(p,tipo=tipo,valor=1)


def test_pagamento_preparo_posterior_balcao(loja):
    p=criar('espresso',1); pagar(p)
    fila=cozinha_service.fila(RID)
    assert fila[0]['mesaId'] is None and fila[0]['tipo']=='balcao'
    assert loja.store.data[doc_path(RID,'estoque','cafe')]['quantidadeAtual']==10
    for status in ['preparo','pronto','entregue']:
        pedidos.atualizar_status_item(RID,p['id'],p['itens'][0]['id'],status,'u')
    assert loja.store.data[doc_path(RID,'estoque','cafe')]['quantidadeAtual']==9.9
    assert cozinha_service.fila(RID)==[]


def produzir():
    return producao.produzir(RID,'u',ProducaoCreate(produtoId='pao',quantidade=10,validade=fake_dtt()+timedelta(days=1)),'fornada')


def test_pagamento_e_entrega_estufa_uma_transacao(loja):
    lote=produzir();p=criar('pao',2)
    for _ in range(2): out=pagar(p,entregar_prontos=True)
    assert out['itens'][0]['status']=='entregue' and not out['cozinhaPendente']
    saldo=loja.store.data[doc_path(RID,'lotes_producao',lote['id'])]
    assert saldo['saldo']==8 and saldo['reservado']==0
    assert loja.store.data[doc_path(RID,'estoque','cafe')]['quantidadeAtual']==9


def test_lote_vencido_impede_pagamento_com_entrega(loja):
    l=produzir();p=criar('pao',2)
    loja.store.data[doc_path(RID,'lotes_producao',l['id'])]['validade']=fake_dtt()-timedelta(seconds=1)
    antes=deepcopy(loja.store.data)
    with pytest.raises(HTTPException): pagar(p,entregar_prontos=True)
    assert loja.store.data==antes
    # Pagamento sem entrega e permitido; a troca do lote sera feita antes da entrega.
    assert pagar(p)['status']=='pago'


def test_cancelar_balcao_libera_reserva_sem_mesa(loja):
    l=produzir();p=criar('pao',2)
    pedidos.cancelar(RID,p['id'])
    assert loja.store.data[doc_path(RID,'lotes_producao',l['id'])]['reservado']==0
    with pytest.raises(HTTPException): pagar(p)


def test_estoque_desligado_balcao_respeita_flag(loja):
    loja.store.data[f'restaurantes/{RID}/data/configuracoes']={'baixaEstoqueAutomatica':False}
    criar();assert loja.store.data[doc_path(RID,'estoque','agua')]['quantidadeAtual']==20


def test_api_balcao_papeis_tenant_e_chave(loja):
    from app.main import app
    client=TestClient(app)
    payload=[{'produtoId':'bebida','qtd':2}]
    try:
        for role in ['garcom','cozinha']:
            app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('u',None,RID,role)
            assert client.post('/api/pedidos/balcao',json=payload,headers={'Idempotency-Key':'x'}).status_code==403
        app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('u',None,RID,'caixa')
        assert client.post('/api/pedidos/balcao',json=payload).status_code==422
        assert client.post('/api/pedidos/balcao',json=[],headers={'Idempotency-Key':'x'}).status_code==422
        r=client.post('/api/pedidos/balcao',json=payload,headers={'Idempotency-Key':'x'})
        assert r.status_code==201
        pid=r.json()['id']
        for _ in range(2):
            assert client.post('/api/pagamentos/'+pid,json={'tipo':'pix','valor':12},headers={'X-Idempotency-Key':'pag'}).status_code==201
        app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('u',None,'outro','caixa')
        assert client.get('/api/pedidos/'+pid).status_code==404
    finally: app.dependency_overrides.clear()
