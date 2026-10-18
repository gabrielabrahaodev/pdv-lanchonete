"""Testes do backfill de agregados (P1-H) — dry-run é o padrão; --apply grava.

Estrutura dos docs escritos É A MESMA do agregado canônico
(agregados_service._base_doc): pids crus — nomes ficam na LEITURA.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.services import relatorios_service
from app.services import backfill_service
from tests.conftest import RID

_TZ = ZoneInfo("America/Sao_Paulo")
_UTC = timezone.utc


def _path(kind, item_id):
    return f"restaurantes/{RID}/data/{kind}/items/{item_id}"


def _seed_base(db):
    db.store.data[_path("pedidos", "p1")] = {
        "id": "p1", "status": "pago", "tipo": "local", "mesaId": "m1",
        "itens": [{"produtoId": "prod_x", "qtd": 2, "precoUnitario": 50.0, "status": "pronto"}],
        "total": 100.0,
        "pagamentos": [{"id": "pg1", "tipo": "pix", "valor": 100.0}],
        "restaurantId": RID,
        "createdAt": datetime(2026, 9, 26, 11, 0, tzinfo=_UTC),
        "fechadoEm": datetime(2026, 9, 27, 12, 0, tzinfo=_UTC),  # 09:00 em São Paulo
        "updatedAt": datetime(2026, 9, 27, 12, 0, tzinfo=_UTC),
    }
    db.store.data[_path("despesas", "d1")] = {
        "id": "d1", "descricao": "Folha", "categoria": "folha", "valor": 40.0,
        "status": "pago", "data": datetime(2026, 9, 28, 17, 0, tzinfo=_UTC),  # 14:00 São Paulo
        "restaurantId": RID,
    }
    db.store.data[_path("movimentacoes_estoque", "mt1")] = {
        "id": "mt1", "tipo": "saida", "pedidoId": "p1", "itemId": "farinha",
        "qtd": 0.5, "custoTotal": 5.0, "criadoEm": datetime(2026, 9, 27, 12, 0, tzinfo=_UTC),
        "restaurantId": RID,
    }
    db.store.data[_path("produtos", "prod_x")] = {
        "id": "prod_x", "nome": "Produto X", "categoriaId": "cat_lanches", "restaurantId": RID,
    }
    db.store.data[_path("categorias", "cat_lanches")] = {"id": "cat_lanches", "nome": "Lanches", "restaurantId": RID}
    db.store.data[_path("estoque", "farinha")] = {"id": "farinha", "custoMedio": 10.0, "restaurantId": RID}


class TestBackfill:
    def test_dry_run_nao_escreve_e_plano_correto(self, db):
        """Sem apply: nada é escrito; plano lista dias/meses e conta fontes."""
        _seed_base(db)
        antes = dict(db.store.data)

        out = backfill_service.reconstruir(RID)

        assert out["aplicado"] is False
        assert out["pedidosConsiderados"] == 1
        assert out["despesasConsideradas"] == 1
        assert out["saidasConsideradas"] == 1
        assert out["dias"] == ["2026-09-27", "2026-09-28"]
        assert out["meses"] == ["2026-09"]
        assert db.store.data == antes  # nenhuma escrita

    def test_apply_escreve_docs_no_formato_canonico(self, db):
        _seed_base(db)

        out = backfill_service.reconstruir(RID, apply=True)

        assert out["aplicado"] is True
        assert out["agregadoDesde"] == "2026-09-27"

        dia = db.store.data[_path("agregados_diarios", "2026-09-27")]
        assert dia["faturamento"] == 100.0
        assert dia["totalPedidos"] == 1
        assert dia["vendasPorHora"] == {"09": 100.0}  # 12:00Z → 09h São Paulo
        assert dia["vendasPorFormaPagamento"] == {"pix": 100.0}
        assert dia["topProdutos"] == {"prod_x": 2}  # pid cru, como o Increment grava
        assert dia["saidasPorItem"] == {"farinha": 0.5}
        assert dia["despesasPorCategoria"] == {}  # despesa é do dia 28
        assert dia["totalDespesas"] == 0.0
        assert "financeiro" not in dia  # financeiro é ON-READ (resumo_agregado)

        dia28 = db.store.data[_path("agregados_diarios", "2026-09-28")]
        assert dia28["faturamento"] == 0.0
        assert dia28["despesasPorCategoria"] == {"folha": 40.0}
        assert dia28["totalDespesas"] == 40.0

        mes = db.store.data[_path("agregados_mensais", "2026-09")]
        assert mes["faturamento"] == 100.0
        assert mes["topProdutos"] == {"prod_x": 2}
        assert mes["despesasPorCategoria"] == {"folha": 40.0}
        assert mes["totalDespesas"] == 40.0

        meta = db.store.data[_path("agregados_meta", "cobertura")]
        assert meta["agregadoDesde"] == "2026-09-27"

    def test_relatorio_por_intervalo_consome_o_backfill(self, db):
        """P1-H → P1-I: após reconstruir, relatório 28/09 vai por AGREGADOS."""
        _seed_base(db)
        backfill_service.reconstruir(RID, apply=True)

        inicio = datetime(2026, 9, 28, 0, 0, tzinfo=_TZ)
        fim = datetime(2026, 9, 28, 23, 59, 59, tzinfo=_TZ)
        r = relatorios_service.resumo(RID, inicio, fim)
        assert r["faturamentoBruto"] == 0.0
        assert r["financeiro"]["totalDespesas"] == 40.0

    def test_vazio_nao_quebra_apply(self, db):
        out = backfill_service.reconstruir(RID, apply=True)
        assert out["aplicado"] is True
        assert out["dias"] == []
        assert out["meses"] == []
