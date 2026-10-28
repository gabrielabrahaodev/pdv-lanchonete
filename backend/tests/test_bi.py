from datetime import date, timedelta
import pytest
from fastapi import HTTPException
from app.services import bi_service as bi
from app.services.lucratividade import chave
from tests.conftest import seed

@pytest.fixture(autouse=True)
def limpar_cache():
    bi._CACHE.clear()
    yield
    bi._CACHE.clear()


def test_sem_custo_nao_mostra_margem_zero():
    rows=bi.produtos([{'produtosVendidos':{'p':{'produtoId':'p','nome':'Café','quantidade':2,'liquidaCentavos':1000,'quantidadeDesconhecida':2}}}])
    assert rows[0]['margemRealizada'] is None and rows[0]['custoDireto'] is None


def test_cobertura_parcial_margem_so_receita_coberta():
    r=bi.produtos([{'produtosVendidos':{'p':{'produtoId':'p','quantidade':10,'liquidaCentavos':10000,'receitaCobertaCentavos':2000,'quantidadeConhecida':2,'custoEscalado':1000000000}}}])[0]
    assert r['coberturaPercentual']==20 and r['margemRealizada']==50


def test_historico_sem_bi_e_tenant_cache(db):
    seed(db,'r1','agregados_diarios','2026-10-01',{'faturamento':100,'totalPedidos':2})
    a=bi.painel('r1','admin',date(2026,10,1),date(2026,10,1))
    b=bi.painel('r2','admin',date(2026,10,1),date(2026,10,1))
    assert a['atual']['receita']==100 and b['atual']['receita']==0
    assert a['atual']['resultadoGerencial'] is None
    assert a['cobertura']['vendasComBI']==0
    assert a['produtos']==[]


def test_resultado_sem_dupla_compra(db):
    seed(db,'r1','agregados_diarios','2026-10-01',{'faturamento':100,'totalPedidos':1,'biVendas':1,'totalDespesas':50,'despesasPorCategoria':{'insumo':40,'folha':10},'produtosVendidos':{'p':{'produtoId':'p','quantidade':1,'liquidaCentavos':10000,'receitaCobertaCentavos':10000,'quantidadeConhecida':1,'custoEscalado':2000000000}}})
    d=bi.painel('r1','admin',date(2026,10,1),date(2026,10,1))
    assert d['atual']['resultadoGerencial']==70
    assert d['atual']['compras']==40


def test_previsao_sem_inventar_dias_e_cenarios():
    fim=date(2026,10,28)
    assert not bi.prever({},fim,30)['disponivel']
    docs={(fim-timedelta(days=i)).isoformat():{'faturamento':100} for i in range(56)}
    p=bi.prever(docs,fim,90)
    assert p['disponivel'] and len(p['dias'])==90
    assert p['dias'][0]['conservador']==80 and p['dias'][0]['base']==100 and p['dias'][0]['otimista']==120


def test_periodo_limitado():
    with pytest.raises(HTTPException):bi.periodo(date(2020,1,1),date(2026,1,1))


@pytest.mark.parametrize('papel',['cozinha','garcom'])
def test_api_bi_protegida(db,papel):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.security import get_current_auth,CurrentAuth
    app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('u',None,'r1',papel)
    try:assert TestClient(app).get('/api/bi/visao-geral?inicio=2026-10-01&fim=2026-10-28').status_code==403
    finally:app.dependency_overrides.clear()


def test_api_bi_tenant_autorizado(db):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.security import get_current_auth,CurrentAuth
    app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('u',None,'r1','admin')
    try:
        r=TestClient(app).get('/api/bi/visao-geral?inicio=2026-10-01&fim=2026-10-28')
        assert r.status_code==200 and r.json()['produtos']==[]
    finally:app.dependency_overrides.clear()


def test_cache_fontes_reutiliza_periodo_sem_nova_leitura(db, monkeypatch):
    seed(db,'r1','agregados_diarios','2026-10-01',{'faturamento':10,'totalPedidos':1})
    bi.painel('r1','admin',date(2026,10,1),date(2026,10,28))
    monkeypatch.setattr(db,'get_all',lambda refs: (_ for _ in ()).throw(AssertionError('Não deve reler intervalo no cache')))
    bi.produto_evolucao('r1',date(2026,10,1),date(2026,10,28),'p',papel='admin')


@pytest.mark.parametrize('modo',['sob_pedido','revenda'])
@pytest.mark.parametrize('automaticao',[True,False])
def test_snapshot_consumo_historico(db, modo, automaticao):
    from app.services import pedidos_service as ps
    from app.models.models import OrderItemAdd
    seed(db,'r1','estoque','i',{'quantidadeAtual':5000,'custoMedio':.008})
    seed(db,'r1','produtos','p',{'nome':'Produto','preco':10,'ativo':True,'precisaPreparar':False,'modoEstoque':modo,'itemRevendaId':'i','ingredientes':[{'itemId':'i','qtd':150}]})
    seed(db,'r1','mesas','m',{'numero':1,'status':'livre'})
    db.store.data['restaurantes/r1/data/configuracoes']={'baixaEstoqueAutomatica':automaticao}
    p=ps.criar('r1','u','m','local',[OrderItemAdd(produto_id='p',qtd=2)])
    original=p['itens'][0].get('custoDiretoSnapshot')
    assert original == (pytest.approx(2.4 if modo=='sob_pedido' else .016) if automaticao else None)
    seed(db,'r1','produtos','p',{'nome':'Outra receita','ingredientes':[{'itemId':'i','qtd':900}]})
    seed(db,'r1','estoque','i',{'quantidadeAtual':4000,'custoMedio':.8})
    assert ps.obter('r1',p['id'])['itens'][0].get('custoDiretoSnapshot')==original
