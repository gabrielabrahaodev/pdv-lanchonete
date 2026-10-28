"""Relatórios agregados sobre pedidos pagos (P1-I/J).

Resumo por intervalo com DUAS rotas, decididas pelo marcador de cobertura:
    1. AGREGADOS (data/agregados_diários, batch dia a dia) — quando
       `data/agregados_meta/items/cobertura.agregadoDesde` cobre TODO o
       intervalo pedido; custo fixo ~N dias + 3 coleções pequenas.
    2. HISTÓRICO (janela server-side por `fechadoEm`) — fallback antigo,
       corrigido: competência de venda é a data de QUITAÇÃO (não createdAt).
Nunca mistura parcial (dia agregado + histórico antigo).

faturamentoLiquido = faturamento bruto − totalDespesas (= resultadoGerencial).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services import calculos, produtos_service
from app.services.base import get_db, list_items, list_items_window

_TZ_EXIBICAO = ZoneInfo(settings.timezone)


def resumo(restaurant_id: str, inicio: datetime, fim: datetime) -> dict:
    inicio = _ensure(inicio)
    fim = _ensure(fim)
    cob = _cobertura_desde(restaurant_id)
    if cob and _local_date(inicio) >= date.fromisoformat(cob):
        return _resumo_por_agregados(restaurant_id, inicio, fim)
    return _resumo_historico(restaurant_id, inicio, fim)


# ------------------------------------------------------------------ coberturas
def _ensure(v: datetime) -> datetime:
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


def _local_date(dt: datetime) -> date:
    return _ensure(dt).astimezone(_TZ_EXIBICAO).date()


def _cobertura_desde(restaurant_id: str) -> str | None:
    snap = get_db().document(
        f"restaurantes/{restaurant_id}/data/agregados_meta/items/cobertura"
    ).get()
    if not snap.exists:
        return None
    return (snap.to_dict() or {}).get("agregadoDesde")


def _dias_entre(d0: date, d1: date) -> list[str]:
    out: list[str] = []
    cur = d0
    while cur <= d1:
        out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out


def _resumo_por_agregados(
    restaurant_id: str, inicio: datetime, fim: datetime
) -> dict:
    """Soma documentos diários do intervalo local por consulta em lote."""
    db = get_db()
    dias = _dias_entre(_local_date(inicio), _local_date(fim))
    refs = [
        db.document(
            f"restaurantes/{restaurant_id}/data/agregados_diarios/items/{dia}"
        )
        for dia in dias
    ]

    # Firestore Client.get_all recebe uma coleção de referências,
    # não uma referência como argumento posicional para cada documento.
    snaps = list(db.get_all(refs)) if refs else []

    # Documentos ausentes podem retornar to_dict() == None.
    faturamento_dec = calculos.soma_monet(
        [(s.to_dict() or {}).get("faturamento", 0) for s in snaps]
    )
    total_pedidos = sum(
        int((s.to_dict() or {}).get("totalPedidos", 0)) for s in snaps
    )

    por_hora: dict[str, float] = {f"{h:02d}": 0.0 for h in range(24)}
    por_forma: dict[str, float] = {}
    top_qtd: dict[str, int] = {}
    saidas: dict[str, float] = {}
    desp_por_cat: dict[str, float] = {}
    total_despesas = 0.0

    for s in snaps:
        d = s.to_dict() or {}

        for hora, valor in (d.get("vendasPorHora") or {}).items():
            chave = str(hora).zfill(2)
            por_hora[chave] = calculos.round_money(
                por_hora.get(chave, 0.0) + float(valor)
            )

        for forma, valor in (
            d.get("vendasPorFormaPagamento") or {}
        ).items():
            por_forma[forma] = calculos.round_money(
                por_forma.get(forma, 0.0) + float(valor)
            )

        for pid, qtd in (d.get("topProdutos") or {}).items():
            top_qtd[pid] = top_qtd.get(pid, 0) + int(qtd)

        for iid, qtd in (d.get("saidasPorItem") or {}).items():
            saidas[iid] = saidas.get(iid, 0.0) + max(0, float(qtd)-float((d.get('saidasComCustoPorItem') or {}).get(iid,0)))

        for cat, valor in (
            d.get("despesasPorCategoria") or {}
        ).items():
            desp_por_cat[cat] = calculos.round_money(
                desp_por_cat.get(cat, 0.0) + float(valor)
            )

        total_despesas = calculos.round_money(
            total_despesas + float(d.get("totalDespesas", 0))
        )

    faturamento = calculos.round_money(faturamento_dec)

    # Nomes e categorias reais dos produtos.
    produtos = produtos_service.listar(restaurant_id)
    nomes_produtos = {
        d["id"]: d.get("nome", d["id"]) for d in produtos
    }
    categorias_por_produto = {
        d["id"]: d.get("categoriaId") for d in produtos
    }
    nomes_categorias = {
        c["id"]: c.get("nome", c["id"])
        for c in list_items(restaurant_id, "categorias")
    }

    top_produtos: dict[str, int] = {}
    top_categorias: dict[str, int] = {}

    for pid, qtd in sorted(
        top_qtd.items(), key=lambda kv: kv[1], reverse=True
    )[:10]:
        nome = nomes_produtos.get(pid, pid)
        top_produtos[nome] = qtd

        cat_id = categorias_por_produto.get(pid)
        if cat_id:
            cat_nome = nomes_categorias.get(cat_id, cat_id)
            top_categorias[cat_nome] = (
                top_categorias.get(cat_nome, 0) + qtd
            )

    despesas_periodo = [
        {"categoria": cat, "valor": valor}
        for cat, valor in desp_por_cat.items()
    ]
    saidas_com_pedido = [
        {"tipo": "saida", "itemId": iid, "qtd": qtd}
        for iid, qtd in saidas.items()
    ]

    custo_medio = {
        d["id"]: float(d.get("custoMedio") or 0)
        for d in list_items(restaurant_id, "estoque")
    }

    financeiro = calculos.resumo_financeiro(
        despesas_periodo=despesas_periodo,
        saidas_com_pedido_periodo=saidas_com_pedido,
        custo_medio_por_item=custo_medio,
        faturamento=faturamento,
    )
    financeiro["cmvEstimado"] = calculos.round_money(financeiro["cmvEstimado"] + sum(float((s.to_dict() or {}).get("cmvProducao", 0)) + float((s.to_dict() or {}).get('cmvEstoqueCongelado',0)) for s in snaps))
    financeiro["totalDespesas"] = total_despesas
    financeiro["despesasPorCategoria"] = dict(
        sorted(
            desp_por_cat.items(),
            key=lambda kv: kv[1],
            reverse=True,
        )
    )
    financeiro["resultadoGerencial"] = calculos.round_money(
        faturamento - total_despesas
    )

    return {
        "periodoInicio": inicio,
        "periodoFim": fim,
        "totalPedidos": total_pedidos,
        "faturamentoBruto": faturamento,
        "faturamentoLiquido": calculos.faturamento_liquido(
            faturamento, financeiro
        ),
        "ticketMedio": calculos.round_money(
            faturamento / total_pedidos
        ) if total_pedidos else 0.0,
        "vendasPorHora": por_hora,
        "vendasPorFormaPagamento": por_forma,
        "topProdutos": top_produtos,
        "topCategorias": dict(
            sorted(
                top_categorias.items(),
                key=lambda kv: kv[1],
                reverse=True,
            )[:10]
        ),
        "financeiro": financeiro,
    }


def _resumo_historico(
    restaurant_id: str, inicio: datetime, fim: datetime
) -> dict:
    # A competência de venda é a data de quitação: fechadoEm.
    pedidos = list_items_window(
        restaurant_id, "pedidos", "fechadoEm", inicio, fim
    )
    pagos = [p for p in pedidos if p.get("status") == "pago"]

    total_pedidos = len(pagos)
    faturamento = calculos.round_money(
        calculos.soma_monet(p.get("total", 0) for p in pagos)
    )

    por_hora: dict[str, float] = {f"{h:02d}": 0.0 for h in range(24)}
    por_forma: dict[str, float] = {}
    top_produtos: dict[str, int] = {}

    for p in pagos:
        dt = _dt(p.get("fechadoEm") or p.get("criadoEm"))
        if dt:
            chave = dt.astimezone(_TZ_EXIBICAO).strftime("%H")
            por_hora[chave] = calculos.round_money(
                por_hora[chave] + float(p.get("total", 0))
            )

        for pag in p.get("pagamentos", []):
            tipo = pag.get("tipo", "outros")
            por_forma[tipo] = calculos.round_money(
                por_forma.get(tipo, 0.0) + float(pag.get("valor", 0))
            )

        for item in p.get("itens", []):
            pid = item.get("produtoId")
            if pid and item.get("status") != "cancelado":
                top_produtos[pid] = (
                    top_produtos.get(pid, 0) + int(item.get("qtd", 1))
                )

    produtos = produtos_service.listar(restaurant_id)
    nomes_produtos = {
        d["id"]: d.get("nome", d["id"]) for d in produtos
    }
    categorias_por_produto = {
        d["id"]: d.get("categoriaId") for d in produtos
    }
    nomes_categorias = {
        c["id"]: c.get("nome", c["id"])
        for c in list_items(restaurant_id, "categorias")
    }

    top_produtos_nomeados: dict[str, int] = {}
    top_categorias: dict[str, int] = {}

    for pid, qtd in sorted(
        top_produtos.items(), key=lambda kv: kv[1], reverse=True
    )[:10]:
        nome = nomes_produtos.get(pid, pid)
        top_produtos_nomeados[nome] = qtd

        cat_id = categorias_por_produto.get(pid)
        if cat_id:
            cat_nome = nomes_categorias.get(cat_id, cat_id)
            top_categorias[cat_nome] = (
                top_categorias.get(cat_nome, 0) + qtd
            )

    # Despesas por competência (campo data), independentemente do status.
    despesas_periodo = [
        d
        for d in list_items_window(
            restaurant_id, "despesas", "data", inicio, fim
        )
        if _dt(d.get("data")) is not None
        and inicio <= _dt(d["data"]) <= fim
    ]

    saidas_com_pedido: list[dict] = []
    for m in list_items_window(
        restaurant_id, "movimentacoes_estoque", "createdAt", inicio, fim
    ):
        criado = _dt(m.get("criadoEm") or m.get("createdAt"))
        if (
            m.get("tipo") == "saida"
            and m.get("pedidoId")
            and criado
            and inicio <= criado <= fim
        ):
            saidas_com_pedido.append(m)

    custo_medio = {
        d["id"]: float(d.get("custoMedio") or 0)
        for d in list_items(restaurant_id, "estoque")
    }

    financeiro = calculos.resumo_financeiro(
        despesas_periodo=despesas_periodo,
        saidas_com_pedido_periodo=saidas_com_pedido,
        custo_medio_por_item=custo_medio,
        faturamento=faturamento,
    )
    financeiro["cmvEstimado"] = calculos.round_money(financeiro["cmvEstimado"] + sum(round(sum(float(i.get("custoProducao", 0)) for i in p.get("itens", []) if i.get("status") != "cancelado"), 2) for p in pagos))

    return {
        "periodoInicio": inicio,
        "periodoFim": fim,
        "totalPedidos": total_pedidos,
        "faturamentoBruto": faturamento,
        "faturamentoLiquido": calculos.faturamento_liquido(
            faturamento, financeiro
        ),
        "ticketMedio": calculos.round_money(
            faturamento / total_pedidos
        ) if total_pedidos else 0.0,
        "vendasPorHora": por_hora,
        "vendasPorFormaPagamento": por_forma,
        "topProdutos": top_produtos_nomeados,
        "topCategorias": dict(
            sorted(
                top_categorias.items(),
                key=lambda kv: kv[1],
                reverse=True,
            )[:10]
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