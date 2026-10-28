from datetime import date, datetime, timezone
from fastapi.testclient import TestClient
from app.services import bi_service as bi, despesas_service as ds
from app.models.models import DespesaCreate
from tests.conftest import seed


def test_indicadores_mesma_base_sem_dupla_compra(db):
    bi._CACHE.clear()
    seed(db,'r1','agregados_diarios','2026-10-01',{'faturamento':100,'totalPedidos':1,'biVendas':1,'totalDespesas':50,'despesasPorCategoria':{'insumo':40,'folha':10},'produtosVendidos':{'p':{'produtoId':'p','quantidade':1,'liquidaCentavos':10000,'receitaCobertaCentavos':10000,'quantidadeConhecida':1,'custoEscalado':2000000000}}})
    d=bi.painel('r1','admin',date(2026,10,1),date(2026,10,1))
    assert d['indicadores']['lucroBruto']==80
    assert d['indicadores']['margemBruta']==80
    assert d['indicadores']['cmvPercentual']==20
    assert d['indicadores']['operacionaisPercentual']==10
    assert d['atual']['resultadoGerencial']==70
    bi._CACHE.clear()


def test_indicador_custo_desconhecido_nao_zero(db):
    bi._CACHE.clear()
    seed(db,'r1','agregados_diarios','2026-10-01',{'faturamento':100,'totalPedidos':1})
    d=bi.painel('r1','admin',date(2026,10,1),date(2026,10,1))
    assert d['indicadores']['lucroBruto'] is None and d['indicadores']['margemBruta'] is None
    assert d['indicadores']['alertas']
    bi._CACHE.clear()


def test_mutacao_invalida_so_tenant_confirmado(db):
    bi._CACHE.clear()
    ini=fim=date(2026,10,1)
    bi.painel('r1','admin',ini,fim);bi.painel('r2','admin',ini,fim)
    ds.criar('r1',DespesaCreate(descricao='Folha teste',categoria='folha',valor=12,data=datetime(2026,10,1,12,tzinfo=timezone.utc)))
    assert not any(k[0]=='r1' or k[0]=='fonte' and k[1]=='r1' for k in bi._CACHE)
    assert any(k[0]=='r2' for k in bi._CACHE)
    d=bi.painel('r1','admin',ini,fim)
    assert d['atual']['operacionais']==12
    bi._CACHE.clear()


def test_despesas_periodo_civil_fuso_e_compat(db):
    from app.main import app
    from app.core.security import get_current_auth,CurrentAuth
    seed(db,'r1','despesas','ontem',{'data':datetime(2026,10,2,1,tzinfo=timezone.utc)})
    seed(db,'r1','despesas','hoje',{'data':datetime(2026,10,2,4,tzinfo=timezone.utc)})
    app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('u',None,'r1','admin')
    try:
        r=TestClient(app).get('/api/despesas/pagina?data_inicio=2026-10-02&data_fim=2026-10-02&status=&categoria=')
        assert r.status_code==200 and [d['id'] for d in r.json()['items']]==['hoje']
        assert len(TestClient(app).get('/api/despesas/pagina').json()['items'])==2
    finally:app.dependency_overrides.clear()
