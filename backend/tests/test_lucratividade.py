from copy import deepcopy
from decimal import Decimal
import pytest
from app.services.lucratividade import metricas_venda, ratear, inteiro, chave
from app.services import agregados_service as ag, caixa_service
from tests.conftest import seed, doc_path
from tests.fs_stub import fake_dtt


def item(**kw):
    return dict(produtoId='p', qtd=1, precoUnitario=10, status='entregue', **kw)


def test_rateio_centavos_variacoes_e_cancelado():
    p={'total':10,'itens':[item(),dict(item(),variacaoId='v'),dict(item(),status='cancelado')]}
    rows=metricas_venda(p)
    assert len(rows)==2 and sum(r['liquidaCentavos'] for r in rows)==1000
    assert sum(r['descontoCentavos'] for r in rows)==1000
    assert ratear(1,[1,1,1])==[1,0,0]


def test_grama_precisao_e_custo_ausente():
    rows=metricas_venda({'total':20,'itens':[item(custoDiretoSnapshot=.008*150,custoDiretoEstado='conhecido'),item()]})
    assert rows[0]['custoEscalado']==120000000
    assert rows[1]['quantidadeDesconhecida']==1
    assert rows[1]['receitaCobertaCentavos']==0
    assert inteiro(Decimal('.00000001'),100000000)==1


def test_snapshot_nao_depende_de_cadastro_atual():
    p={'total':10,'itens':[item(custoDiretoSnapshot=2,custoDiretoEstado='conhecido')]}
    assert metricas_venda(deepcopy(p))[0]['custoEscalado']==200000000
    assert metricas_venda({'status':'cancelado','total':10,'itens':[item()]})==[]


def test_agregacao_idempotente_por_evento(db):
    from google.cloud.firestore import transactional
    p={'total':10,'itens':[item(custoDiretoSnapshot=2,custoDiretoEstado='conhecido')]}
    @transactional
    def gravar(t): ag.registrar_venda_tx(t,'r1',p,[],fake_dtt(),evento_id='venda:p1')
    gravar(db.transaction()); gravar(db.transaction())
    diario=next(v for k,v in db.store.data.items() if '/agregados_diarios/items/' in k)
    r=diario['produtosVendidos'][chave('p')]
    assert r['quantidade']==1 and r['liquidaCentavos']==1000 and r['custoEscalado']==200000000


@pytest.mark.parametrize('qtd',[1,25,100,500])
def test_somente_unidades_vendidas(qtd):
    row=metricas_venda({'total':qtd*5,'itens':[dict(item(),qtd=qtd,precoUnitario=5,custoDiretoSnapshot=qtd*1.2,custoDiretoEstado='conhecido')]})[0]
    assert row['quantidade']==qtd and row['custoEscalado']==inteiro(Decimal(qtd)*Decimal('1.2'),100000000)


def test_40_produzidos_25_vendidos(db):
    from app.models.models import ProducaoCreate, OrderItemAdd
    from app.services import producao_service as ps, pedidos_service as pedidos
    from datetime import timedelta
    seed(db,'r1','estoque','farinha',{'quantidadeAtual':10000,'custoMedio':.008})
    seed(db,'r1','produtos','p',{'nome':'Salgado','ativo':True,'modoEstoque':'antecipado','preco':5,'rendimentoReceita':40,'ingredientes':[{'itemId':'farinha','qtd':1000}]})
    seed(db,'r1','mesas','m',{'numero':1,'status':'livre'})
    lote=ps.produzir('r1','u',ProducaoCreate(produto_id='p',receitas=1,quantidade=40,validade=fake_dtt()+timedelta(days=400),local='estufa'),'producao40')
    pedido=pedidos.criar('r1','u','m','local',[OrderItemAdd(produto_id='p',qtd=25)])
    caixa_service.registrar_pagamento('r1','u',pedido['id'],tipo='pix',valor=125)
    row=metricas_venda(pedido)[0]
    assert row['quantidade']==25 and row['custoEscalado']==500000000
    seed(db,'r1','estoque','farinha',{'quantidadeAtual':9000,'custoMedio':.016})
    assert metricas_venda(pedido)[0]==row
