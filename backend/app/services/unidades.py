"""Conversões exatas. Embalagens exigem fator por insumo; nunca peso/volume."""

from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException

UNIDADES = {"un", "kg", "g", "L", "ml", "cx", "pct"}
BASE = {
    "kg": ("massa", Decimal(1000)),
    "g": ("massa", Decimal(1)),
    "L": ("volume", Decimal(1000)),
    "ml": ("volume", Decimal(1)),
    "un": ("unidade", Decimal(1)),
}


def converter(qtd, origem, destino, unidade_compra=None, fator=None):
    valor = Decimal(str(qtd))
    if not valor.is_finite() or valor < 0:
        raise HTTPException(422, "Quantidade inválida")
    if origem == destino:
        return valor
    if (
        origem in {"cx", "pct"}
        and origem == unidade_compra
        and fator
        and destino not in {"cx", "pct"}
    ):
        return valor * Decimal(str(fator))
    if origem in BASE and destino in BASE and BASE[origem][0] == BASE[destino][0]:
        return valor * BASE[origem][1] / BASE[destino][1]
    raise HTTPException(
        422, "Unidades incompatíveis ou fator da embalagem não cadastrado"
    )


def quantidade_controle(qtd, origem, item):
    valor = converter(
        qtd,
        origem or item["unidade"],
        item["unidade"],
        item.get("unidadeCompra"),
        item.get("fatorCompra"),
    )
    arredondado = valor.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    if valor != arredondado:
        raise HTTPException(
            422,
            "Quantidade convertida excede a precisão de 0,001 da unidade de controle",
        )
    return float(arredondado)


def custo_medio_entrada(saldo_atual, custo_atual, quantidade_controle_recebida, valor_total_compra):
    """Média ponderada em unidade de CONTROLE, a partir do valor total em reais.

    Não arredonda o custo por grama antes da média. Moeda da compra exige
    centavos; custo armazenado permite oito casas decimais.
    """
    saldo = Decimal(str(saldo_atual))
    custo = Decimal(str(custo_atual))
    qtd = Decimal(str(quantidade_controle_recebida))
    total = Decimal(str(valor_total_compra))
    if any(not x.is_finite() for x in (saldo, custo, qtd, total)):
        raise HTTPException(422, "Quantidade ou valor inválido")
    if qtd <= 0 or custo < 0 or total <= 0:
        raise HTTPException(422, "Compra exige quantidade e valor total positivos")
    if total != total.quantize(Decimal("0.01")):
        raise HTTPException(422, "Valor total da compra deve ter no máximo dois decimais")
    base = max(saldo, Decimal(0))
    resultado = ((base * custo + total) / (base + qtd)).quantize(
        Decimal("0.00000001"), rounding=ROUND_HALF_UP
    )
    if resultado <= 0:
        raise HTTPException(422, "Custo muito pequeno para a precisão do estoque")
    return float(resultado)
