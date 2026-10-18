"""Aritmética monetária centralizada (P1-K).

Política: Decimal(str(value)) + ROUND_HALF_UP para TODO valor monetário crítico
(total de pedido, saldo, caixa esperado, faturamento/despesas). Nunca misturar
com centavos inteiros. `faturamentoLiquido` passa a ter semântica explicitada:
faturamento bruto − totalDespesas (= resultadoGerencial).
"""
from decimal import Decimal

from app.services import calculos


class TestMonetarios:
    def test_0_1_mais_0_2_somam_0_3(self, ):
        itens = [
            {"qtd": 1, "precoUnitario": 0.1, "status": "aberto"},
            {"qtd": 1, "precoUnitario": 0.2, "status": "aberto"},
        ]
        assert calculos.total_pedido(itens) == 0.3

    def test_half_up_aplica_0_005_par_igual_tres_itens(self, db=None):
        """3 × 0.005 = 0.015 → HALF_UP deve ser 0.02 (banker's daria 0.01)."""
        itens = [{"qtd": 1, "precoUnitario": 0.005, "status": "aberto"} for _ in range(3)]
        assert calculos.total_pedido(itens) == 0.02

    def test_round_moeda_meio(self):
        assert calculos.round_money(0.115) == 0.12
        assert calculos.round_money(2.675) == 2.68

    def test_round_moeda_ingere_float_prepesa(self):
        # 0.1+0.2 float classique = 0.30000000000000004 → arredonda para 0.30
        assert calculos.round_money(0.1 + 0.2) == 0.3

    def test_monet_nao_usa_binario(self):
        assert calculos.monet(0.1) == Decimal("0.1")

    def test_soma_monet(self):
        assert calculos.soma_monet([0.1, 0.2]) == Decimal("0.3")
        assert calculos.soma_monet([]) == Decimal("0")

    def test_ticket_medio_half_up(self):
        assert calculos.round_money(100 / 3) == 33.33  # float 33.333333 → HALF_UP


class TestSemanticaFaturamentoLiquido:
    def test_faturamento_liquido_somado_com_despesa(self, ):
        """ Contrato: liquido = bruto - totalDespesas; resultando mesmo `resultadoGerencial`."""
        fin = calculos.resumo_financeiro(
            despesas_periodo=[{"categoria": "folha", "valor": 100}],
            saidas_com_pedido_periodo=[],
            custo_medio_por_item={},
            faturamento=350,
        )
        assert fin["resultadoGerencial"] == 250
        bruto, liquido = 350, calculos.faturamento_liquido(350, fin)
        assert liquido == 250
        assert liquido == fin["resultadoGerencial"]
