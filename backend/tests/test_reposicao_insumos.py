"""Fluxo de reposição: agrupamento, WhatsApp, histórico, entradas e custo médio."""
from copy import deepcopy

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.models import (
    InventoryItemCreate, InventoryItemUpdate, ItemRecebimentoReposicao,
    ItemReposicao, PedidoReposicaoCreate, ReceberPedidoReposicao,
)
from app.services import reposicao_service as rep, estoque_service as estoque
from tests.conftest import seed, doc_path


RID = 'r1'


def preparar(db, rid=RID):
    db.store.data[f'restaurantes/{rid}/data/configuracoes'] = {
        'nome': 'Café Anis', 'endereco': 'Rua Exemplo, 12, Arujá - SP'
    }
    seed(db, rid, 'fornecedores', 'f1', {
        'nome': 'Fornecedor Café', 'telefone': '11987654321', 'ativo': True,
    })
    seed(db, rid, 'fornecedores', 'f2', {
        'nome': 'Fornecedor Frios', 'telefone': '11999999999', 'ativo': True,
    })
    seed(db, rid, 'estoque', 'cafe', {
        'nome': 'Grãos', 'unidade': 'kg', 'quantidadeAtual': 2.0,
        'minimo': 5.0, 'custoMedio': 20.0, 'fornecedorId': 'f1', 'ativo': True,
    })
    seed(db, rid, 'estoque', 'leite', {
        'nome': 'Leite', 'unidade': 'L', 'quantidadeAtual': 1.0,
        'minimo': 3.0, 'custoMedio': 8.0, 'fornecedorId': 'f1', 'ativo': True,
    })
    seed(db, rid, 'estoque', 'frios', {
        'nome': 'Queijo', 'unidade': 'kg', 'quantidadeAtual': 2.0,
        'minimo': 2.0, 'custoMedio': 30.0, 'fornecedorId': 'f2', 'ativo': True,
    })
    seed(db, rid, 'estoque', 'sem', {
        'nome': 'Pão', 'unidade': 'un', 'quantidadeAtual': 0,
        'minimo': 5, 'custoMedio': 1.0, 'ativo': True,
    })


def criar_pedido(db, rid=RID):
    return rep.criar(rid, 'admin', PedidoReposicaoCreate(
        fornecedor_id='f1',
        itens=[
            ItemReposicao(item_id='cafe', quantidade=3),
            ItemReposicao(item_id='leite', quantidade=2),
        ],
        mensagem='Olá, podem separar os insumos para nossa entrega?',
    ))


def test_candidatos_por_fornecedor_somente_alertas_ativos_e_sem_duplicar(db):
    preparar(db)
    grupos = rep.candidatos(RID)
    assert [(g['fornecedorId'], len(g['itens'])) for g in grupos] == [('f1', 2), ('f2', 1)]
    assert {i['itemId'] for g in grupos for i in g['itens']} == {'cafe', 'leite', 'frios'}
    pedido = criar_pedido(db)
    assert pedido['status'] == 'gerado'
    assert pedido['fornecedorNome'] == 'Fornecedor Café'
    assert pedido['enderecoEntrega'] == 'Rua Exemplo, 12, Arujá - SP'
    assert len(rep.candidatos(RID)) == 1
    assert rep.candidatos(RID)[0]['fornecedorId'] == 'f2'
    with pytest.raises(HTTPException) as ex:
        criar_pedido(db)
    assert ex.value.status_code == 409
    assert estoque.obter_item(RID, 'cafe')['quantidadeAtual'] == 2


def test_reposicao_recebimento_atomico_custo_medio_e_tentativa_duplicada(db):
    preparar(db)
    pedido = criar_pedido(db)
    payload = ReceberPedidoReposicao(itens=[
        ItemRecebimentoReposicao(item_id='cafe', quantidade=4, custo_unitario=30),
        ItemRecebimentoReposicao(item_id='leite', quantidade=2, custo_unitario=10),
    ])
    final = rep.receber(RID, 'admin', pedido['id'], payload)
    assert final['status'] == 'recebido'
    assert final['recebidoPor'] == 'admin'
    assert estoque.obter_item(RID, 'cafe')['quantidadeAtual'] == 6
    assert abs(estoque.obter_item(RID, 'cafe')['custoMedio'] - (2 * 20 + 4 * 30) / 6) < 1e-6
    assert estoque.obter_item(RID, 'leite')['quantidadeAtual'] == 3
    assert abs(estoque.obter_item(RID, 'leite')['custoMedio'] - (1 * 8 + 2 * 10) / 3) < 1e-6
    movs = [d for d in db.store.data.values() if d.get('pedidoReposicaoId') == pedido['id']]
    assert len(movs) == 2
    assert {m['valorTotalCompra'] for m in movs} == {120, 20}
    assert {m['tipo'] for m in movs} == {'entrada'}
    antes = deepcopy(db.store.data)
    with pytest.raises(HTTPException) as ex:
        rep.receber(RID, 'admin', pedido['id'], payload)
    assert ex.value.status_code == 409
    assert db.store.data == antes


