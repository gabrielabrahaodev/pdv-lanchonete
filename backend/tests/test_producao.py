"""Regressões de produção/estufa. Sem conexão com banco real."""
from copy import deepcopy
from datetime import timedelta

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.models.models import ProducaoCreate, PerdaProducao, ConversaoProducao, OrderItemAdd, ProductCreate, ProductUpdate
from app.services import producao_service as ps, pedidos_service as pedidos, caixa_service, cozinha_service, produtos_service
from tests.conftest import RID, seed, doc_path
from tests.fs_stub import fake_dtt
from tests.test_pagamento_transacional import _mesa


@pytest.fixture
def ambiente(db, monkeypatch):
    monkeypatch.setattr(ps, 'now_utc', fake_dtt)
    seed(db,RID,'estoque','farinha',{'nome':'Farinha','unidade':'kg','quantidadeAtual':100,'custoMedio':5})
    seed(db,RID,'estoque','fermento',{'nome':'Fermento','unidade':'kg','quantidadeAtual':10,'custoMedio':20})
    seed(db,RID,'produtos','pao',{'nome':'Pão','preco':2,'ativo':True,'modoEstoque':'antecipado',
        'precisaPreparar':False,'rendimentoReceita':30,'unidadeVenda':'un',
        'ingredientes':[{'itemId':'farinha','qtd':3},{'itemId':'fermento','qtd':0.1}]})
    _mesa(db)
    return db


def produzir(qtd=30, horas=24, chave='producao1', **kw):
    return ps.produzir(RID,'cozinheiro',ProducaoCreate(produtoId='pao', receitas=1, quantidade=qtd,
        validade=fake_dtt()+timedelta(hours=horas), **kw),chave)


def pedido(qtd=5, mesa='m1'):
    return pedidos.criar(RID,'garcom',mesa,'local',[OrderItemAdd(produtoId='pao',qtd=qtd)])


def lote(db,lid):
    return db.store.data[doc_path(RID,'lotes_producao',lid)]


def estoque(db):
    return db.store.data[doc_path(RID,'estoque','farinha')]['quantidadeAtual']


def test_producao_desconta_receita_e_custo_pelo_rendimento_real(ambiente):
    db=ambiente
    out=produzir(qtd=25)
    assert estoque(db)==97
    assert db.store.data[doc_path(RID,'estoque','fermento')]['quantidadeAtual']==9.9
    assert out['saldo']==25 and out['reservado']==0
    assert out['custoTotal']==17 and out['custoUnitario']==pytest.approx(17/25)
    assert out['rendimentoPrevisto']==30
    assert out['ingredientes'][0]['itemId'] in {'farinha','fermento'}
    assert len(list(db.collection(doc_path(RID,'movimentacoes_estoque')).stream()))==2


def test_producao_explicita_independe_flag_automatica(ambiente):
    ambiente.store.data[f'restaurantes/{RID}/data/configuracoes']={'baixaEstoqueAutomatica':False}
    produzir()
    assert estoque(ambiente)==97


def test_repeticao_producao_nao_duplica_e_chave_diferente_corpo_rejeitada(ambiente):
    a=produzir(); b=produzir()
    assert a['id']==b['id'] and estoque(ambiente)==97
    with pytest.raises(HTTPException) as exc:
        produzir(qtd=20)
    assert exc.value.status_code==409


def test_ingrediente_inexistente_nao_produz_parcialmente(ambiente):
    db=ambiente
    db.store.data[doc_path(RID,'produtos','pao')]['ingredientes'].append({'itemId':'zz-ausente','qtd':1})
    antes=deepcopy(db.store.data)
    with pytest.raises(HTTPException): produzir()
    assert db.store.data==antes


def test_reserva_entrega_cancelamento_sem_baixa_dupla(ambiente):
    db=ambiente; l=produzir()
    p=pedido(5)
    assert p['itens'][0]['status']=='pronto'
    assert (lote(db,l['id'])['saldo'],lote(db,l['id'])['reservado'])==(30,5)
    assert estoque(db)==97
    for _ in range(2):
        pedidos.atualizar_status_item(RID,p['id'],p['itens'][0]['id'],'entregue','u')
    assert (lote(db,l['id'])['saldo'],lote(db,l['id'])['reservado'])==(25,0)
    pedidos.cancelar(RID,p['id'])  # produto entregue não retorna à estufa
    assert lote(db,l['id'])['saldo']==25
    assert estoque(db)==97


