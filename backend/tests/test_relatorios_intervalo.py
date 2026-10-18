"""Relatórios por intervalo com agregados + fallback histórico (P1-I/J).

- Janela de vendas por COMPETÊNCIA de quitação: `fechadoEm` governa o intervalo
  (bug antigo: filtrava por createdAt e pedidos pagos criados antes da janela
  silenciosamente sumiam do relatório).
- Agregados (dia/mês pré-computados) são usados só quando o marcador de
  cobertura (`data/agregados_meta/items/cobertura`) cobre TODO o intervalo;
  senão cai no caminho histórico original. Nunca mistura parcial.
- faturamentoLiquido definido: faturamento − totalDespesas.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.services import relatorios_service
from tests.conftest import RID
from tests.fs_stub import fake_dtt

_TZ = ZoneInfo(settings.timezone)


def _doc(pedido_id, *, criado, fechado, status="pago", total=100.0):
    return {
        "id": pedido_id,
        "mesaId": "m1",
        "tipo": "local",
        "status": status,
        "itens": [{"produtoId": "prod_x", "qtd": 2, "precoUnitario": 50.0, "status": "pronto"}],
        "total": total,
        "pagamentos": [{"id": "pg", "tipo": "pix", "valor": total}] if status == "pago" else [],
        "restaurantId": RID,
        "createdAt": criado,
        "fechadoEm": fechado,
        "updatedAt": fechado or criado,
    }


def _path(kind, item_id):
    return f"restaurantes/{RID}/data/{kind}/items/{item_id}"


class TestJanelaFechadoEm:
    def test_pago_criado_antes_e_quitado_dentro_conta(self, db):
        """Pedido criado 26/09 (fora) e pago 27/09 (dentro): DEVE contar na
        janela 27/09 — competência de quitação, não criação."""
        d26 = datetime(2026, 9, 26, 12, 0, tzinfo=_TZ)
        d27 = datetime(2026, 9, 27, 12, 0, tzinfo=_TZ)
        db.store.data[_path("pedidos", "pA")] = _doc("pA", criado=d26, fechado=d27)
        inicio = datetime(2026, 9, 27, 0, 0, tzinfo=_TZ)
        fim = datetime(2026, 9, 27, 23, 59, 59, tzinfo=_TZ)

        r = relatorios_service.resumo(RID, inicio, fim)
        assert r["totalPedidos"] == 1
        assert r["faturamentoBruto"] == 100.0

    def test_quitado_fora_da_janela_nao_conta(self, db):
        """Pago em 26/09 (fora janela): não entra — mesmo criado dentro? Não:
        pagamento fora da janela (antes), então tambéfr não conta."""
        d26 = datetime(2026, 9, 26, 12, 0, tzinfo=_TZ)
        db.store.data[_path("pedidos", "pB")] = _doc("pB", criado=d26, fechado=d26)
        db.store.data[_path("pedidos", "pC")] = _doc(
            "pC", criado=d26, fechado=d26, status="aberto", total=55.0
        )
        inicio = datetime(2026, 9, 27, 0, 0, tzinfo=_TZ)
        fim = datetime(2026, 9, 27, 23, 59, 59, tzinfo=_TZ)

        r = relatorios_service.resumo(RID, inicio, fim)
        assert r["totalPedidos"] == 0

    def test_virada_de_dia_inclusiva(self, db):
        """Quitado exatamente à 00:00 do dia e 23:59:59 contam (limites inclusivos)."""
        d26 = datetime(2026, 9, 26, 12, 0, tzinfo=_TZ)
        zero = datetime(2026, 9, 27, 0, 0, tzinfo=_TZ)
        late = datetime(2026, 9, 27, 23, 59, 59, tzinfo=_TZ)
        db.store.data[_path("pedidos", "z1")] = _doc("z1", criado=d26, fechado=zero, total=30.0)
        db.store.data[_path("pedidos", "z2")] = _doc("z2", criado=d26, fechado=late, total=70.0)
        inicio = datetime(2026, 9, 27, 0, 0, tzinfo=_TZ)
        fim = datetime(2026, 9, 27, 23, 59, 59, tzinfo=_TZ)
        r = relatorios_service.resumo(RID, inicio, fim)
        assert r["totalPedidos"] == 2
        assert r["faturamentoBruto"] == 100.0


class TestCoberturaAgregados:
    def _seed_cobertura(self, db, desde: str):
        db.store.data[_path("agregados_meta", "cobertura")] = {
            "agregadoDesde": desde,
            "geradoEm": fake_dtt(),
        }

    def _seed_dia(self, db, dia: str, faturamento: float, pedidos: int):
        db.store.data[_path("agregados_diarios", dia)] = {
            "restaurantId": RID,
            "faturamento": faturamento,
            "totalPedidos": pedidos,
            "vendasPorHora": {f"{h:02d}": faturamento / 4 for h in range(4)},
            "vendasPorFormaPagamento": {"pix": faturamento},
            "topProdutos": {"prod_x": 2},
            "saidasPorItem": {"farinha": 0.5},
            "despesasPorCategoria": {"folha": 40.0},
            "totalDespesas": 40.0,
        }

    def test_agregados_usados_quando_cobertura_cobre(self, db):
        self._seed_cobertura(db, "2026-09-01")
        self._seed_dia(db, "2026-09-27", 250.0, 3)
        db.store.data[_path("produtos", "prod_x")] = {
            "id": "prod_x", "nome": "Produto X", "restaurantId": RID,
        }
        inicio = datetime(2026, 9, 27, 0, 0, tzinfo=_TZ)
        fim = datetime(2026, 9, 27, 23, 59, 59, tzinfo=_TZ)

        r = relatorios_service.resumo(RID, inicio, fim)

        assert r["totalPedidos"] == 3
        assert r["faturamentoBruto"] == 250.0
        assert r["faturamentoLiquido"] == 210.0  # bruto − totalDespesas(40)
        fin = r["financeiro"]
        assert fin["totalDespesas"] == 40.0
        assert fin["resultadoGerencial"] == 210.0
        assert r["topProdutos"] == {"Produto X": 2}  # nomeado a partir de produtos

    def test_janela_varios_dias_soma(self, db):
        self._seed_cobertura(db, "2026-09-01")
        self._seed_dia(db, "2026-09-27", 100.0, 1)
        self._seed_dia(db, "2026-09-28", 60.0, 1)
        inicio = datetime(2026, 9, 27, 0, 0, tzinfo=_TZ)
        fim = datetime(2026, 9, 28, 23, 59, 59, tzinfo=_TZ)

        r = relatorios_service.resumo(RID, inicio, fim)
        assert r["faturamentoBruto"] == 160.0
        assert r["totalPedidos"] == 2

    def test_cobertura_comeca_depois_do_inicio_fallback_historico(self, db):
        """Cobertura só fecha desde 27; janela começa em 26 → caminho HISTÓRICO
        (não misturado). Pedido pago do dia 26 entra via historico."""
        self._seed_cobertura(db, "2026-09-27")
        d26 = datetime(2026, 9, 26, 12, 0, tzinfo=_TZ)
        db.store.data[_path("pedidos", "h1")] = _doc("h1", criado=d26, fechado=d26, total=80.0)
        inicio = datetime(2026, 9, 26, 0, 0, tzinfo=_TZ)
        fim = datetime(2026, 9, 28, 23, 59, 59, tzinfo=_TZ)

        r = relatorios_service.resumo(RID, inicio, fim)

        assert r["totalPedidos"] == 1
        assert r["faturamentoBruto"] == 80.0

    def test_sem_cobertura_usa_historico(self, db):
        d27 = datetime(2026, 9, 27, 12, 0, tzinfo=_TZ)
        db.store.data[_path("pedidos", "h2")] = _doc("h2", criado=d27, fechado=d27, total=45.5)
        inicio = datetime(2026, 9, 27, 0, 0, tzinfo=_TZ)
        fim = datetime(2026, 9, 27, 23, 59, 59, tzinfo=_TZ)

        r = relatorios_service.resumo(RID, inicio, fim)
        assert r["faturamentoBruto"] == 45.5
        assert r["totalPedidos"] == 1
