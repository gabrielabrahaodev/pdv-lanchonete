"""Reposição de insumos por fornecedor.

Pedidos de compra são distintos de vendas e de movimentos de estoque.
Somente o recebimento confirmado altera saldos e custos; tudo em UMA transação,
com trilha de movimentações, impedindo reabastecimento duplicado.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from google.cloud.firestore import transactional

from app.models.models import PedidoReposicaoCreate, ReceberPedidoReposicao
from app.core.config import settings
from app.services import agregados_service
from app.services import base
from app.services.unidades import quantidade_controle, custo_medio_entrada
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
            'unidadeCompra': item.get('unidadeCompra') or item.get('unidade', 'un'),
            'fatorCompra': item.get('fatorCompra'),
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
                'unidadeCompra': data.get('unidadeCompra') or data['unidade'],
                'fatorCompra': data.get('fatorCompra'),
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
    # Meio-dia no fuso configurado representa a data civil sem deslocá-la
    # para ontem/amanhã ao converter para UTC (regra já usada no Financeiro).
    local_tz = ZoneInfo(settings.timezone)
    hoje_local = base.now_utc().astimezone(local_tz).date()
    if payload.data_recebimento > hoje_local:
        raise HTTPException(422, 'A data do recebimento não pode estar no futuro')
    competencia = datetime.combine(payload.data_recebimento, time(12, 0), tzinfo=local_tz).astimezone(timezone.utc)
    ref = item_doc(rid, COL, pedido_id)
    # Referência determinística: a mesma reposição só pode gerar uma despesa.
    despesa_ref = item_doc(rid, 'despesas', f'reposicao_{pedido_id}')

    @transactional
    def _exec(t):
        pedido_snap = next(iter(t.get(ref)), None)
        if not pedido_snap or not pedido_snap.exists:
            raise HTTPException(404, 'Pedido de reposição não encontrado')
        pedido = pedido_snap.to_dict() or {}
        if pedido.get('status') != 'gerado':
            raise HTTPException(409, 'Pedido já recebido ou cancelado; nenhuma entrada duplicada')
        despesa_anterior = next(iter(t.get(despesa_ref)), None)
        if despesa_anterior and despesa_anterior.exists:
            raise HTTPException(409, 'Despesa da reposição já existe; recebimento não foi duplicado')
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
            # Pedidos novos guardam o fator original de cada embalagem.
            # Se o fator foi alterado, não receber caixas com conversão diferente
            # da exibida ao operador: exigir correção do cadastro antes.
            if (linha.valor_total_compra is not None and linha.unidade_compra in ('cx', 'pct')
                    and 'fatorCompra' in salvo
                    and (salvo.get('unidadeCompra') != item.get('unidadeCompra')
                         or salvo.get('fatorCompra') != item.get('fatorCompra'))):
                raise HTTPException(409, 'A configuração da embalagem mudou após gerar o pedido. Revise antes de receber')
            saldo = Decimal(str(item.get('quantidadeAtual', 0)))
            custo_anterior = Decimal(str(item.get('custoMedio', 0)))
            if linha.valor_total_compra is not None:
                # Entrada nova: custo em REAIS pela compra completa.
                if (linha.quantidade is not None or linha.custo_unitario is not None
                        or linha.quantidade_compra is None or not linha.unidade_compra):
                    raise HTTPException(422, 'Informe quantidade, unidade e valor total da compra, sem custo por grama')
                compra_qtd = linha.quantidade_compra
                compra_unidade = linha.unidade_compra
                qtd = Decimal(str(quantidade_controle(compra_qtd, compra_unidade, item)))
                total = Decimal(str(linha.valor_total_compra))
                novo_custo = custo_medio_entrada(saldo, custo_anterior, qtd, total)
                custo_unit = total / qtd
            else:
                # Compatibilidade: pedidos recebidos por clientes antigos.
                if (linha.quantidade is None or linha.custo_unitario is None
                        or linha.quantidade_compra is not None or linha.unidade_compra is not None):
                    raise HTTPException(422, 'Dados de compra incompletos')
                qtd = Decimal(str(linha.quantidade))
                custo_unit = Decimal(str(linha.custo_unitario))
                compra_qtd = linha.quantidade
                compra_unidade = item['unidade']
                total = (qtd * custo_unit).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                base_valorizada = max(saldo, Decimal(0))
                novo_custo = float(((base_valorizada * custo_anterior + qtd * custo_unit) /
                                   (base_valorizada + qtd)).quantize(Decimal('0.00000001'), rounding=ROUND_HALF_UP))
            novo_saldo = round(float(saldo + qtd), 3)
            updates.append((salvo, item_ref, item, novo_saldo, novo_custo,
                            qtd, total, compra_qtd, compra_unidade, custo_unit))

        # Valor total REAL da compra gera débito no Financeiro, sem arredondar
        # primeiro o custo por g/ml (que pode ser menor que um centavo).
        total_despesa = sum((u[6] for u in updates), Decimal(0))
        if total_despesa <= 0:
            raise HTTPException(422, 'Informe um custo positivo para gerar a despesa do recebimento')
        dados_despesa = {
            'restaurantId': rid,
            'pedidoReposicaoId': pedido_id,
            'categoria': 'insumo',
            'descricao': f"Reposição de insumos — {pedido.get('fornecedorNome', 'Fornecedor')} ({pedido_id})",
            'valor': float(total_despesa),
            'data': competencia,
            'fornecedorId': pedido['fornecedorId'],
            'status': 'pendente',
            'observacoes': 'Despesa gerada automaticamente ao receber insumos. Marque como paga no Financeiro após efetuar o pagamento.',
        }
        # Todas as leituras de agregados/evento ocorrem antes das escritas
        # de estoque, permitindo rollback único com a despesa e o pedido.
        agregados_service.ajustar_despesa_tx(
            t, rid, None, dados_despesa, evento_id=f'despesa:reposicao_{pedido_id}:cria'
        )

        # Transação única: entradas, média ponderada, pedido e despesa.
        recebidos = []
        for salvo, item_ref, item, saldo, custo, qtd, total, compra_qtd, compra_unidade, custo_unit in updates:
            mov_ref = items_col(rid, 'movimentacoes_estoque').document()
            t.set(mov_ref, stamp_create({
                'tipo': 'entrada', 'itemId': salvo['itemId'], 'qtd': float(qtd),
                'saldoApos': saldo, 'unidade': item['unidade'],
                'quantidadeCompra': compra_qtd, 'unidadeCompra': compra_unidade,
                'valorTotalCompra': float(total), 'custoUnitario': item.get('custoMedio', 0),
                'custoMedioApos': custo, 'usuarioId': uid, 'restaurantId': rid,
                'pedidoReposicaoId': pedido_id,
                'despesaId': despesa_ref.id, 'dataMovimentacao': competencia,
                'observacao': f'Recebimento da reposição {pedido_id}',
            }))
            t.update(item_ref, stamp_update({'quantidadeAtual': saldo, 'custoMedio': custo}))
            recebidos.append({
                'itemId': salvo['itemId'], 'nome': salvo['nome'],
                'unidade': item['unidade'], 'quantidade': float(qtd),
                'quantidadeCompra': compra_qtd, 'unidadeCompra': compra_unidade,
                'custoUnitario': float(custo_unit), 'valorTotal': float(total),
                'movimentacaoId': mov_ref.id,
            })
        t.set(despesa_ref, stamp_create(dados_despesa))
        t.update(ref, stamp_update({
            'status': 'recebido', 'recebidoEm': base.now_utc(),
            'dataRecebimento': competencia,
            'dataRecebimentoLocal': payload.data_recebimento.isoformat(),
            'despesaId': despesa_ref.id, 'valorTotalRecebido': float(total_despesa),
            'recebidoPor': uid, 'recebimento': recebidos,
        }))

    executar_transacao(_exec)
    return obter(rid, pedido_id)