def test_cancelar_ou_remover_reserva_devolve_disponibilidade(ambiente):
    db=ambiente; l=produzir(); p=pedido(5)
    pedidos.remover_item(RID,p['id'],p['itens'][0]['id'])
    assert lote(db,l['id'])['reservado']==0
    p=pedidos.adicionar_item(RID,'u',p['id'],OrderItemAdd(produtoId='pao',qtd=2))
    pedidos.cancelar(RID,p['id'])
    assert lote(db,l['id'])['saldo']==30 and lote(db,l['id'])['reservado']==0
    assert estoque(db)==97


def test_cancelar_item_libera_reserva_e_recalcula(ambiente):
    db=ambiente; l=produzir(); p=pedido(5)
    out=pedidos.atualizar_status_item(RID,p['id'],p['itens'][0]['id'],'cancelado')
    assert out['total']==0 and lote(db,l['id'])['reservado']==0


def test_fefo_ignora_vencido_e_divide_reserva_por_lote(ambiente):
    db=ambiente
    tarde=produzir(10,48,'tarde'); cedo=produzir(3,12,'cedo'); vencido=produzir(10,1,'vencido')
    lote(db,vencido['id'])['validade']=fake_dtt()-timedelta(seconds=1)
    p=pedido(5)
    assert [(a['loteId'],a['qtd']) for a in p['itens'][0]['lotesReservados']]==[(cedo['id'],3),(tarde['id'],2)]
    assert lote(db,vencido['id'])['reservado']==0


def test_saldo_insuficiente_nao_cria_pedido_nem_reserva_parcial(ambiente):
    db=ambiente; produzir(2)
    antes=deepcopy(db.store.data)
    with pytest.raises(HTTPException) as exc: pedido(3)
    assert exc.value.status_code==409
    assert db.store.data==antes


def test_segundo_pedido_nao_reserva_unidades_ja_reservadas(ambiente):
    db=ambiente; produzir(5); pedido(5); _mesa(db,'m2')
    with pytest.raises(HTTPException): pedido(1,'m2')


def test_lote_itens_reserva_conjunta_e_reenvio_sem_duplicar(ambiente):
    db=ambiente; l=produzir(12); p=pedido(1)
    itens=[OrderItemAdd(produtoId='pao',qtd=2,observacoes='quente'),OrderItemAdd(produtoId='pao',qtd=3)]
    for _ in range(2): pedidos.adicionar_itens(RID,'u',p['id'],itens,'add1')
    assert lote(db,l['id'])['reservado']==6
    with pytest.raises(HTTPException): pedidos.adicionar_itens(RID,'u',p['id'],[OrderItemAdd(produtoId='pao',qtd=7)],'add2')
    assert lote(db,l['id'])['reservado']==6


def test_pagamento_nao_entrega_e_cozinha_conclui_depois_de_pago(ambiente):
    db=ambiente
    db.store.data[doc_path(RID,'produtos','pao')]['precisaPreparar']=True
    l=produzir(); p=pedido(5); iid=p['itens'][0]['id']
    caixa_service.registrar_pagamento(RID,'u',p['id'],tipo='pix',valor=10)
    assert lote(db,l['id'])['saldo']==30 and lote(db,l['id'])['reservado']==5
    assert cozinha_service.fila(RID)[0]['id']==p['id']
    for status in ['preparo','pronto','entregue']:
        out=pedidos.atualizar_status_item(RID,p['id'],iid,status,'u')
    assert out['status']=='pago' and out['total']==10
    assert out['cozinhaPendente'] is False and cozinha_service.fila(RID)==[]
    assert estoque(db)==97 and lote(db,l['id'])['saldo']==25
    agg=db.store.data[doc_path(RID,'agregados_diarios','2026-09-27')]
    assert agg['cmvProducao']==pytest.approx(round(17/30*5,2))


def test_sob_pedido_pago_antes_do_preparo_ainda_baixa(ambiente):
    db=ambiente
    db.store.data[doc_path(RID,'produtos','pao')].update({'modoEstoque':'sob_pedido','precisaPreparar':True,'ingredientes':[{'itemId':'farinha','qtd':1}]})
    p=pedido(2); assert estoque(db)==100
    caixa_service.registrar_pagamento(RID,'u',p['id'],tipo='pix',valor=4)
    pedidos.atualizar_status_item(RID,p['id'],p['itens'][0]['id'],'preparo','u')
    assert estoque(db)==98


