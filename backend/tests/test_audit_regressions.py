"""Regressões da auditoria master: dinheiro, autorização e operações atômicas."""
from unittest.mock import MagicMock
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app.models.models import UserUpdate, DespesaCreate, DespesaUpdate, OrderItemAdd
from app.services import pedidos_service, caixa_service, usuarios_service, despesas_service, mesas_service
from app.core.security import get_current_auth
from tests.conftest import RID, doc_path, seed
from tests.test_pagamento_transacional import _pedido, _mesa, _sessao
from tests.fs_stub import fake_dtt


def item(status='pendente'):
    return {'id':'i','produtoId':'prod','qtd':1,'precoUnitario':100,'status':status}


def test_cancelamento_recalcula_total_e_retry(db):
    _pedido(db, 'p', total=100, itens=[item()])
    for _ in range(2):
        result = pedidos_service.atualizar_status_item(RID,'p','i','cancelado')
        assert result['total'] == 0
        assert result['itens'][0]['status'] == 'cancelado'


@pytest.mark.parametrize('status', ['pago', 'cancelado'])
def test_pedido_fechado_nao_aceita_status(db, status):
    _pedido(db, 'p', status=status, itens=[item('entregue')])
    with pytest.raises(HTTPException) as exc:
        pedidos_service.atualizar_status_item(RID,'p','i','cancelado')
    assert exc.value.status_code == 409
    assert pedidos_service.obter(RID,'p')['itens'][0]['status'] == 'entregue'


@pytest.mark.parametrize('operacao', ['remover','cancelar'])
def test_pagamento_parcial_impede_reducao(db, operacao):
    _pedido(db, 'p', itens=[item()])
    caixa_service.registrar_pagamento(RID,'u','p',tipo='pix',valor=40)
    with pytest.raises(HTTPException) as exc:
        if operacao == 'remover':
            pedidos_service.remover_item(RID,'p','i')
        else:
            pedidos_service.atualizar_status_item(RID,'p','i','cancelado')
    assert exc.value.status_code == 409
    assert pedidos_service.obter(RID,'p')['total'] == 100


def test_transicoes_nao_pulam_baixa_nem_regridem(db):
    _pedido(db,'p',itens=[item()])
    with pytest.raises(HTTPException):
        pedidos_service.atualizar_status_item(RID,'p','i','pronto')
    pedidos_service.atualizar_status_item(RID,'p','i','preparo')
    pedidos_service.atualizar_status_item(RID,'p','i','pronto')
    with pytest.raises(HTTPException):
        pedidos_service.atualizar_status_item(RID,'p','i','preparo')


def test_agregado_soma_pix_e_linhas_do_mesmo_produto(db):
    _pedido(db,'p',itens=[{**item('pronto'),'id':'a','precoUnitario':50}, {**item('pronto'),'id':'b','precoUnitario':50}])
    _sessao(db)
    caixa_service.registrar_pagamento(RID,'u','p',tipo='pix',valor=40)
    caixa_service.registrar_pagamento(RID,'u','p',tipo='pix',valor=60)
    for kind, ref in [('agregados_diarios','2026-09-27'),('agregados_mensais','2026-09')]:
        agg=db.store.data[doc_path(RID,kind,ref)]
        assert agg['faturamento']==100
        assert agg['vendasPorFormaPagamento']['pix']==100
        assert agg['topProdutos']['prod']==2


def test_desativacao_bloqueia_auth_e_perfil(db,monkeypatch):
    auth=MagicMock()
    monkeypatch.setattr('app.core.firebase.get_auth',lambda:auth)
    token = MagicMock(return_value={'uid':'u','restaurantId':RID,'papel':'admin'})
    monkeypatch.setattr('app.core.security.fb_auth.verify_id_token',token)
    seed(db,RID,'usuarios','u',{'nome':'User','papel':'caixa','ativo':True})
    assert get_current_auth('Bearer token').papel == 'caixa'  # claim antigo não eleva papel
    token.assert_called_with('token',check_revoked=True)
    usuarios_service.atualizar(RID,'admin','u',UserUpdate(ativo=False))
    auth.update_user.assert_called_with('u',disabled=True)
    auth.revoke_refresh_tokens.assert_called_once_with('u')
    with pytest.raises(HTTPException) as exc:
        get_current_auth('Bearer token')
    assert exc.value.status_code == 403
    usuarios_service.atualizar(RID,'admin','u',UserUpdate(ativo=True))
    assert get_current_auth('Bearer token').papel == 'caixa'


