"""Backfill que RECONSTRÓI agregados a partir do histórico (P1-H).

`reconstruir(rid, ...)` NUNCA escreve por padrão — devolve o plano do que
seria escrito (dry-run seguro). A CLI `scripts/reconstruir_agregados.py`
aplica só com `--apply` + confirmação explícita do operador.

Os docs escritos têm EXATAMENTE a mesma estrutura do agregado canônico
(`agregados_service._base_doc`): pids crus em topProdutos/saidasPorItem,
vendasPorHora por dia E mês (mesma convenção), financeiro ON-READ.

Fontes e competências:
- pedidos pago           → fechadoEm (TZ America/Sao_Paulo)
- despesas (± status)    → campo `data`
- saídas ligadas a pedido→ criadoEm da movimentação
Marca `agregados_meta/items/cobertura.agregadoDesde` = primeiro dia — é o
sinal que o relatório por intervalo (P1-I) usa para escolher agregados.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from app.services.base import get_db, list_items, now_utc, stamp_create

_TZ = ZoneInfo("America/Sao_Paulo")

_CAMPOS = (
    "faturamento", "totalPedidos", "vendasPorHora", "vendasPorFormaPagamento",
    "topProdutos", "saidasPorItem", "despesasPorCategoria", "totalDespesas", "cmvProducao", "saidasComCustoPorItem", "cmvEstoqueCongelado",
)


def reconstruir(restaurant_id: str, *, apply: bool = False) -> dict[str, Any]:
    db = get_db()

    pedidos = [
        p
        for p in list_items(restaurant_id, "pedidos")
        if p.get("status") == "pago" and _dt(p.get("fechadoEm"))
    ]
    despesas = list_items(restaurant_id, "despesas")
    movs = [
        m
        for m in list_items(restaurant_id, "movimentacoes_estoque")
        if m.get("tipo") == "saida" and m.get("pedidoId") and _dt(m.get("criadoEm"))
    ]

    dias: dict[str, dict] = {}
    meses: dict[str, dict] = {}

    for p in pedidos:
        local = _dt(p["fechadoEm"]).astimezone(_TZ)
        dia, mes = local.strftime("%Y-%m-%d"), local.strftime("%Y-%m")
        hora = local.strftime("%H")
        total = round(float(p.get("total", 0)), 2)
        for alvo in (dias.setdefault(dia, _novo()), meses.setdefault(mes, _novo())):
            alvo["faturamento"] = alvo["faturamento"] + total
            alvo["cmvProducao"] += round(sum(float(i.get("custoProducao", 0)) for i in p.get("itens", []) if i.get("status") != "cancelado"), 2)
            alvo["totalPedidos"] = int(alvo["totalPedidos"]) + 1
            alvo["vendasPorHora"][hora] = alvo["vendasPorHora"].get(hora, 0.0) + total
            for mov in p.get("pagamentos", []):
                tipo = mov.get("tipo", "outros")
                valor = round(float(mov.get("valor", 0)), 2)
                alvo["vendasPorFormaPagamento"][tipo] = (
                    alvo["vendasPorFormaPagamento"].get(tipo, 0.0) + valor
                )
        top = dias[dia]["topProdutos"]
        for item in p.get("itens", []):
            pid = item.get("produtoId")
            if pid and item.get("status") != "cancelado":
                dias[dia]["topProdutos"][pid] = int(top.get(pid, 0)) + int(item.get("qtd", 1))
        for item in p.get("itens", []):
            pid = item.get("produtoId")
            if pid and item.get("status") != "cancelado":
                meses[mes]["topProdutos"][pid] = int(meses[mes]["topProdutos"].get(pid, 0)) + int(item.get("qtd", 1))

    for x in despesas:
        dt = _dt(x.get("data"))
        if not dt:
            continue
        local = dt.astimezone(_TZ)
        dia, mes = local.strftime("%Y-%m-%d"), local.strftime("%Y-%m")
        for alvo in (dias.setdefault(dia, _novo()), meses.setdefault(mes, _novo())):
            cat = x.get("categoria", "outra")
            valor = round(float(x.get("valor", 0)), 2)
            alvo["despesasPorCategoria"][cat] = alvo["despesasPorCategoria"].get(cat, 0.0) + valor
            alvo["totalDespesas"] = alvo["totalDespesas"] + valor

    for m in movs:
        local = _dt(m["criadoEm"]).astimezone(_TZ)
        dia, mes = local.strftime("%Y-%m-%d"), local.strftime("%Y-%m")
        for alvo in (dias.setdefault(dia, _novo()), meses.setdefault(mes, _novo())):
            iid = m.get("itemId")
            if iid:
                qtd = round(float(m.get("qtd", 0) or 0), 3)
                if qtd > 0:
                    alvo["saidasPorItem"][iid] = round(alvo["saidasPorItem"].get(iid, 0.0) + qtd, 3)
                    if 'custoUnitario' in m:
                        alvo['saidasComCustoPorItem'][iid] = round(alvo['saidasComCustoPorItem'].get(iid,0)+qtd,3)
                        alvo['cmvEstoqueCongelado'] += qtd*float(m['custoUnitario'])

    # Uma despesa pode ter mudado de competência ou sido removida. Zera os
    # períodos já existentes que ficaram sem fontes, evitando saldo fantasma.
    dias_existentes = list_items(restaurant_id, "agregados_diarios")
    meses_existentes = list_items(restaurant_id, "agregados_mensais")
    for doc in dias_existentes:
        dias.setdefault(doc["id"], _novo())
    for doc in meses_existentes:
        meses.setdefault(doc["id"], _novo())

    plano: dict[str, Any] = {
        "pedidosConsiderados": len(pedidos),
        "despesasConsideradas": len(despesas),
        "saidasConsideradas": len(movs),
        "dias": sorted(dias),
        "meses": sorted(meses),
    }
    if not apply:
        return {"aplicado": False, **plano}

    if not dias and not meses:
        return {"aplicado": True, "aviso": "nada a reconstruir", "dias": [], "meses": []}

    writes: list[tuple[str, dict]] = [
        (f"data/agregados_diarios/items/{k}", _sanitize(v)) for k, v in dias.items()
    ] + [
        (f"data/agregados_mensais/items/{k}", _sanitize(v)) for k, v in meses.items()
    ]
    for path, doc in writes:
        db.document(f"restaurantes/{restaurant_id}/{path}").set(stamp_create(doc))
    primeiro_dia = sorted(dias)[0] if dias else None
    if primeiro_dia:
        db.document(
            f"restaurantes/{restaurant_id}/data/agregados_meta/items/cobertura"
        ).set(stamp_create({"agregadoDesde": primeiro_dia, "geradoEm": now_utc()}))
    return {"aplicado": True, "agregadoDesde": primeiro_dia, **plano}


def _novo() -> dict[str, Any]:
    vals: dict[str, Any] = {
        "faturamento": 0.0,
        "totalPedidos": 0,
        "vendasPorHora": {},
        "vendasPorFormaPagamento": {},
        "topProdutos": {},
        "saidasPorItem": {},
        "despesasPorCategoria": {},
        "totalDespesas": 0.0,
        "cmvProducao": 0.0,
        "saidasComCustoPorItem": {},
        "cmvEstoqueCongelado": 0.0,
    }
    return vals


def _sanitize(doc: dict) -> dict:
    out = {}
    for campo in _CAMPOS:
        v = doc.get(campo)
        if campo == "vendasPorHora" and isinstance(v, dict):
            out[campo] = {str(k).zfill(2)[-2:]: round(float(x), 2) for k, x in v.items()}
        elif campo in {"faturamento", "totalDespesas", "vendasPorFormaPagamento", "despesasPorCategoria"}:
            out[campo] = {k: round(float(x), 2) for k, x in v.items()} if isinstance(v, dict) else round(float(v or 0), 2)
        elif campo in {"saidasPorItem", "saidasComCustoPorItem"}:
            out[campo] = {k: round(float(x), 3) for k, x in v.items()}
        elif campo == "totalPedidos":
            out[campo] = int(v or 0)
        else:
            out[campo] = v
    return out


def _dt(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, "ToDatetime"):
        return value.ToDatetime().replace(tzinfo=timezone.utc)
    return None