def test_perda_so_livre_motivo_e_custo_sem_consumo_de_ingredientes(ambiente):
    db=ambiente; l=produzir(10); pedido(8)
    perda=PerdaProducao(quantidade=3,motivo='quebra',observacao='Caiu no chão')
    with pytest.raises(HTTPException): ps.registrar_perda(RID,'u',l['id'],perda,'perda1')
    perda=PerdaProducao(quantidade=2,motivo='quebra',observacao='Caiu no chão')
    for _ in range(2): ps.registrar_perda(RID,'u',l['id'],perda,'perda1')
    assert lote(db,l['id'])['saldo']==8 and lote(db,l['id'])['reservado']==8
    assert estoque(db)==97


def test_converter_bolo_em_fatias_preserva_custo_validade_e_nao_duplica(ambiente):
    db=ambiente; l=produzir(2)
    seed(db,RID,'produtos','fatia',{'nome':'Fatia','ativo':True,'modoEstoque':'antecipado','unidadeVenda':'fatia'})
    payload=ConversaoProducao(produtoDestinoId='fatia',quantidadeOrigem=1,quantidadeDestino=12,observacao='Fatiado no balcão')
    a=ps.converter(RID,'u',l['id'],payload,'conv1'); b=ps.converter(RID,'u',l['id'],payload,'conv1')
    assert a['id']==b['id'] and a['saldo']==12 and lote(db,l['id'])['saldo']==1
    assert a['custoTotal']==8.5 and a['custoUnitario']==pytest.approx(8.5/12)
    assert a['validade']==l['validade'] and estoque(db)==97


def test_entrega_lote_vencido_exige_troca_inclusive_pedido_pago(ambiente):
    db=ambiente; velho=produzir(10,1,'velho'); p=pedido(5); iid=p['itens'][0]['id']
    caixa_service.registrar_pagamento(RID,'u',p['id'],tipo='pix',valor=10)
    lote(db,velho['id'])['validade']=fake_dtt()-timedelta(seconds=1)
    with pytest.raises(HTTPException): pedidos.atualizar_status_item(RID,p['id'],iid,'entregue','u')
    novo=produzir(10,24,'novo')
    pedidos.renovar_reserva(RID,p['id'],iid,'u')
    assert lote(db,velho['id'])['reservado']==0
    assert lote(db,novo['id'])['reservado']==5
    pedidos.atualizar_status_item(RID,p['id'],iid,'entregue','u')
    assert lote(db,novo['id'])['saldo']==5


def test_revenda_consumo_unitario_sem_receita_na_venda(ambiente):
    db=ambiente
    db.store.data[doc_path(RID,'produtos','pao')].update({'modoEstoque':'revenda','itemRevendaId':'farinha','precisaPreparar':False})
    p=pedido(3)
    assert estoque(db)==97 and p['itens'][0]['status']=='entregue'
    caixa_service.registrar_pagamento(RID,'u',p['id'],tipo='pix',valor=6)
    assert estoque(db)==97


@pytest.mark.parametrize('campo,valor',[('quantidade',0),('quantidade',-1),('quantidade',1.5),('receitas',0),('receitas',float('nan'))])
def test_producao_validacao(campo,valor):
    dados={'produtoId':'p','quantidade':1,'validade':fake_dtt(),'receitas':1, campo:valor}
    with pytest.raises(ValidationError): ProducaoCreate(**dados)


def test_api_producao_papeis_e_idempotencia(ambiente):
    from app.main import app
    from app.core.security import get_current_auth, CurrentAuth
    client=TestClient(app)
    try:
        app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('u',None,RID,'garcom')
        assert client.get('/api/producao/lotes').status_code==200
        corpo={'produtoId':'pao','quantidade':10,'validade':(fake_dtt()+timedelta(days=1)).isoformat()}
        assert client.post('/api/producao/lotes',json=corpo,headers={'Idempotency-Key':'prod-api'}).status_code==403
        app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('u',None,RID,'cozinha')
        assert client.post('/api/producao/lotes',json=corpo).status_code==422
        ids=[]
        for _ in range(2):
            r=client.post('/api/producao/lotes',json=corpo,headers={'Idempotency-Key':'prod-api'})
            assert r.status_code==201; ids.append(r.json()['id'])
        assert ids[0]==ids[1]
    finally: app.dependency_overrides.clear()
