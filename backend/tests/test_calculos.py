"""Cálculos puros: total de pedido, consumo de receita e DRE."""
from app.services import calculos


class TestTotalPedido:
    def test_soma_itens_nao_cancelados(self):
        itens = [
            {"qtd": 2, "precoUnitario": 10.0, "status": "pendente"},
            {"qtd": 1, "precoUnitario": 5.5, "status": "pronto"},
        ]
        assert calculos.total_pedido(itens) == 25.5

    def test_ignora_cancelados(self):
        itens = [
            {"qtd": 2, "precoUnitario": 10.0, "status": "pendente"},
            {"qtd": 3, "precoUnitario": 99.0, "status": "cancelado"},
        ]
        assert calculos.total_pedido(itens) == 20.0

    def test_lista_vazia(self):
        assert calculos.total_pedido([]) == 0

    def test_arredonda_para_2_casas(self):
        itens = [{"qtd": 3, "precoUnitario": 0.1, "status": "aberto"}]
        assert calculos.total_pedido(itens) == 0.3


class TestAgregarConsumoReceita:
    def test_multiplica_pela_qtd_do_item(self):
        receita = [
            {"itemId": "farinha", "qtd": 0.2},
            {"itemId": "carne", "qtd": 0.15},
        ]
        assert calculos.agregar_consumo_receita(receita, qtd_item=3) == {
            "farinha": 0.6,
            "carne": 0.45,
        }

    def test_agrupa_item_repetido(self):
        receita = [
            {"itemId": "oleo", "qtd": 0.1},
            {"itemId": "oleo", "qtd": 0.05},
        ]
        assert calculos.agregar_consumo_receita(receita, qtd_item=10)["oleo"] == 1.5

    def test_ignora_invalidos(self):
        receita = [
            {"itemId": "", "qtd": 5},
            {"itemId": None, "qtd": 5},
            {"itemId": "sal", "qtd": 0},
            {"itemId": "sal", "qtd": -1},
            {"foo": "bar"},
        ]
        assert calculos.agregar_consumo_receita(receita, qtd_item=1) == {}

    def test_qtd_fracionaria(self):
        assert calculos.agregar_consumo_receita([{"itemId": "x", "qtd": 0.333}], qtd_item=3)["x"] == 0.999


def _d(cat, valor):
    return {"categoria": cat, "valor": valor}


def _s(item_id, qtd):
    return {"tipo": "saida", "itemId": item_id, "qtd": qtd}


class TestResumoFinanceiro:
    def test_dre_completo(self):
        r = calculos.resumo_financeiro(
            despesas_periodo=[
                _d("insumo", 150.50),
                _d("folha", 1200),
                _d("conta_fixa", 89.90),
                _d("outra", 0),
            ],
            saidas_com_pedido_periodo=[_s("farinha", 6)],
            custo_medio_por_item={"farinha": 5.0},
            faturamento=235.0,
        )
        assert r["despesasPorCategoria"] == {
            "insumo": 150.5,
            "folha": 1200.0,
            "conta_fixa": 89.9,
            "outra": 0.0,
        }
        assert r["totalDespesas"] == 1440.4
        assert r["cmvEstimado"] == 30.0
        assert r["resultadoGerencial"] == -1205.4

    def test_categoria_desconhecida_cai_em_outra(self):
        r = calculos.resumo_financeiro(
            despesas_periodo=[{"categoria": "marketing", "valor": 100}],
            saidas_com_pedido_periodo=[],
            custo_medio_por_item={},
            faturamento=500,
        )
        assert r["despesasPorCategoria"]["outra"] == 100
        assert r["totalDespesas"] == 100

    def test_item_sem_custo_medio_contribui_zero(self):
        r = calculos.resumo_financeiro(
            despesas_periodo=[],
            saidas_com_pedido_periodo=[_s("fantasma", 99)],
            custo_medio_por_item={"outro": 10},
            faturamento=100,
        )
        assert r["cmvEstimado"] == 0
        assert r["resultadoGerencial"] == 100

    def test_vazio(self):
        r = calculos.resumo_financeiro(
            despesas_periodo=[], saidas_com_pedido_periodo=[], custo_medio_por_item={}, faturamento=0
        )
        assert r["totalDespesas"] == 0
        assert r["cmvEstimado"] == 0
        assert r["resultadoGerencial"] == 0
