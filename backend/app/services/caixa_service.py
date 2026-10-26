"""Sessões de caixa e registro de pagamentos."""
from __future__ import annotations
from typing import Any
import hashlib
import json
from copy import deepcopy

from fastapi import HTTPException
from google.cloud.firestore import transactional

from app.core.firebase import get_db
from app.services import calculos
from app.services.base import (
    doc_to_dict,
    ensure_parent,
    get_item,
    item_doc,
    items_col,
    list_items_paginado,
    new_id,
    now_utc,
    stamp_create,
    stamp_update,
)

TOLERANCIA = 0.009


# ------------------------------------------------------------------ sessões
def listar_sessoes(restaurant_id: str, *, limit: int = 30) -> list[dict]:
    """Sessões recentes (campo único `createdAt`, índice automático).

    NUNCA scan completo: sessões crescem 1/dia para sempre.
    """
    from google.cloud.firestore import Query

    snaps = (
        items_col(restaurant_id, "sessoes_caixa")
        .order_by("createdAt", direction=Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    return [doc_to_dict(s) for s in snaps]


def listar_sessoes_paginado(
    restaurant_id: str,
    *,
    limit: int | None = None,
    cursor_id: str | None = None,
) -> tuple[list[dict], str | None]:
    """Histórico de sessões paginado por cursor (P1-L).

    Sem `limit`: lista completa integral — next_cursor None.
    Com `limit`: consulta server-side (createdAt DESC — índice automático);
    cursor = id do último doc da página.
    """
    if limit is None:
        return listar_sessoes(restaurant_id, limit=10_000), None
    if limit <= 0:
        raise HTTPException(422, "limit deve ser maior que zero")
    return list_items_paginado(restaurant_id, "sessoes_caixa", limit=limit, cursor_id=cursor_id)


def sessao_atual(restaurant_id: str) -> dict | None:
    for doc in listar_sessoes(restaurant_id, limit=10):
        if doc.get("status") == "aberto":
            return doc
    return None


def abrir(restaurant_id: str, usuario_id: str, valor_inicial: float) -> dict:
    ensure_parent(restaurant_id, "sessoes_caixa")
    data: dict[str, Any] = {
        "usuarioId": usuario_id,
        "valorInicial": calculos.round_money(valor_inicial),
        "abertoEm": now_utc(),
        "totalVendas": 0.0,
        "totalRecebido": 0.0,
        "sangrias": 0.0,
        "suprimentos": 0.0,
        "status": "aberto",
        "vendasPorFormaPagamento": {},
        "quantidadePorProduto": {},
        "movimentacoesCaixa": [],
        "restaurantId": restaurant_id,
    }

    # Transação: evita abrir duas sessões simultâneas (query aborta se surgir
    # outra sessão aberta entre a leitura e o commit).
    @transactional
    def _exec(t) -> str:
        col = items_col(restaurant_id, "sessoes_caixa")
        abertas = list(t.get(col.where("status", "==", "aberto")))
        if abertas:
            raise HTTPException(409, "Já existe uma sessão de caixa aberta")
        ref = col.document()
        t.set(ref, stamp_create(data))
        return ref.id

    sessao_id = _exec(get_db().transaction())
    return get_item(restaurant_id, "sessoes_caixa", sessao_id)  # type: ignore[return-value]


def _alterar_sessao_aberta(restaurant_id: str, alterar) -> dict:
    # Escolhe a sessão, mas SEMPRE relê seus valores dentro da transação.
    sessao = sessao_atual(restaurant_id)
    if not sessao:
        raise HTTPException(409, "Não há sessão de caixa aberta")
    ref = item_doc(restaurant_id, "sessoes_caixa", sessao["id"])

    @transactional
    def executar(t):
        snap = next(iter(t.get(ref)), None)
        atual = (snap.to_dict() or {}) if snap and snap.exists else {}
        if atual.get("status") != "aberto":
            raise HTTPException(409, "A sessão de caixa já foi fechada")
        t.update(ref, stamp_update(alterar(atual)))

    executar(get_db().transaction())
    return get_item(restaurant_id, "sessoes_caixa", sessao["id"])


def movimentacao_caixa(restaurant_id: str, usuario_id: str, tipo: str, valor: float, observacao: str | None) -> dict:
    if tipo not in {"suprimento", "sangria"}:
        raise HTTPException(422, "Tipo deve ser 'suprimento' ou 'sangria'")
    campo = "suprimentos" if tipo == "suprimento" else "sangrias"
    movimento = {"id": new_id("mv_"), "tipo": tipo, "valor": calculos.round_money(valor),
                 "observacao": observacao, "usuarioId": usuario_id, "criadoEm": now_utc().isoformat()}
    def alterar(sessao):
        return {
            campo: calculos.round_money(float(sessao.get(campo, 0)) + valor),
            "movimentacoesCaixa": [*sessao.get("movimentacoesCaixa", []), movimento],
        }
    return _alterar_sessao_aberta(restaurant_id, alterar)


def fechar(restaurant_id: str, valor_contado: float | None) -> dict:
    def alterar(sessao):
        esperado = calculos.round_money(
            float(sessao.get("valorInicial", 0)) + float(sessao.get("totalRecebido", 0))
            + float(sessao.get("suprimentos", 0)) - float(sessao.get("sangrias", 0))
        )
        return {
            "status": "fechado", "fechadoEm": now_utc(),
            "resumoFechamento": {
                "esperadoEmCaixa": esperado,
                "valorContado": calculos.round_money(valor_contado) if valor_contado is not None else None,
                "diferenca": calculos.round_money(valor_contado - esperado) if valor_contado is not None else None,
            },
        }
    return _alterar_sessao_aberta(restaurant_id, alterar)


# ------------------------------------------------------------------ pagamentos
def _evento_ref(restaurant_id: str, pedido_id: str, idempotency_key: str):
    """Marcador de idempotência: `data/eventos_pagamento/items/{pedido}:{key}`."""
    return get_db().document(
        f"restaurantes/{restaurant_id}/data/eventos_pagamento/items/{pedido_id}:{idempotency_key}"
    )


def registrar_pagamento(
    restaurant_id: str,
    usuario_id: str,
    pedido_id: str,
    *,
    tipo: str,
    valor: float,
    troco: float | None = None,
    referencia: str | None = None,
    idempotency_key: str | None = None,
    entregar_prontos: bool = False,
) -> dict:
    """Registra pagamento em UMA transação (leituras antes de escritas):

    - saldo recalcado do estado lido na transação → concorrentes não carimbam
      saldo (o 2º vê o saldo zerado e recebe 422);
    - quitação única: status/fechadoEm, sessão de caixa, mesa e agregado
      diário/mensal na MESMA transação (falha no meio não diverge estado);
    - agregado vai com evento determinístico `venda:{pedidoId}` (no-replay);
    - idempotência por chave opcional (header `X-Idempotency-Key`): replay
      replay igual de balcão retorna o pedido; demais modos rejeitam com 409.
    """
    from app.services import agregados_service, mesas_service, producao_service

    if tipo not in {"dinheiro", "pix", "credito", "debito"}:
        raise HTTPException(422, "Tipo de pagamento inválido (dinheiro, pix, credito, debito)")
    if float(valor) <= 0:
        raise HTTPException(422, "Valor do pagamento deve ser maior que zero")

    fingerprint = hashlib.sha256(json.dumps([tipo, valor, troco, referencia, entregar_prontos], sort_keys=True).encode()).hexdigest()
    db = get_db()
    pedido_ref = item_doc(restaurant_id, "pedidos", pedido_id)
    evento_ref = (
        _evento_ref(restaurant_id, pedido_id, idempotency_key) if idempotency_key else None
    )
    fechado_em = now_utc()  # competência fixada ANTES da transação (chaves do agregado)

    @transactional
    def _exec(t) -> None:
        # ---------- fase 1: TODAS as leituras ----------
        pedido_snap = next(iter(t.get(pedido_ref)), None)
        if not pedido_snap or not pedido_snap.exists:
            raise HTTPException(404, "Pedido não encontrado")
        pedido = dict(pedido_snap.to_dict() or {})
        if evento_ref is not None:
            ev_snap = next(iter(t.get(evento_ref)), None)
            if ev_snap and ev_snap.exists:
                if pedido.get("tipo") == "balcao":
                    if (ev_snap.to_dict() or {}).get("fingerprint") != fingerprint:
                        raise HTTPException(409, "Chave de pagamento ja utilizada com outros dados")
                    return
                raise HTTPException(
                    409, "Pagamento já registrado para esta chave de idempotência"
                )

        if pedido.get("status") != "aberto":
            raise HTTPException(409, "Pedido não está aberto para pagamentos")
        if entregar_prontos and pedido.get("tipo") != "balcao":
            raise HTTPException(422, "Entrega no pagamento disponivel apenas para balcao")
        ja_pago = float(calculos.soma_monet(p.get("valor", 0) for p in pedido.get("pagamentos", [])))
        total = float(calculos.monet(pedido.get("total", 0)))
        restante = calculos.round_money(total - ja_pago)
        if float(valor) > restante + TOLERANCIA:
            raise HTTPException(422, f"Valor excede o saldo do pedido (restante: R$ {restante:.2f})")

        sessao_snap = next(iter(
            t.get(items_col(restaurant_id, "sessoes_caixa").where("status", "==", "aberto"))
        ), None)
        if pedido.get("tipo") == "balcao" and not (sessao_snap and sessao_snap.exists):
            raise HTTPException(409, "Abra o caixa antes de receber a venda direta")
        mesa_id = pedido.get("mesaId")
        mesa_ref = item_doc(restaurant_id, "mesas", mesa_id) if mesa_id else None
        mesa_snap = next(iter(t.get(mesa_ref)), None) if mesa_ref else None

        quitado = calculos.round_money(ja_pago + float(valor)) >= calculos.round_money(total) - TOLERANCIA

        gravar_entrega = lambda: None
        if entregar_prontos:
            if not quitado:
                raise HTTPException(422, "Para pagar e entregar, quite todo o saldo")
            pedido["itens"] = deepcopy(pedido.get("itens", []))
            prontos = [i for i in pedido["itens"] if i.get("status") == "pronto"]
            gravar_entrega = producao_service.planejar_destino(t, restaurant_id, pedido_id, prontos, "entrega", usuario_id)
            for item in prontos:
                item["status"] = "entregue"

        # Agregados ainda fazem suas leituras antes de qualquer escrita.
        pagamento = {
            "id": new_id("pag_"),
            "tipo": tipo,
            "valor": calculos.round_money(valor),
            "troco": calculos.round_money(troco) if troco is not None else None,
            "referencia": referencia,
            "criadoEm": fechado_em,
        }
        pagamentos = [*pedido.get("pagamentos", []), pagamento]
        updates: dict[str, Any] = {"pagamentos": pagamentos}
        if entregar_prontos:
            updates["itens"] = pedido["itens"]
        if quitado:
            updates |= {"status": "pago", "fechadoEm": fechado_em, "cozinhaPendente": any(i.get("status") in {"pendente", "preparo", "pronto"} for i in pedido.get("itens", []))}

        # Agregado PRIMEIRO (faz leituras prórias — Firestore proíbe leitura
        # após escrita na transação); pedido/evento/sessão/mesa vêm depois.
        if quitado:
            agregados_service.registrar_venda_tx(
                t, restaurant_id, pedido, pagamentos, fechado_em, evento_id=f"venda:{pedido_id}"
            )
        gravar_entrega()
        t.update(pedido_ref, stamp_update(updates))
        if evento_ref is not None:
            t.set(
                evento_ref,
                stamp_create(
                    {
                        "pedidoId": pedido_id,
                        "tipo": "pagamento",
                        "idempotencyKey": idempotency_key,
                        "fingerprint": fingerprint,
                        "restaurantId": restaurant_id,
                    }
                ),
            )

        if quitado:
            if sessao_snap and sessao_snap.exists:
                sessao = dict(sessao_snap.to_dict() or {})
                total_vendas = calculos.round_money(float(sessao.get("totalVendas", 0)) + total)
                total_recebido = calculos.round_money(
                    calculos.monet(sessao.get("totalRecebido", 0))
                    + calculos.soma_monet(float(p["valor"]) for p in pagamentos)
                )
                por_forma = dict(sessao.get("vendasPorFormaPagamento") or {})
                for p in pagamentos:
                    por_forma[p["tipo"]] = calculos.round_money(por_forma.get(p["tipo"], 0.0) + float(p["valor"]))
                por_produto = dict(sessao.get("quantidadePorProduto") or {})
                for item in pedido.get("itens", []):
                    pid = item.get("produtoId")
                    if pid and item.get("status") != "cancelado":
                        por_produto[pid] = int(por_produto.get(pid, 0)) + int(item.get("qtd", 1))
                t.update(
                    sessao_snap.reference,
                    stamp_update(
                        {
                            "totalVendas": total_vendas,
                            "totalRecebido": total_recebido,
                            "vendasPorFormaPagamento": por_forma,
                            "quantidadePorProduto": por_produto,
                        }
                    ),
                )
            if mesa_snap and mesa_snap.exists:
                mesa = mesa_snap.to_dict() or {}
                if mesa.get("pedidoAtivoId") == pedido_id:  # condicional
                    mesas_service.liberar_transacional(t, restaurant_id, mesa_id)

    _exec(db.transaction())
    return get_item(restaurant_id, "pedidos", pedido_id)  # type: ignore[return-value]
