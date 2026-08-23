"""Sessões de caixa e registro de pagamentos."""
from __future__ import annotations
from typing import Any

from fastapi import HTTPException
from google.cloud.firestore import transactional

from app.core.firebase import get_db
from app.services.base import (
    ensure_parent,
    get_item,
    item_doc,
    items_col,
    list_items,
    new_id,
    now_utc,
    stamp_create,
    stamp_update,
)

TOLERANCIA = 0.009


# ------------------------------------------------------------------ sessões
def listar_sessoes(restaurant_id: str, *, limit: int = 30) -> list[dict]:
    docs = list_items(restaurant_id, "sessoes_caixa")
    return docs[:limit]


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
def registrar_pagamento(
    restaurant_id: str,
    usuario_id: str,
    pedido_id: str,
    *,
    tipo: str,
    valor: float,
    troco: float | None = None,
    referencia: str | None = None,
) -> dict:
    from app.services.pedidos_service import _total, obter as pedido_obter

    if tipo not in {"dinheiro", "pix", "credito", "debito"}:
        raise HTTPException(422, "Tipo de pagamento inválido (dinheiro, pix, credito, debito)")
    pedido = pedido_obter(restaurant_id, pedido_id)
    if pedido.get("status") != "aberto":
        raise HTTPException(409, "Pedido não está aberto para pagamentos")

    ja_pago = sum(float(p.get("valor", 0)) for p in pedido.get("pagamentos", []))
    restante = round(float(pedido.get("total", 0)) - ja_pago, 2)
    if valor > restante + TOLERANCIA:
        raise HTTPException(422, f"Valor excede o saldo do pedido (restante: R$ {restante:.2f})")

    pagamento = {
        "id": new_id("pag_"),
        "tipo": tipo,
        "valor": round(valor, 2),
        "troco": round(troco, 2) if troco is not None else None,
        "referencia": referencia,
        "criadoEm": now_utc(),
    }
    pagamentos = [*pedido.get("pagamentos", []), pagamento]
    quitado = (ja_pago + valor) >= float(pedido.get("total", 0)) - TOLERANCIA

    updates: dict[str, Any] = {"pagamentos": pagamentos}
    if quitado:
        updates |= {"status": "pago", "fechadoEm": now_utc()}
    item_doc(restaurant_id, "pedidos", pedido_id).update(stamp_update(updates))

    if quitado:
        _credit_sessao(restaurant_id, usuario_id, pedido, pagamentos)
        from app.services import mesas_service

        mesas_service.liberar(restaurant_id, pedido["mesaId"])

    return pedido_obter(restaurant_id, pedido_id)


def _credit_sessao(restaurant_id: str, usuario_id: str, pedido: dict, pagamentos: list[dict]) -> None:
    """Soma a venda na sessão de caixa aberta (se houver).

    Transação: evita perda de update com dois pagamentos simultâneos.
    """
    @transactional
    def _exec(t) -> None:
        col = items_col(restaurant_id, "sessoes_caixa")
        snaps = list(t.get(col.where("status", "==", "aberto")))
        if not snaps:
            return
        sessao = snaps[0].to_dict() or {}

        total_vendas = round(float(sessao.get("totalVendas", 0)) + float(pedido.get("total", 0)), 2)
        total_recebido = round(float(sessao.get("totalRecebido", 0)) + sum(float(p["valor"]) for p in pagamentos), 2)

        por_forma = dict(sessao.get("vendasPorFormaPagamento") or {})
        for p in pagamentos:
            por_forma[p["tipo"]] = round(por_forma.get(p["tipo"], 0.0) + float(p["valor"]), 2)

        por_produto = dict(sessao.get("quantidadePorProduto") or {})
        for item in pedido.get("itens", []):
            pid = item.get("produtoId")
            if pid and item.get("status") != "cancelado":
                por_produto[pid] = int(por_produto.get(pid, 0)) + int(item.get("qtd", 1))

        t.update(
            snaps[0].reference,
            stamp_update(
                {
                    "totalVendas": total_vendas,
                    "totalRecebido": total_recebido,
                    "vendasPorFormaPagamento": por_forma,
                    "quantidadePorProduto": por_produto,
                }
            ),
        )

    _exec(get_db().transaction())
