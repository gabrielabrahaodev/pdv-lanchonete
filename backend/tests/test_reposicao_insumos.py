"""Fluxo de reposição: agrupamento, WhatsApp, histórico, entradas e custo médio."""
from copy import deepcopy
from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.models import (
    InventoryItemCreate, InventoryItemUpdate, ItemRecebimentoReposicao,
    ItemReposicao, PedidoReposicaoCreate, ReceberPedidoReposicao, DespesaUpdate,
)
from app.services import reposicao_service as rep, estoque_service as estoque
from app.services import despesas_service as despesas
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
    payload = ReceberPedidoReposicao(data_recebimento=date(2026, 9, 20), itens=[
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
    assert final['dataRecebimentoLocal'] == '2026-09-20'
    assert final['valorTotalRecebido'] == 140
    assert final['despesaId'] == f"reposicao_{pedido['id']}"
    debito = despesas.obter(RID, final['despesaId'])
    assert debito['categoria'] == 'insumo'
    assert debito['status'] == 'pendente'
    assert debito['valor'] == 140
    assert debito['fornecedorId'] == 'f1'
    assert debito['pedidoReposicaoId'] == pedido['id']
    assert debito['data'].astimezone(timezone.utc).date() == date(2026, 9, 20)
    assert len([d for d in despesas.listar(RID) if d.get('pedidoReposicaoId') == pedido['id']]) == 1
    assert db.store.data[f'restaurantes/{RID}/data/agregados_diarios/items/2026-09-20']['totalDespesas'] == 140
    assert db.store.data[f'restaurantes/{RID}/data/agregados_mensais/items/2026-09']['despesasPorCategoria']['insumo'] == 140
    movs = [d for d in db.store.data.values() if d.get('pedidoReposicaoId') == pedido['id'] and d.get('tipo') == 'entrada']
    assert len(movs) == 2
    assert {m['valorTotalCompra'] for m in movs} == {120, 20}
    assert {m['tipo'] for m in movs} == {'entrada'}
    assert all(m['dataMovimentacao'] == debito['data'] for m in movs)
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
        rep.receber(RID, 'admin', p['id'], ReceberPedidoReposicao(data_recebimento=date(2026, 9, 20), itens=[
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


def test_despesa_automatica_pode_ser_paga_mas_nao_editada_ou_excluida(db):
    preparar(db)
    pedido = criar_pedido(db)
    recebido = rep.receber(RID, 'admin', pedido['id'], ReceberPedidoReposicao(
        data_recebimento=date(2026, 9, 21),
        itens=[
            ItemRecebimentoReposicao(item_id='cafe', quantidade=1, custo_unitario=30),
            ItemRecebimentoReposicao(item_id='leite', quantidade=1, custo_unitario=10),
        ],
    ))
    did = recebido['despesaId']
    with pytest.raises(HTTPException) as exc:
        despesas.atualizar(RID, did, DespesaUpdate(valor=99))
    assert exc.value.status_code == 409
    with pytest.raises(HTTPException) as exc:
        despesas.remover(RID, did)
    assert exc.value.status_code == 409
    despesas.marcar_pago(RID, did, None)
    assert despesas.obter(RID, did)['status'] == 'pago'
    assert despesas.obter(RID, did)['valor'] == 40
    assert recebido['valorTotalRecebido'] == 40
    despesas.atualizar(RID, did, DespesaUpdate(ativo_pago=False))
    assert despesas.obter(RID, did)['status'] == 'pendente'


def test_data_futura_e_valor_total_zero_nao_gravam_estoque_ou_financeiro(db):
    preparar(db)
    pedido = criar_pedido(db)
    original = deepcopy(db.store.data)
    itens = [
        ItemRecebimentoReposicao(item_id='cafe', quantidade=1, custo_unitario=25),
        ItemRecebimentoReposicao(item_id='leite', quantidade=1, custo_unitario=5),
    ]
    with pytest.raises(HTTPException) as exc:
        rep.receber(RID, 'admin', pedido['id'], ReceberPedidoReposicao(
            data_recebimento=date(2099, 1, 1), itens=itens
        ))
    assert exc.value.status_code == 422
    assert db.store.data == original
    with pytest.raises(HTTPException) as exc:
        rep.receber(RID, 'admin', pedido['id'], ReceberPedidoReposicao(
            data_recebimento=date(2026, 9, 15),
            itens=[ItemRecebimentoReposicao(item_id=i.item_id, quantidade=i.quantidade, custo_unitario=0) for i in itens],
        ))
    assert exc.value.status_code == 422
    assert db.store.data == original


def test_debito_da_reposicao_nao_afeta_outro_restaurante(db):
    preparar(db)
    preparar(db, 'r2')
    pedido = criar_pedido(db, 'r2')
    recebido = rep.receber('r2', 'admin-r2', pedido['id'], ReceberPedidoReposicao(
        data_recebimento=date(2026, 9, 22),
        itens=[
            ItemRecebimentoReposicao(item_id='cafe', quantidade=2, custo_unitario=22),
            ItemRecebimentoReposicao(item_id='leite', quantidade=3, custo_unitario=7),
        ],
    ))
    assert despesas.obter('r2', recebido['despesaId'])['valor'] == 65
    assert despesas.listar(RID) == []
    assert f'restaurantes/{RID}/data/agregados_mensais/items/2026-09' not in db.store.data


def test_payload_recebimento_rejeita_data_invalida():
    itens = [ItemRecebimentoReposicao(item_id='cafe', quantidade=1, custo_unitario=2)]
    for invalid in ['2026-02-30', '', 'ontem']:
        with pytest.raises(ValidationError):
            ReceberPedidoReposicao(data_recebimento=invalid, itens=itens)


def test_reposicao_gramas_recebe_quilos_valor_total_e_gera_debito_exato(db):
    preparar(db)
    db.store.data[doc_path(RID, 'estoque', 'cafe')].update({
        'unidade': 'g', 'unidadeCompra': 'kg',
        'quantidadeAtual': 200, 'minimo': 500, 'custoMedio': 0.008,
    })
    p = criar_pedido(db)
    result = rep.receber(RID, 'admin', p['id'], ReceberPedidoReposicao(
        data_recebimento=date(2026, 9, 23),
        itens=[
            ItemRecebimentoReposicao(item_id='cafe', quantidade_compra=2,
                                    unidade_compra='kg', valor_total_compra=16),
            ItemRecebimentoReposicao(item_id='leite', quantidade_compra=2,
                                    unidade_compra='L', valor_total_compra=20),
        ],
    ))
    item = estoque.obter_item(RID, 'cafe')
    assert item['quantidadeAtual'] == 2200
    assert item['custoMedio'] == pytest.approx(0.008)
    assert result['valorTotalRecebido'] == 36
    assert despesas.obter(RID, result['despesaId'])['valor'] == 36
    entrada = next(d for d in db.store.data.values()
                   if d.get('pedidoReposicaoId') == p['id'] and d.get('itemId') == 'cafe' and d.get('tipo') == 'entrada')
    assert entrada['qtd'] == 2000
    assert entrada['quantidadeCompra'] == 2
    assert entrada['unidadeCompra'] == 'kg'
    assert entrada['valorTotalCompra'] == 16
    assert entrada['custoMedioApos'] == pytest.approx(0.008)
    assert result['recebimento'][0]['quantidadeCompra'] == 2
    assert result['recebimento'][0]['unidadeCompra'] == 'kg'
    antes = deepcopy(db.store.data)
    with pytest.raises(HTTPException) as exc:
        rep.receber(RID, 'admin', p['id'], ReceberPedidoReposicao(
            data_recebimento=date(2026, 9, 23),
            itens=[
                ItemRecebimentoReposicao(item_id='cafe', quantidade_compra=2, unidade_compra='kg', valor_total_compra=16),
                ItemRecebimentoReposicao(item_id='leite', quantidade_compra=2, unidade_compra='L', valor_total_compra=20),
            ],
        ))
    assert exc.value.status_code == 409
    assert db.store.data == antes


def test_reposicao_pacote_convertido_e_custo_pouco_maior_que_zero(db):
    preparar(db)
    db.store.data[doc_path(RID, 'estoque', 'cafe')].update({
        'unidade': 'g', 'unidadeCompra': 'pct', 'fatorCompra': 500,
        'quantidadeAtual': 100, 'minimo': 500, 'custoMedio': 0.007,
    })
    p = criar_pedido(db)
    resultado = rep.receber(RID, 'admin', p['id'], ReceberPedidoReposicao(
        data_recebimento=date(2026, 9, 23),
        itens=[
            ItemRecebimentoReposicao(item_id='cafe', quantidade_compra=3,
                                    unidade_compra='pct', valor_total_compra=12),
            ItemRecebimentoReposicao(item_id='leite', quantidade_compra=1,
                                    unidade_compra='L', valor_total_compra=8),
        ],
    ))
    assert resultado['valorTotalRecebido'] == 20
    assert estoque.obter_item(RID, 'cafe')['quantidadeAtual'] == 1600
    assert estoque.obter_item(RID, 'cafe')['custoMedio'] == pytest.approx(12.7 / 1600)
    item_mov = next(m for m in db.store.data.values() if m.get('pedidoReposicaoId') == p['id'] and m.get('itemId') == 'cafe' and m.get('tipo') == 'entrada')
    assert item_mov['quantidadeCompra'] == 3
    assert item_mov['unidadeCompra'] == 'pct'
    assert item_mov['qtd'] == 1500


def test_reposicao_compra_rejeita_incompatibilidade_e_mistura_de_contratos_sem_movimentos(db):
    preparar(db)
    p = criar_pedido(db)
    antiga = deepcopy(db.store.data)
    cenarios = [
        ItemRecebimentoReposicao(item_id='cafe', quantidade_compra=2, unidade_compra='L', valor_total_compra=16),
        ItemRecebimentoReposicao(item_id='cafe', quantidade_compra=2, unidade_compra='kg', valor_total_compra=16, custo_unitario=4),
        ItemRecebimentoReposicao(item_id='cafe', quantidade_compra=2, unidade_compra='kg', valor_total_compra=16.001),
    ]
    for linha in cenarios:
        with pytest.raises(HTTPException) as exc:
            rep.receber(RID, 'admin', p['id'], ReceberPedidoReposicao(
                data_recebimento=date(2026, 9, 23),
                itens=[linha, ItemRecebimentoReposicao(item_id='leite', quantidade_compra=1, unidade_compra='L', valor_total_compra=8)],
            ))
        assert exc.value.status_code == 422
        assert db.store.data == antiga


def test_fator_da_embalagem_alterado_apos_pedido_impede_recebimento_incorreto(db):
    preparar(db)
    db.store.data[doc_path(RID, 'estoque', 'cafe')].update({
        'unidade': 'g', 'unidadeCompra': 'pct', 'fatorCompra': 500,
        'quantidadeAtual': 100, 'minimo': 500, 'custoMedio': 0.008,
    })
    pedido = criar_pedido(db)
    db.store.data[doc_path(RID, 'estoque', 'cafe')]['fatorCompra'] = 600
    antes = deepcopy(db.store.data)
    with pytest.raises(HTTPException) as exc:
        rep.receber(RID, 'admin', pedido['id'], ReceberPedidoReposicao(
            data_recebimento=date(2026, 9, 24),
            itens=[
                ItemRecebimentoReposicao(item_id='cafe', quantidade_compra=2, unidade_compra='pct', valor_total_compra=16),
                ItemRecebimentoReposicao(item_id='leite', quantidade_compra=1, unidade_compra='L', valor_total_compra=8),
            ],
        ))
    assert exc.value.status_code == 409
    assert db.store.data == antes
