from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
from app.models.models import FornecedorCreate, FornecedorUpdate, DespesaCreate
from app.services import fornecedores_service as fs, despesas_service as ds
from tests.conftest import seed


def test_crud_compatibilidade_e_tenant(db):
    f = fs.criar('r1', FornecedorCreate(nome='Fornecedor', nome_fantasia='Fantasia', prazo_entrega_dias=3))
    assert f['nomeFantasia'] == 'Fantasia'
    fs.atualizar('r1', f['id'], FornecedorUpdate(ativo=False))
    assert fs.listar('r1', apenas_ativos=True) == []
    with pytest.raises(HTTPException): fs.obter('r2', f['id'])
    fs.remover('r1', f['id'])
    assert fs.listar('r1') == []


@pytest.mark.parametrize('kind', ['estoque', 'pedidos_reposicao', 'despesas', 'movimentacoes_estoque'])
def test_exclusao_preserva_vinculos(db, kind):
    seed(db, 'r1', 'fornecedores', 'f1', {'nome':'Fornecedor'})
    seed(db, 'r1', kind, 'v1', {'fornecedorId':'f1'})
    with pytest.raises(HTTPException) as e: fs.remover('r1', 'f1')
    assert e.value.status_code == 409


def test_despesa_fornecedor_outro_tenant(db):
    seed(db, 'r2', 'fornecedores', 'f1', {'nome':'Outro'})
    with pytest.raises(HTTPException) as e:
        ds.criar('r1', DespesaCreate(categoria='insumo', descricao='Compra', valor=10, data=datetime.now(timezone.utc), fornecedor_id='f1'))
    assert e.value.status_code == 422


def test_paginacao_filtrada_limitada_e_avanca_cursor(db):
    for i in range(8):
        seed(db, 'r1', 'despesas', str(i), {'data':datetime(2026, 10, i+1,tzinfo=timezone.utc),'status':'pago','categoria':'insumo'})
    docs, cursor = ds.listar_paginado('r1', limit=3, status='pendente')
    assert docs == [] and cursor is not None
    docs2, cursor2 = ds.listar_paginado('r1', limit=3, cursor_id=cursor, status='pendente')
    assert docs2 == [] and cursor2 != cursor