@pytest.mark.parametrize('valor',[-50,0,float('inf'),float('nan')])
def test_despesa_edicao_rejeita_valores_invalidos(valor):
    with pytest.raises(ValidationError):
        DespesaUpdate(valor=valor)


def test_mesa_com_pedido_nao_libera_nem_remove(db):
    _mesa(db,pedido_ativo='anterior')
    _pedido(db,'anterior')
    for status in ['livre','reservada','inativa']:
        with pytest.raises(HTTPException):
            mesas_service.atualizar_status(RID,'m1',status)
    with pytest.raises(HTTPException):
        mesas_service.remover(RID,'m1')


def test_mesa_livre_com_vinculo_legado_rejeita_novo_pedido(db):
    _mesa(db,pedido_ativo='anterior')
    db.store.data[doc_path(RID,'mesas','m1')]['status']='livre'
    seed(db,RID,'produtos','prod',{'nome':'Lanche','preco':10,'ativo':True})
    with pytest.raises(HTTPException):
        pedidos_service.criar(RID,'u','m1','local',[OrderItemAdd(produtoId='prod',qtd=1)])


def test_fechamento_rele_pagamento_concorrente(db,monkeypatch):
    _sessao(db);_pedido(db,'p')
    original=caixa_service.sessao_atual
    def leitura_intercalada(rid):
        stale=original(rid)
        caixa_service.registrar_pagamento(rid,'u','p',tipo='dinheiro',valor=100)
        return stale
    monkeypatch.setattr(caixa_service,'sessao_atual',leitura_intercalada)
    result=caixa_service.fechar(RID,200)
    assert result['resumoFechamento']['esperadoEmCaixa']==200
    assert result['resumoFechamento']['diferenca']==0


def test_movimento_rele_sessao_e_preserva_lancamentos(db,monkeypatch):
    _sessao(db)
    original=caixa_service.sessao_atual
    def leitura_intercalada(rid):
        stale=original(rid)
        db.store.data[doc_path(RID,'sessoes_caixa','s1')].update({'suprimentos':20,'movimentacoesCaixa':[{'id':'outro'}]})
        return stale
    monkeypatch.setattr(caixa_service,'sessao_atual',leitura_intercalada)
    out=caixa_service.movimentacao_caixa(RID,'u','suprimento',30,None)
    assert out['suprimentos']==50
    assert len(out['movimentacoesCaixa'])==2


def test_despesa_multiplas_edicoes_mesmo_timestamp(db,monkeypatch):
    monkeypatch.setattr('app.services.base.now_utc',fake_dtt)
    d=despesas_service.criar(RID,DespesaCreate(categoria='insumo',descricao='Insumo',valor=100,data=fake_dtt()))
    for valor in [150,200,75]:
        despesas_service.atualizar(RID,d['id'],DespesaUpdate(valor=valor))
        for kind, ref in [('agregados_diarios','2026-09-27'),('agregados_mensais','2026-09')]:
            assert db.store.data[doc_path(RID,kind,ref)]['totalDespesas']==valor


def test_lote_atomico_e_idempotente(db):
    _pedido(db,'p',total=0)
    db.store.data[doc_path(RID,'pedidos','p')]['itens']=[]
    seed(db,RID,'produtos','prod',{'nome':'Suco','preco':10,'ativo':True,'precisaPreparar':False,'ingredientes':[{'itemId':'e','qtd':2}]})
    seed(db,RID,'estoque','e',{'quantidadeAtual':100,'custoMedio':1})
    itens=[OrderItemAdd(produtoId='prod',qtd=1),OrderItemAdd(produtoId='prod',qtd=2)]
    for _ in range(2):
        result=pedidos_service.adicionar_itens(RID,'u','p',itens,'envio1')
        assert len(result['itens'])==2
        assert result['total']==30
    assert db.store.data[doc_path(RID,'estoque','e')]['quantidadeAtual']==94
    with pytest.raises(HTTPException):
        pedidos_service.adicionar_itens(RID,'u','p',itens[:1],'envio1')
    with pytest.raises(HTTPException):
        pedidos_service.adicionar_itens(RID,'u','p',[itens[0],OrderItemAdd(produtoId='inexistente',qtd=1)],'envio2')
    assert len(pedidos_service.obter(RID,'p')['itens'])==2
    assert db.store.data[doc_path(RID,'estoque','e')]['quantidadeAtual']==94