def test_receber_com_insumo_a_menos_nao_altera_saldo(db):
    preparar(db)
    p = criar_pedido(db)
    antes = deepcopy(db.store.data)
    with pytest.raises(HTTPException) as ex:
        rep.receber(RID, 'admin', p['id'], ReceberPedidoReposicao(itens=[
            ItemRecebimentoReposicao(item_id='cafe', quantidade=1, custo_unitario=0)
        ]))
    assert ex.value.status_code == 422
    assert db.store.data == antes


def test_cancelar_devolve_insumo_ao_painel_sem_mudar_estoque(db):
    preparar(db)
    p = criar_pedido(db)
    rep.cancelar(RID, 'gerente', p['id'])
    assert rep.obter(RID, p['id'])['status'] == 'cancelado'
    assert len(rep.candidatos(RID)) == 2
    assert estoque.obter_item(RID, 'cafe')['quantidadeAtual'] == 2
    with pytest.raises(HTTPException):
        rep.cancelar(RID, 'gerente', p['id'])


def test_fornecedor_errado_endereco_ausente_e_isolamento_tenant(db):
    preparar(db)
    preparar(db, 'r2')
    estoque.atualizar_item(RID, 'cafe', InventoryItemUpdate(fornecedor_id='f2'))
    assert estoque.obter_item(RID, 'cafe')['fornecedorId'] == 'f2'
    with pytest.raises(HTTPException):
        criar_pedido(db)
    with pytest.raises(HTTPException):
        estoque.atualizar_item(RID, 'cafe', InventoryItemUpdate(fornecedor_id='f-nao-existe'))
    assert estoque.obter_item(RID, 'cafe')['fornecedorId'] == 'f2'
    assert estoque.obter_item('r2', 'cafe')['fornecedorId'] == 'f1'
    db.store.data['restaurantes/r2/data/configuracoes']['endereco'] = ''
    with pytest.raises(HTTPException) as ex:
        criar_pedido(db, 'r2')
    assert ex.value.status_code == 422
    assert estoque.obter_item('r2', 'cafe')['quantidadeAtual'] == 2


def test_novo_insumo_aceita_fornecedor_valido_e_rejeita_outro_tenant(db):
    preparar(db)
    preparar(db, 'r2')
    d = estoque.criar_item(RID, InventoryItemCreate(
        nome='Açúcar', unidade='kg', minimo=2, custo_medio=5,
        fornecedor_id='f1',
    ), 'admin')
    assert d['fornecedorId'] == 'f1'
    seed(db, 'r2', 'fornecedores', 'exclusivo', {'nome': 'Outro', 'ativo': True})
    with pytest.raises(HTTPException) as exc:
        estoque.criar_item(RID, InventoryItemCreate(nome='Teste', unidade='un', fornecedor_id='exclusivo'))
    assert exc.value.status_code == 422


def test_modelos_rejeitam_quantidades_negativas_e_infinitas():
    with pytest.raises(ValidationError):
        ItemReposicao(item_id='a', quantidade=-1)
    with pytest.raises(ValidationError):
        ItemRecebimentoReposicao(item_id='a', quantidade=1, custo_unitario=float('inf'))


def test_nao_exclui_insumo_com_pedido_gerado_mesmo_sem_saldo(db):
    preparar(db)
    p = criar_pedido(db)
    db.store.data[doc_path(RID, 'estoque', 'cafe')]['quantidadeAtual'] = 0
    with pytest.raises(HTTPException) as exc:
        estoque.remover_item(RID, 'cafe')
    assert exc.value.status_code == 409
    assert p['status'] == 'gerado'
    assert estoque.obter_item(RID, 'cafe')['nome'] == 'Grãos'
