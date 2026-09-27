"""Agregados diários/mensais pré-computados (vendas + financeiro).

Cada venda quitada e cada despesa (criada/editada/excluída) atualiza os
agregados do dia/mês de COMPETÊNCIA via `Increment` — atômico no servidor,
sem ler antes. Relatórios passam a custar 1–2 leituras em vez de scans.

Documentos (por restaurante):
    data/agregados_diarios/items/{YYYY-MM-DD}
    data/agregados_mensais/items/{YYYY-MM}

Decisão vigente: SEM backfill — o histórico anterior não entra.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from google.cloud.firestore_v1.transforms import Increment

from app.core.config import settings
from app.services.base import get_db, now_utc

_TZ = ZoneInfo(settings.timezone)


def _chaves(ref_time: datetime) -> tuple[str, str, str]:
    local = ref_time.astimezone(_TZ)
    return (
        local.strftime("%Y-%m-%d"),
        local.strftime("%Y-%m"),
        local.strftime("%H"),
    )


def _refs(restaurant_id: str, dia: str, mes: str):
    db = get_db()
    return (
        db.document(f"restaurantes/{restaurant_id}/data/agregados_diarios/items/{dia}"),
        db.document(f"restaurantes/{restaurant_id}/data/agregados_mensais/items/{mes}"),
    )


def _base_doc(restaurant_id: str) -> dict[str, Any]:
    return {
        "restaurantId": restaurant_id,
        "faturamento": 0.0,
        "totalPedidos": 0,
        "vendasPorHora": {},
        "vendasPorFormaPagamento": {},
        "topProdutos": {},
        "saidasPorItem": {},
        "despesasPorCategoria": {},
        "totalDespesas": 0.0,
    }


def _gravar(restaurant_id: str, dia: str, mes: str, inc: dict[str, Any]) -> None:
    """Aplica increments nos docs diário + mensal (cria se não existir).

    Caminhos com ponto (`a.b`) SÓ funcionam em `update` — `set` gravaria
    a chave literal `"a.b"`. Fora de transação: tenta update, se o doc
    não existe cria base zerada (idempotente — concorrentes somam sem perda)
    e atualiza. PROPOSITALMENTE fora de transação: dentro dela, o `get` de
    existência viria depois de escritas (ReadAfterWrite, bug 10).
    """
    from google.cloud.exceptions import NotFound

    for ref in _refs(restaurant_id, dia, mes):
        try:
            ref.update(inc)
        except NotFound:
            ref.set(_base_doc(restaurant_id))
            ref.update(inc)


def registrar_venda(
    restaurant_id: str,
    pedido: dict[str, Any],
    pagamentos: list[dict[str, Any]],
    fechado_em: datetime | None = None,
) -> None:
    """Soma UMA venda quitada aos agregados do dia/mês do fechamento."""
    ref_time = fechado_em or now_utc()
    if ref_time.tzinfo is None:
        ref_time = ref_time.replace(tzinfo=timezone.utc)
    dia, mes, hora = _chaves(ref_time)
    total = round(float(pedido.get("total", 0)), 2)

    inc: dict[str, Any] = {
        "faturamento": Increment(total),
        "totalPedidos": Increment(1),
        f"vendasPorHora.{hora}": Increment(total),
        "restaurantId": restaurant_id,
    }
    for pag in pagamentos:
        tipo = pag.get("tipo", "outros")
        inc[f"vendasPorFormaPagamento.{tipo}"] = Increment(round(float(pag.get("valor", 0)), 2))
    for item in pedido.get("itens", []):
        pid = item.get("produtoId")
        if pid and item.get("status") != "cancelado":
            inc[f"topProdutos.{pid}"] = Increment(int(item.get("qtd", 1)))
    _gravar(restaurant_id, dia, mes, inc)


def registrar_saidas(
    restaurant_id: str,
    consumo: dict[str, float],
    ref_time: datetime | None = None,
) -> None:
    """Soma saídas de insumo (CMV futuro) aos agregados. Pós-commit SEMPRE
    (ver _gravar): recebe só o que foi baixado de verdade."""
    if not consumo:
        return
    ref_time = ref_time or now_utc()
    if ref_time.tzinfo is None:
        ref_time = ref_time.replace(tzinfo=timezone.utc)
    dia, mes, _ = _chaves(ref_time)
    inc: dict[str, Any] = {"restaurantId": restaurant_id}
    for iid, qtd in sorted(consumo.items()):
        qtd = round(float(qtd), 3)
        if qtd > 0:
            inc[f"saidasPorItem.{iid}"] = Increment(qtd)
    if len(inc) > 1:
        _gravar(restaurant_id, dia, mes, inc)


def _dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, "ToDatetime"):
        return value.ToDatetime().replace(tzinfo=timezone.utc)
    return None


def _chaves_competencia(data: datetime | None) -> tuple[str, str] | None:
    dt = _dt(data)
    if dt is None:
        return None
    local = dt.astimezone(_TZ)
    return local.strftime("%Y-%m-%d"), local.strftime("%Y-%m")


def ajustar_despesa(
    restaurant_id: str,
    old: dict[str, Any] | None,
    new: dict[str, Any] | None,
) -> None:
    """Espelha criar/editar/excluir de despesa nos agregados (por competência).

    Pagar/reabrir NÃO chamam aqui (só mudam status, totais intactos).
    """
    for doc, sinal in ((old, -1), (new, 1)):
        if not doc:
            continue
        chaves = _chaves_competencia(doc.get("data"))
        if chaves is None:
            continue
        dia, mes = chaves
        valor = round(float(doc.get("valor", 0)), 2)
        cat = doc.get("categoria", "outra")
        _gravar(
            restaurant_id,
            dia,
            mes,
            {
                f"despesasPorCategoria.{cat}": Increment(sinal * valor),
                "totalDespesas": Increment(sinal * valor),
                "restaurantId": restaurant_id,
            },
        )


def obter(restaurant_id: str, tipo: str, ref: str) -> dict[str, Any]:
    """Lê UM agregado (1 leitura). `tipo`: dia|mes. Ausente → zeros."""
    if tipo not in {"dia", "mes"}:
        raise ValueError("tipo deve ser 'dia' ou 'mes'")
    kind = "agregados_diarios" if tipo == "dia" else "agregados_mensais"
    snap = get_db().document(f"restaurantes/{restaurant_id}/data/{kind}/items/{ref}").get()
    base: dict[str, Any] = {
        "id": ref,
        "tipo": tipo,
        "faturamento": 0.0,
        "totalPedidos": 0,
        "vendasPorHora": {},
        "vendasPorFormaPagamento": {},
        "topProdutos": {},
        "saidasPorItem": {},
        "despesasPorCategoria": {},
        "totalDespesas": 0.0,
        "vazio": True,
    }
    if snap.exists:
        base.update(snap.to_dict() or {})
        base["vazio"] = False
    return base


def resumo_agregado(restaurant_id: str, tipo: str, ref: str) -> dict[str, Any]:
    """Resumo pronto p/ tela (agregado + CMV/DRE). ~70 leituras fixas."""
    from app.services import calculos
    from app.services.base import list_items
    from app.services.produtos_service import listar as listar_produtos

    agg = obter(restaurant_id, tipo, ref)
    saidas = [
        {"tipo": "saida", "itemId": iid, "qtd": float(qtd)}
        for iid, qtd in (agg.get("saidasPorItem") or {}).items()
    ]
    despesas = [
        {"categoria": cat, "valor": float(valor)}
        for cat, valor in (agg.get("despesasPorCategoria") or {}).items()
    ]
    custo_medio = {d["id"]: float(d.get("custoMedio") or 0) for d in list_items(restaurant_id, "estoque")}
    financeiro = calculos.resumo_financeiro(
        despesas_periodo=despesas,
        saidas_com_pedido_periodo=saidas,
        custo_medio_por_item=custo_medio,
        faturamento=float(agg.get("faturamento") or 0),
    )

    produtos = listar_produtos(restaurant_id)
    nomes = {d["id"]: d.get("nome", d["id"]) for d in produtos}
    cat_por_prod = {d["id"]: d.get("categoriaId") for d in produtos}
    nomes_cat = {c["id"]: c.get("nome", c["id"]) for c in list_items(restaurant_id, "categorias")}
    top_produtos: dict[str, int] = {}
    top_categorias: dict[str, int] = {}
    for pid, qtd in sorted((agg.get("topProdutos") or {}).items(), key=lambda kv: kv[1], reverse=True)[:10]:
        nome = nomes.get(pid, pid)
        top_produtos[nome] = int(qtd)
        cat_id = cat_por_prod.get(pid)
        if cat_id:
            cat_nome = nomes_cat.get(cat_id, cat_id)
            top_categorias[cat_nome] = top_categorias.get(cat_nome, 0) + int(qtd)

    return {**agg, "topProdutos": top_produtos, "topCategorias": top_categorias, "financeiro": financeiro}
