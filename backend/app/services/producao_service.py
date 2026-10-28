"""Produção em lotes: ingredientes → prontos → reserva → entrega.

Todas as operações físicas são transacionais. Planejamento lê todos os lotes
antes de devolver uma função que apenas escreve (compatível com pedidos).
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from fastapi import HTTPException
from google.cloud.firestore import transactional

from app.core.firebase import get_db
from app.models.models import ProducaoCreate, PerdaProducao, ConversaoProducao
from app.services.base import (item_doc, items_col, get_item, list_items_paginado,
                               now_utc, stamp_create, stamp_update, doc_to_dict)


def _data(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _ler(t, ref, mensagem="Registro não encontrado"):
    snap = next(iter(t.get(ref)), None)
    if not snap or not snap.exists:
        raise HTTPException(404, mensagem)
    return dict(snap.to_dict() or {})


def _evento(t, rid, chave, operacao, corpo):
    ref = item_doc(rid, "eventos_producao", chave)
    fingerprint = hashlib.sha256(json.dumps([operacao, corpo], sort_keys=True, default=str).encode()).hexdigest()
    snap = next(iter(t.get(ref)), None)
    if snap and snap.exists:
        dado = snap.to_dict() or {}
        if dado.get('fingerprint') != fingerprint:
            raise HTTPException(409, "Chave de operação já utilizada com outros dados")
        return ref, fingerprint, dado['loteId']
    return ref, fingerprint, None


def _mov(t, rid, uid, tipo, lote_id, produto_id, quantidade, **extra):
    ref = items_col(rid, 'movimentacoes_producao').document()
    t.set(ref, stamp_create({'tipo': tipo, 'loteId': lote_id, 'produtoId': produto_id,
                            'quantidade': quantidade, 'usuarioId': uid, 'restaurantId': rid, **extra}))


def _lote(rid, produto, produto_id, quantidade, custo, validade, local, uid, **extra):
    return stamp_create({'restaurantId': rid, 'produtoId': produto_id, 'produtoNome': produto['nome'],
                         'unidade': produto.get('unidadeVenda', 'un'), 'quantidadeProduzida': quantidade,
                         'saldo': quantidade, 'reservado': 0, 'aberto': True, 'custoTotal': round(custo, 6),
                         'custoUnitario': round(custo / quantidade, 8), 'validade': _data(validade),
                         'local': local, 'usuarioId': uid, **extra})


def listar(rid):
    agora = now_utc()
    docs = [doc_to_dict(s) for s in items_col(rid, 'lotes_producao').where('aberto', '==', True).stream()]
    for d in docs:
        d['vencido'] = _data(d['validade']) <= agora
        d['disponivel'] = 0 if d['vencido'] else max(0, d['saldo'] - d.get('reservado', 0))
    return sorted(docs, key=lambda d: (_data(d['validade']), d['id']))


def historico(rid, limit=50, cursor=None):
    return list_items_paginado(rid, 'movimentacoes_producao', limit=limit, cursor_id=cursor)


def produzir(rid: str, uid: str, payload: ProducaoCreate, chave: str):
    ref = items_col(rid, 'lotes_producao').document()
    @transactional
    def executar(t):
        evento, fingerprint, existente = _evento(t, rid, chave, 'produzir', payload.model_dump())
        if existente:
            return existente
        produto = _ler(t, item_doc(rid, 'produtos', payload.produto_id), 'Produto não encontrado')
        if produto.get('modoEstoque') != 'antecipado' or not produto.get('ativo', True):
            raise HTTPException(409, 'Selecione um produto ativo de produção antecipada')
        if _data(payload.validade) <= now_utc():
            raise HTTPException(422, 'A validade precisa estar no futuro')
        receita = produto.get('ingredientes') or []
        if not receita:
            raise HTTPException(422, 'Cadastre a receita antes de produzir')
        consumo = {}
        for ing in receita:
            qtd = float(ing.get('qtd', 0)) * payload.receitas
            if not ing.get('itemId') or not 0 < qtd < float('inf'):
                raise HTTPException(422, 'Receita contém ingrediente inválido')
            consumo[ing['itemId']] = consumo.get(ing['itemId'], 0) + qtd
        if len(consumo) > 100:
            raise HTTPException(422, 'Receita excede 100 ingredientes')
        estoques, custo, componentes = [], 0.0, []
        for iid, qtd in sorted(consumo.items()):
            er = item_doc(rid, 'estoque', iid)
            e = _ler(t, er, 'Ingrediente não encontrado no estoque')
            unitario = float(e.get('custoMedio', 0))
            if not 0 <= unitario < float('inf'):
                raise HTTPException(422, 'Custo do ingrediente inválido')
            qtd = round(qtd, 3)
            if qtd <= 0:
                raise HTTPException(422, 'Consumo menor que a precisão do estoque (0,001)')
            custo += qtd * unitario
            componentes.append({'itemId': iid, 'nome': e.get('nome'), 'qtd': qtd, 'custoUnitario': unitario})
            estoques.append((er, iid, qtd, round(float(e.get('quantidadeAtual', 0)) - qtd, 3)))
        # Produção é lançamento explícito: consome receita mesmo com a automação de pedidos desligada.
        for er, iid, qtd, saldo in estoques:
            t.update(er, stamp_update({'quantidadeAtual': saldo}))
            mr = items_col(rid, 'movimentacoes_estoque').document()
            t.set(mr, stamp_create({'tipo':'saida', 'itemId':iid, 'qtd':qtd, 'saldoApos':saldo,
                                   'producaoId':ref.id, 'usuarioId':uid, 'restaurantId':rid,
                                   'observacao':f'Produção de {produto["nome"]} — lote {ref.id}'}))
        t.set(ref, _lote(rid, produto, payload.produto_id, payload.quantidade, custo,
                        payload.validade, payload.local, uid, receitas=payload.receitas,
                        rendimentoPrevisto=produto.get('rendimentoReceita', 1) * payload.receitas,
                        ingredientes=componentes, observacao=payload.observacao))
        _mov(t, rid, uid, 'producao', ref.id, payload.produto_id, payload.quantidade, custoTotal=round(custo, 6))
        t.set(evento, {'fingerprint':fingerprint, 'loteId':ref.id})
        return ref.id
    return get_item(rid, 'lotes_producao', executar(get_db().transaction()))


def registrar_perda(rid, uid, lote_id, payload: PerdaProducao, chave):
    ref = item_doc(rid, 'lotes_producao', lote_id)
    @transactional
    def executar(t):
        evento, fp, existente = _evento(t, rid, chave, 'perda', [lote_id, payload.model_dump()])
        if existente:
            return
        lote = _ler(t, ref, 'Lote não encontrado')
        livre = lote['saldo'] - lote.get('reservado', 0)
        if payload.quantidade > livre:
            raise HTTPException(409, 'Quantidade excede o saldo não reservado. Libere as reservas antes de registrar a perda.')
        saldo = lote['saldo'] - payload.quantidade
        t.update(ref, stamp_update({'saldo':saldo, 'aberto':saldo > 0}))
        _mov(t, rid, uid, 'perda', lote_id, lote['produtoId'], payload.quantidade,
             motivo=payload.motivo, observacao=payload.observacao,
             custoTotal=round(lote['custoUnitario'] * payload.quantidade, 6))
        t.set(evento, {'fingerprint':fp, 'loteId':lote_id})
    executar(get_db().transaction())
    return get_item(rid, 'lotes_producao', lote_id)


def converter(rid, uid, lote_id, payload: ConversaoProducao, chave):
    origem = item_doc(rid, 'lotes_producao', lote_id)
    destino = items_col(rid, 'lotes_producao').document()
    @transactional
    def executar(t):
        evento, fp, existente = _evento(t, rid, chave, 'conversao', [lote_id, payload.model_dump()])
        if existente:
            return existente
        lote = _ler(t, origem, 'Lote não encontrado')
        produto = _ler(t, item_doc(rid, 'produtos', payload.produto_destino_id), 'Produto destino não encontrado')
        if produto.get('modoEstoque') != 'antecipado' or not produto.get('ativo', True):
            raise HTTPException(409, 'Destino deve ser um produto ativo de produção antecipada')
        if lote['produtoId'] == payload.produto_destino_id:
            raise HTTPException(422, 'Selecione outra apresentação do produto')
        if _data(lote['validade']) <= now_utc():
            raise HTTPException(409, 'Lote vencido não pode ser convertido')
        if payload.quantidade_origem > lote['saldo'] - lote.get('reservado', 0):
            raise HTTPException(409, 'Saldo disponível insuficiente para converter')
        custo = lote['custoUnitario'] * payload.quantidade_origem
        saldo = lote['saldo'] - payload.quantidade_origem
        t.update(origem, stamp_update({'saldo':saldo, 'aberto':saldo > 0}))
        t.set(destino, _lote(rid, produto, payload.produto_destino_id, payload.quantidade_destino,
                            custo, lote['validade'], lote['local'], uid, loteOrigemId=lote_id))
        _mov(t, rid, uid, 'conversao_saida', lote_id, lote['produtoId'], payload.quantidade_origem,
             observacao=payload.observacao, loteDestinoId=destino.id, custoTotal=round(custo, 6))
        _mov(t, rid, uid, 'conversao_entrada', destino.id, payload.produto_destino_id,
             payload.quantidade_destino, loteOrigemId=lote_id, custoTotal=round(custo, 6))
        t.set(evento, {'fingerprint':fp, 'loteId':destino.id})
        return destino.id
    return get_item(rid, 'lotes_producao', executar(get_db().transaction()))


def planejar_reservas(t, rid, pedido_id, itens, uid, liberar=None):
    """Muta apenas os novos itens em memória e retorna uma fase só de escrita."""
    lotes, mudancas, movimentos = {}, {}, []
    for item in itens:
        if item.get('modoEstoque') != 'antecipado':
            continue
        pid = item['produtoId']
        if pid not in lotes:
            snaps = t.get(items_col(rid, 'lotes_producao').where('produtoId', '==', pid).where('aberto', '==', True))
            lotes[pid] = [(s.reference, dict(s.to_dict() or {})) for s in snaps]
            for lr, ld in lotes[pid]:
                ld['reservado'] = ld.get('reservado', 0) - (liberar or {}).get(lr.id, 0)
            lotes[pid].sort(key=lambda x: (_data(x[1]['validade']), x[0].id))
        restante, alocacoes = item['qtd'], []
        for ref, lote in lotes[pid]:
            if _data(lote['validade']) <= now_utc():
                continue
            disponivel = lote['saldo'] - lote.get('reservado', 0)
            qtd = min(restante, disponivel)
            if qtd <= 0:
                continue
            lote['reservado'] = lote.get('reservado', 0) + qtd
            mudancas[ref.id] = (ref, {'reservado':lote['reservado']})
            alocacoes.append({'loteId':ref.id, 'qtd':qtd, 'custoUnitario':lote['custoUnitario']})
            movimentos.append((ref.id, pid, qtd))
            restante -= qtd
            if restante == 0:
                break
        if restante:
            raise HTTPException(409, f'Estufa: saldo disponível insuficiente para {item.get("produtoNome", pid)}')
        item['lotesReservados'] = alocacoes
        item['custoProducao'] = round(sum(a['qtd'] * a['custoUnitario'] for a in alocacoes), 6)
    if len(mudancas) + len(movimentos) > 200:
        raise HTTPException(422, 'Lote de pedido muito grande; divida o lançamento')
    def gravar():
        for ref, data in mudancas.values():
            t.update(ref, stamp_update(data))
        for lid, pid, qtd in movimentos:
            _mov(t, rid, uid, 'reserva', lid, pid, qtd, pedidoId=pedido_id)
    return gravar


def planejar_destino(t, rid, pedido_id, itens, acao, uid):
    """Libera reservas ou entrega. Não devolve ao estoque produtos já entregues."""
    lotes, movimentos = {}, []
    for item in itens:
        if item.get('modoEstoque') != 'antecipado' or item.get('estoqueEntregueEm') or item.get('reservaLiberadaEm'):
            continue
        for a in item.get('lotesReservados', []):
            lid = a['loteId']
            if lid not in lotes:
                ref = item_doc(rid, 'lotes_producao', lid)
                lotes[lid] = (ref, _ler(t, ref, 'Lote reservado não encontrado'))
            ref, lote = lotes[lid]
            if acao == 'entrega' and _data(lote['validade']) <= now_utc():
                raise HTTPException(409, 'O lote reservado venceu. Solicite a troca da reserva antes de entregar.')
            if lote.get('reservado', 0) < a['qtd'] or lote['saldo'] < a['qtd']:
                raise HTTPException(409, 'Saldo reservado inconsistente; revise o lote')
            lote['reservado'] -= a['qtd']
            if acao in {'entrega', 'consumo_conferencia'}:
                lote['saldo'] -= a['qtd']
            movimentos.append((lid, item['produtoId'], a['qtd']))
        item['estoqueEntregueEm' if acao == 'entrega' else 'baixaConferenciaEm' if acao == 'consumo_conferencia' else 'reservaLiberadaEm'] = now_utc()
    def gravar():
        for ref, l in lotes.values():
            t.update(ref, stamp_update({'saldo':l['saldo'], 'reservado':l['reservado'], 'aberto':l['saldo'] > 0}))
        for lid, pid, qtd in movimentos:
            _mov(t, rid, uid, acao, lid, pid, qtd, pedidoId=pedido_id)
    return gravar