@pytest.mark.parametrize('papel', ['garcom', 'cozinha'])
@pytest.mark.parametrize('rota', ['/api/despesas','/api/caixa/sessao-atual','/api/caixa/sessoes','/api/usuarios'])
def test_api_financeira_restrita_por_papel(db, papel, rota):
    from app.main import app
    from app.core.security import CurrentAuth
    from fastapi.testclient import TestClient
    app.dependency_overrides[get_current_auth] = lambda: CurrentAuth('u',None,RID,papel)
    try:
        assert TestClient(app).get(rota).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_api_lote_reenvio_e_chave_obrigatoria(db):
    from app.main import app
    from app.core.security import CurrentAuth
    from fastapi.testclient import TestClient
    app.dependency_overrides[get_current_auth] = lambda: CurrentAuth('u',None,RID,'garcom')
    try:
        _pedido(db,'p',total=0)
        db.store.data[doc_path(RID,'pedidos','p')]['itens']=[]
        seed(db,RID,'produtos','prod',{'nome':'Lanche','preco':10,'ativo':True})
        client=TestClient(app)
        payload=[{'produtoId':'prod','qtd':2}]
        url='/api/pedidos/p/itens/lote'
        assert client.post(url,json=payload).status_code==422
        for _ in range(2):
            response=client.post(url,json=payload,headers={'Idempotency-Key':'lote-1'})
            assert response.status_code==201
            assert response.json()['total']==20
            assert len(response.json()['itens'])==1
    finally:
        app.dependency_overrides.clear()


def test_sessao_fechada_entre_selecao_e_mutacao_nao_reabre(db,monkeypatch):
    _sessao(db)
    original=caixa_service.sessao_atual
    def leitura_intercalada(rid):
        stale=original(rid)
        db.store.data[doc_path(RID,'sessoes_caixa','s1')]['status']='fechado'
        return stale
    monkeypatch.setattr(caixa_service,'sessao_atual',leitura_intercalada)
    with pytest.raises(HTTPException) as exc:
        caixa_service.movimentacao_caixa(RID,'u','suprimento',30,None)
    assert exc.value.status_code==409
    assert db.store.data[doc_path(RID,'sessoes_caixa','s1')]['suprimentos']==0


def test_reconstrucao_corrige_historico_e_periodos_sem_fontes(db):
    from copy import deepcopy
    from app.services import backfill_service
    _pedido(db,'p',itens=[{**item('pronto'),'id':'a','precoUnitario':50}, {**item('pronto'),'id':'b','precoUnitario':50}])
    caixa_service.registrar_pagamento(RID,'u','p',tipo='pix',valor=40)
    caixa_service.registrar_pagamento(RID,'u','p',tipo='pix',valor=60)
    path = doc_path(RID,'agregados_diarios','2026-09-27')
    db.store.data[path]['vendasPorFormaPagamento']['pix']=60
    db.store.data[path]['topProdutos']['prod']=1
    antigo = seed(db,RID,'agregados_diarios','2026-08-01',{'totalDespesas':100})
    antes=deepcopy(db.store.data)
    assert backfill_service.reconstruir(RID)['aplicado'] is False
    assert db.store.data==antes
    backfill_service.reconstruir(RID,apply=True)
    assert db.store.data[path]['vendasPorFormaPagamento']['pix']==100
    assert db.store.data[path]['topProdutos']['prod']==2
    assert db.store.data[antigo]['totalDespesas']==0
