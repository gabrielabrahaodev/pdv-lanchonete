"""Cálculos puros do domínio — sem dependência de Firestore/FastAPI.

Extraídos de pedidos_service e relatorios_service para serem testáveis
com pytest sem emular banco.
"""
from __future__ import annotations


def total_pedido(itens: list[dict]) -> float:
    """Soma qtd × precoUnitario dos itens não cancelados."""
    return round(
        sum(float(i["qtd"]) * float(i["precoUnitario"]) for i in itens if i.get("status") != "cancelado"),
        2,
    )


def agregar_consumo_receita(ingredientes: list[dict], qtd_item: float | int) -> dict[str, float]:
    """Converte a receita do produto em consumo agregado por itemId.

    Ignora ingredientes sem itemId ou com qtd <= 0. Multiplica pela
    quantidade do item do pedido e arredonda a 3 casas.
    """
    consumo: dict[str, float] = {}
    for ing in ingredientes or []:
        iid = ing.get("itemId")
        qtd = float(ing.get("qtd", 0) or 0)
        if iid and qtd > 0:
            consumo[iid] = consumo.get(iid, 0.0) + round(qtd * float(qtd_item), 3)
    return consumo


def resumo_financeiro(
    *,
    despesas_periodo: list[dict],
    saidas_com_pedido_periodo: list[dict],
    custo_medio_por_item: dict[str, float],
    faturamento: float,
) -> dict:
    """DRE gerencial simples.

    - despesas por categoria (insumo/folha/conta_fixa/outra) + total;
    - CMV estimado = saídas automáticas × custo médio atual do item;
    - resultadoGerencial = faturamento − totalDespesas (CMV é informativo:
      compras de insumo lançadas como despesa não devem contar duas vezes).
    """
    por_categoria: dict[str, float] = {"insumo": 0.0, "folha": 0.0, "conta_fixa": 0.0, "outra": 0.0}
    for d in despesas_periodo:
        cat = d.get("categoria") if d.get("categoria") in por_categoria else "outra"
        por_categoria[cat] = round(por_categoria[cat] + float(d.get("valor", 0)), 2)
    total_despesas = round(sum(por_categoria.values()), 2)

    cmv = sum(
        float(m.get("qtd", 0) or 0) * custo_medio_por_item.get(m.get("itemId"), 0.0)
        for m in saidas_com_pedido_periodo
    )

    return {
        "despesasPorCategoria": por_categoria,
        "totalDespesas": total_despesas,
        "cmvEstimado": round(cmv, 2),
        "resultadoGerencial": round(float(faturamento) - total_despesas, 2),
    }
