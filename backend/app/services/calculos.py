"""Cálculos puros do domínio — sem dependência de Firestore/FastAPI.

Extraídos de pedidos_service e relatorios_service para serem testáveis
com pytest sem emular banco.

Política de dinheiro (P1-K): valores monetários SEMPRE via `Decimal(str(v))`
+ ROUND_HALF_UP na arredondação. `round_money` devolve float (borda da API),
`monet`/`soma_monet` mantêm Decimal durante o cálculo. Nunca use centavos
inteiros misturados com decimais.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

_CENT = Decimal("0.01")


def monet(value) -> Decimal:
    """Float→Decimal via string (nunca Decimal(float), que herda erro binário)."""
    return Decimal(str(float(value)))


def soma_monet(values) -> Decimal:
    """Soma exata em Decimal (default 0)."""
    return sum((monet(v) for v in values), Decimal("0"))


def round_money(value) -> float:
    """Arredonda HALF_UP para 2 casas e devolve float (borda da API)."""
    return float(monet(value).quantize(_CENT, rounding=ROUND_HALF_UP))


def faturamento_liquido(faturamento: float, financeiro: dict) -> float:
    """Semântica explícita (complementos de relatório): receita bruta − totalDespesas."""
    return round_money(float(faturamento) - float(financeiro.get("totalDespesas", 0)))


def total_pedido(itens: list[dict]) -> float:
    """Soma qtd × precoUnitario dos itens não cancelados (Decimal/HALF_UP)."""
    total = soma_monet(
        float(i["qtd"]) * float(i["precoUnitario"]) for i in itens if i.get("status") != "cancelado"
    )
    return float(total.quantize(_CENT, rounding=ROUND_HALF_UP))


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
            consumo[iid] = round(float(consumo.get(iid, 0.0)) + qtd * float(qtd_item), 3)
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
    - `faturamentoLiquido` (na resposta de relatório) usa `faturamento_liquido`
      = bruto − totalDespesas, i.e. igual a resultadoGerencial.
    """
    por_categoria: dict[str, float] = {"insumo": 0.0, "folha": 0.0, "conta_fixa": 0.0, "outra": 0.0}
    for d in despesas_periodo:
        cat = d.get("categoria") if d.get("categoria") in por_categoria else "outra"
        por_categoria[cat] = round_money(float(por_categoria[cat]) + float(d.get("valor", 0)))
    total_despesas = round_money(
        sum(float(v) for v in por_categoria.values())
    )

    cmv = soma_monet(
        float(m.get("qtd", 0) or 0) * float(m.get("custoUnitario", custo_medio_por_item.get(m.get("itemId"), 0.0)))
        for m in saidas_com_pedido_periodo
    )

    resultado = round_money(float(faturamento) - total_despesas)
    return {
        "despesasPorCategoria": por_categoria,
        "totalDespesas": total_despesas,
        "cmvEstimado": float(cmv.quantize(_CENT, rounding=ROUND_HALF_UP)),
        "resultadoGerencial": resultado,
        "faturamentoLiquido": resultado,
    }
