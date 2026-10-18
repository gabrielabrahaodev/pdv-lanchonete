"""Sessões de caixa e registro de pagamentos."""
from __future__ import annotations
from typing import Any

from fastapi import HTTPException
from google.cloud.firestore import transactional

from app.core.firebase import get_db
from app.services.base import (
    doc_to_dict,
    ensure_parent,
    get_item,
    item_doc,
    items_col,
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


def sessao_atual(restaurant_id: str) -> dict | None:
    for doc in listar_sessoes(restaurant_id, limit=10):
        if doc.get("status") == "aberto":
            return doc
    return None


def abrir(restaurant_id: str, usuario_id: str, valor_inicial: float) -> dict:
    ensure_parent(restaurant_id, "sessoes_caixa")
    data: dict[str, Any] = {
        "usuarioId": usuario_id,
        "valorInicial": round(valor_inicial, 2),
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


def movimentacao_caixa(restaurant_id: str, usuario_id: str, tipo: str, valor: float, observacao: str | None) -> dict:
    sessao = sessao_atual(restaurant_id)
    if not sessao:
        raise HTTPException(409, "Não há sessão de caixa aberta")
    if tipo not in {"suprimento", "sangria"}:
        raise HTTPException(422, "Tipo deve ser 'suprimento' ou 'sangria'")
    campo = "suprimentos" if tipo == "suprimento" else "sangrias"
    novo_total = round(float(sessao.get(campo, 0)) + valor, 2)
    lancamentos = list(sessao.get("movimentacoesCaixa", []))
    lancamentos.append(
        {"id": new_id("mv_"), "tipo": tipo, "valor": round(valor, 2), "observacao": observacao,
         "usuarioId": usuario_id, "criadoEm": now_utc().isoformat()}
    )
    item_doc(restaurant_id, "sessoes_caixa", sessao["id"]).update(
        stamp_update({campo: novo_total, "movimentacoesCaixa": lancamentos})
    )
    return get_item(restaurant_id, "sessoes_caixa", sessao["id"])  # type: ignore[return-value]


def fechar(restaurant_id: str, valor_contado: float | None) -> dict:
    sessao = sessao_atual(restaurant_id)
    if not sessao:
        raise HTTPException(409, "Não há sessão de caixa aberta")
    esperado = round(
        float(sessao.get("valorInicial", 0))
        + float(sessao.get("totalRecebido", 0))
        + float(sessao.get("suprimentos", 0))
        - float(sessao.get("sangrias", 0)),
        2,
    )
    updates: dict[str, Any] = {
        "status": "fechado",
        "fechadoEm": now_utc(),
        "resumoFechamento": {
            "esperadoEmCaixa": esperado,
            "valorContado": round(valor_contado, 2) if valor_contado is not None else None,
            "diferenca": round((valor_contado or 0) - esperado, 2) if valor_contado is not None else None,
        },
    }
    item_doc(restaurant_id, "sessoes_caixa", sessao["id"]).update(stamp_update(updates))
    return get_item(restaurant_id, "sessoes_caixa", sessao["id"])  # type: ignore[return-value]


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
) -> dict:
    """Registra pagamento em UMA transação (leituras antes de escritas):

    - saldo recalcado do estado lido na transação → concorrentes não carimbam
      saldo (o 2º vê o saldo zerado e recebe 422);
    - quitação única: status/fechadoEm, sessão de caixa, mesa e agregado
      diário/mensal na MESMA transação (falha no meio não diverge estado);
    - agregado vai com evento determinístico `venda:{pedidoId}` (no-replay);
    - idempotência por chave opcional (header `X-Idempotency-Key`): replay
      rejeitado com 409 e nenhum dado duplicado.
    """
    from app.services import agregados_service, mesas_service

    if tipo not in {"dinheiro", "pix", "credito", "debito"}:
        raise HTTPException(422, "Tipo de pagamento inválido (dinheiro, pix, credito, debito)")
    if float(valor) <= 0:
        raise HTTPException(422, "Valor do pagamento deve ser maior que zero")

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
        if pedido.get("status") != "aberto":
            raise HTTPException(409, "Pedido não está aberto para pagamentos")

        if evento_ref is not None:
            ev_snap = next(iter(t.get(evento_ref)), None)
            if ev_snap and ev_snap.exists:
                raise HTTPException(
                    409, "Pagamento já registrado para esta chave de idempotência"
                )

        ja_pago = sum(float(p.get("valor", 0)) for p in pedido.get("pagamentos", []))
        total = float(pedido.get("total", 0))
        restante = round(total - ja_pago, 2)
        if float(valor) > restante + TOLERANCIA:
            raise HTTPException(422, f"Valor excede o saldo do pedido (restante: R$ {restante:.2f})")

        sessao_snap = next(iter(
            t.get(items_col(restaurant_id, "sessoes_caixa").where("status", "==", "aberto"))
        ), None)
        mesa_id = pedido.get("mesaId")
        mesa_ref = item_doc(restaurant_id, "mesas", mesa_id) if mesa_id else None
        mesa_snap = next(iter(t.get(mesa_ref)), None) if mesa_ref else None

        quitado = (ja_pago + float(valor)) >= total - TOLERANCIA

        # ---------- fase 2: TODAS as escritas ----------
        pagamento = {
            "id": new_id("pag_"),
            "tipo": tipo,
            "valor": round(float(valor), 2),
            "troco": round(float(troco), 2) if troco is not None else None,
            "referencia": referencia,
            "criadoEm": fechado_em,
        }
        pagamentos = [*pedido.get("pagamentos", []), pagamento]
        updates: dict[str, Any] = {"pagamentos": pagamentos}
        if quitado:
            updates |= {"status": "pago", "fechadoEm": fechado_em}

        # Agregado PRIMEIRO (faz leituras prórias — Firestore proíbe leitura
        # após escrita na transação); pedido/evento/sessão/mesa vêm depois.
        if quitado:
            agregados_service.registrar_venda_tx(
                t, restaurant_id, pedido, pagamentos, fechado_em, evento_id=f"venda:{pedido_id}"
            )
        t.update(pedido_ref, stamp_update(updates))
        if evento_ref is not None:
            t.set(
                evento_ref,
                stamp_create(
                    {
                        "pedidoId": pedido_id,
                        "tipo": "pagamento",
                        "idempotencyKey": idempotency_key,
                        "restaurantId": restaurant_id,
                    }
                ),
            )

        if quitado:
            if sessao_snap and sessao_snap.exists:
                sessao = dict(sessao_snap.to_dict() or {})
                total_vendas = round(float(sessao.get("totalVendas", 0)) + total, 2)
                total_recebido = round(
                    float(sessao.get("totalRecebido", 0)) + sum(float(p["valor"]) for p in pagamentos), 2
                )
                por_forma = dict(sessao.get("vendasPorFormaPagamento") or {})
                for p in pagamentos:
                    por_forma[p["tipo"]] = round(por_forma.get(p["tipo"], 0.0) + float(p["valor"]), 2)
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
