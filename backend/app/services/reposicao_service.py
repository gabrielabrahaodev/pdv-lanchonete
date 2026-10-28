"""Reposição de insumos por fornecedor.

Pedidos de compra são distintos de vendas e de movimentos de estoque.
Somente o recebimento confirmado altera saldos e custos; tudo em UMA transação,
com trilha de movimentações, impedindo reabastecimento duplicado.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from google.cloud.firestore import transactional

from app.models.models import PedidoReposicaoCreate, ReceberPedidoReposicao
from app.services import base
from app.services.base import (
    config_doc, executar_transacao, get_item, item_doc, items_col,
    list_items, stamp_create, stamp_update,
)

COL = 'pedidos_reposicao'


def listar(rid: str) -> list[dict]:
    return list_items(rid, COL)


def obter(rid: str, pedido_id: str) -> dict:
    pedido = get_item(rid, COL, pedido_id)
    if not pedido:
        raise HTTPException(404, 'Pedido de reposição não encontrado')
    return pedido


def candidatos(rid: str) -> list[dict]:
    """Somente fornecedores ativos com insumos ativos em saldo <= mínimo.

    Itens com pedido gerado não recebido/cancelado ficam fora da sugestão,
    evitando compras repetidas em paralelo.
    """
    fornecedores = {f['id']: f for f in list_items(rid, 'fornecedores') if f.get('ativo', True)}
    em_aberto = {
        i['itemId']
        for p in listar(rid) if p.get('status') == 'gerado'
        for i in p.get('itens', [])
    }
    agrupados: dict[str, dict] = {}
    for item in list_items(rid, 'estoque'):
        fid = item.get('fornecedorId')
        if (
            not fid or fid not in fornecedores or item.get('ativo') is False
            or item['id'] in em_aberto
            or float(item.get('quantidadeAtual', 0)) > float(item.get('minimo', 0))
        ):
            continue
        fornecedor = fornecedores[fid]
        grupo = agrupados.setdefault(fid, {
            'fornecedorId': fid,
            'fornecedorNome': fornecedor.get('nome', ''),
            'telefone': fornecedor.get('telefone') or '',
            'itens': [],
        })
        grupo['itens'].append({
            'itemId': item['id'],
            'nome': item.get('nome', ''),
            'unidade': item.get('unidade', 'un'),
            'saldo': item.get('quantidadeAtual', 0),
            'minimo': item.get('minimo', 0),
            'custoMedio': item.get('custoMedio', 0),
        })
    return sorted(agrupados.values(), key=lambda g: g['fornecedorNome'].casefold())


def criar(rid: str, uid: str, payload: PedidoReposicaoCreate) -> dict:
    ids = [i.item_id for i in payload.itens]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, 'Um mesmo insumo não pode ser repetido')
    ref = items_col(rid, COL).document()

    @transactional
    def _exec(t):
        fornecedor = next(iter(t.get(item_doc(rid, 'fornecedores', payload.fornecedor_id))), None)
        if not fornecedor or not fornecedor.exists or (fornecedor.to_dict() or {}).get('ativo') is False:
            raise HTTPException(422, 'Fornecedor não encontrado ou inativo')
        config = next(iter(t.get(config_doc(rid))), None)
        endereco = ((config.to_dict() or {}).get('endereco') or '').strip() if config and config.exists else ''
        if not endereco:
            raise HTTPException(422, 'Cadastre o endereço do restaurante nas Configurações')
        itens_refs = [item_doc(rid, 'estoque', iid) for iid in ids]
        snaps = [next(iter(t.get(ref_item)), None) for ref_item in itens_refs]
        if any(not snap or not snap.exists for snap in snaps):
            raise HTTPException(409, 'Um insumo foi removido. Atualize a lista')
        ativos = list(t.get(items_col(rid, COL).where('status', '==', 'gerado')))
        bloqueados = {i.get('itemId') for p in ativos for i in (p.to_dict() or {}).get('itens', [])}
        itens = []
        for linha, snap in zip(payload.itens, snaps):
            data = snap.to_dict() or {}
            if data.get('ativo') is False or data.get('fornecedorId') != payload.fornecedor_id:
                raise HTTPException(409, 'O fornecedor ou o cadastro do insumo mudou')
            if float(data.get('quantidadeAtual', 0)) > float(data.get('minimo', 0)):
                raise HTTPException(409, 'Um insumo deixou de estar em alerta. Atualize a lista')
            if linha.item_id in bloqueados:
                raise HTTPException(409, 'Esse insumo já tem pedido de reposição pendente')
            itens.append({
                'itemId': linha.item_id, 'nome': data['nome'],
                'unidade': data['unidade'], 'quantidade': linha.quantidade,
                'custoUnitarioPrevisto': data.get('custoMedio', 0),
                'saldoNaSolicitacao': data.get('quantidadeAtual', 0),
            })
        # TODAS as leituras anteriores às escritas.
        t.set(ref, stamp_create({
            'restaurantId': rid, 'fornecedorId': payload.fornecedor_id,
            'fornecedorNome': (fornecedor.to_dict() or {}).get('nome', ''),
            'telefone': (fornecedor.to_dict() or {}).get('telefone') or '',
            'enderecoEntrega': endereco,
            'mensagem': payload.mensagem, 'itens': itens, 'status': 'gerado',
            'usuarioId': uid, 'origem': 'whatsapp_nao_confirmado',
        }))
        return ref.id

    pedido_id = executar_transacao(_exec)
    return obter(rid, pedido_id)


def cancelar(rid: str, uid: str, pedido_id: str) -> dict:
    ref = item_doc(rid, COL, pedido_id)

    @transactional
    def _exec(t):
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, 'Pedido não encontrado')
        if (snap.to_dict() or {}).get('status') != 'gerado':
            raise HTTPException(409, 'Somente pedidos gerados podem ser cancelados')
        t.update(ref, stamp_update({'status': 'cancelado', 'canceladoPor': uid, 'canceladoEm': base.now_utc()}))

    executar_transacao(_exec)
    return obter(rid, pedido_id)


def receber(rid: str, uid: str, pedido_id: str, payload: ReceberPedidoReposicao) -> dict:
    linhas = {item.item_id: item for item in payload.itens}
    if len(linhas) != len(payload.itens):
        raise HTTPException(422, 'Insumo duplicado no recebimento')
    ref = item_doc(rid, COL, pedido_id)

    @transactional
    def _exec(t):
        pedido_snap = next(iter(t.get(ref)), None)
        if not pedido_snap or not pedido_snap.exists:
            raise HTTPException(404, 'Pedido de reposição não encontrado')
        pedido = pedido_snap.to_dict() or {}
        if pedido.get('status') != 'gerado':
            raise HTTPException(409, 'Pedido já recebido ou cancelado; nenhuma entrada duplicada')
        salvos = pedido.get('itens', [])
        ids = [s['itemId'] for s in salvos]
        if len(set(ids)) != len(ids) or set(ids) != set(linhas):
            raise HTTPException(422, 'Informe a quantidade e custo de todos os insumos do pedido')
        refs = [item_doc(rid, 'estoque', iid) for iid in ids]
        snaps = [next(iter(t.get(item_ref)), None) for item_ref in refs]
        if any(not s or not s.exists for s in snaps):
            raise HTTPException(409, 'Insumo removido. Não é possível receber este pedido')
        updates = []
        for salvo, item_ref, snap in zip(salvos, refs, snaps):
            item = snap.to_dict() or {}
            if item.get('ativo') is False:
                raise HTTPException(409, 'Reative o insumo arquivado antes de receber')
            if item.get('unidade') != salvo.get('unidade'):
                raise HTTPException(409, 'Unidade do insumo mudou após gerar pedido')
            linha = linhas[salvo['itemId']]
            qtd = Decimal(str(linha.quantidade))
            custo_unit = Decimal(str(linha.custo_unitario))
            saldo = Decimal(str(item.get('quantidadeAtual', 0)))
            custo_anterior = Decimal(str(item.get('custoMedio', 0)))
            base_valorizada = max(saldo, Decimal(0))
            novo_custo = ((base_valorizada * custo_anterior + qtd * custo_unit) /
                         (base_valorizada + qtd)).quantize(Decimal('0.00000001'), rounding=ROUND_HALF_UP)
            novo_saldo = round(float(saldo + qtd), 3)
            updates.append((salvo, item_ref, item, linha, novo_saldo, float(novo_custo)))

        # Transação única: uma entrada por insumo, nova média e baixa do pedido.
        recebidos = []
        for salvo, item_ref, item, linha, saldo, custo in updates:
            mov_ref = items_col(rid, 'movimentacoes_estoque').document()
            total = round(linha.quantidade * linha.custo_unitario, 2)
            t.set(mov_ref, stamp_create({
                'tipo': 'entrada', 'itemId': salvo['itemId'], 'qtd': linha.quantidade,
                'saldoApos': saldo, 'unidade': item['unidade'],
                'quantidadeCompra': linha.quantidade, 'unidadeCompra': item['unidade'],
                'valorTotalCompra': total, 'custoUnitario': item.get('custoMedio', 0),
                'custoMedioApos': custo, 'usuarioId': uid, 'restaurantId': rid,
                'pedidoReposicaoId': pedido_id,
                'observacao': f'Recebimento da reposição {pedido_id}',
            }))
            t.update(item_ref, stamp_update({'quantidadeAtual': saldo, 'custoMedio': custo}))
            recebidos.append({
                'itemId': salvo['itemId'], 'nome': salvo['nome'],
                'unidade': item['unidade'], 'quantidade': linha.quantidade,
                'custoUnitario': linha.custo_unitario, 'valorTotal': total,
                'movimentacaoId': mov_ref.id,
            })
        t.update(ref, stamp_update({
            'status': 'recebido', 'recebidoEm': base.now_utc(),
            'recebidoPor': uid, 'recebimento': recebidos,
        }))

    executar_transacao(_exec)
    return obter(rid, pedido_id)
