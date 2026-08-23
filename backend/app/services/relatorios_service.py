"""Relatórios agregados sobre pedidos pagos."""
from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services import calculos, produtos_service
from app.services.base import list_items

_TZ_EXIBICAO = ZoneInfo(settings.timezone)


def resumo(restaurant_id: str, inicio: datetime, fim: datetime) -> dict:
    pedidos = list_items(restaurant_id, "pedidos")
    pagos = [
        p
        for p in pedidos
        if p.get("status") == "pago"
        and _dt(p.get("fechadoEm") or p.get("criadoEm")) is not None
        and inicio <= _dt(p["fechadoEm"] or p["criadoEm"]) <= fim
    ]

    total_pedidos = len(pagos)
    faturamento = round(sum(float(p.get("total", 0)) for p in pagos), 2)

    por_hora: dict[str, float] = {f"{h:02d}": 0.0 for h in range(24)}
    por_forma: dict[str, float] = {}
    top_produtos: dict[str, int] = {}
    for p in pagos:
        dt = _dt(p.get("fechadoEm") or p.get("criadoEm"))
        if dt:
            chave = dt.astimezone(_TZ_EXIBICAO).strftime("%H")  # fuso configurável (settings.timezone)
            por_hora[chave] = round(por_hora[chave] + float(p.get("total", 0)), 2)
        for pag in p.get("pagamentos", []):
            t = pag.get("tipo", "outros")
            por_forma[t] = round(por_forma.get(t, 0.0) + float(pag.get("valor", 0)), 2)
        for item in p.get("itens", []):
            pid = item.get("produtoId")
            if pid and item.get("status") != "cancelado":
                top_produtos[pid] = top_produtos.get(pid, 0) + int(item.get("qtd", 1))

    nomes_produtos = {d["id"]: d.get("nome", d["id"]) for d in produtos_service.listar(restaurant_id)}
    categorias_por_produto = {
        d["id"]: d.get("categoriaId") for d in produtos_service.listar(restaurant_id)
    }
    nomes_categorias = {c["id"]: c.get("nome", c["id"]) for c in list_items(restaurant_id, "categorias")}

    top_produtos_nomeados: dict[str, int] = {}
    top_categorias: dict[str, int] = {}
    for pid, qtd in sorted(top_produtos.items(), key=lambda kv: kv[1], reverse=True)[:10]:
        nome = nomes_produtos.get(pid, pid)
        top_produtos_nomeados[nome] = qtd
        cat_id = categorias_por_produto.get(pid)
        if cat_id:
            cat_nome = nomes_categorias.get(cat_id, cat_id)
            top_categorias[cat_nome] = top_categorias.get(cat_nome, 0) + qtd

    # ---------------------------------------------------------- financeiro/DRE
    # Despesas por COMPETÊNCIA (campo `data`), qualquer status.
    despesas_periodo = [
        d
        for d in list_items(restaurant_id, "despesas")
        if _dt(d.get("data")) is not None and inicio <= _dt(d["data"]) <= fim
    ]
    saidas_com_pedido: list[dict] = []
    for m in list_items(restaurant_id, "movimentacoes_estoque"):
        criado = _dt(m.get("criadoEm"))
        if m.get("tipo") == "saida" and m.get("pedidoId") and criado and inicio <= criado <= fim:
            saidas_com_pedido.append(m)
    custo_medio = {d["id"]: float(d.get("custoMedio") or 0) for d in list_items(restaurant_id, "estoque")}
    financeiro = calculos.resumo_financeiro(
        despesas_periodo=despesas_periodo,
        saidas_com_pedido_periodo=saidas_com_pedido,
        custo_medio_por_item=custo_medio,
        faturamento=faturamento,
    )

    return {
        "periodoInicio": inicio,
        "periodoFim": fim,
        "totalPedidos": total_pedidos,
        "faturamentoBruto": faturamento,
        "faturamentoLiquido": faturamento,
        "ticketMedio": round(faturamento / total_pedidos, 2) if total_pedidos else 0.0,
        "vendasPorHora": por_hora,
        "vendasPorFormaPagamento": por_forma,
        "topProdutos": top_produtos_nomeados,
        "topCategorias": dict(
            sorted(top_categorias.items(), key=lambda kv: kv[1], reverse=True)[:10]
        ),
        "financeiro": financeiro,
    }


def _dt(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, "ToDatetime"):
        return value.ToDatetime().replace(tzinfo=timezone.utc)
    return None
