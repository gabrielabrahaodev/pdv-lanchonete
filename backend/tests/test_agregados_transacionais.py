"""Agregados transacionais (P1-G/F): init sem corrida, evento idempotente e
campos aninhados corretos (nunca chave literal `a.b`).

Comporta: registrar_venda_tx / registrar_saidas_tx / ajustar_despesa_tx â€”
levados DENTRO da transaÃ§Ã£o do caller (leitura antes de escrita), com marcador
determinÃ­stico `data/eventos_agregados/items/{evento_id}`.
"""

from app.services import agregados_service
from tests.conftest import RID
from tests.fs_stub import FakeDocRef, FakeTx, fake_dtt


def _rid_path(kind: str, item_id: str) -> str:
    return f"restaurantes/{RID}/data/{kind}/items/{item_id}"


def _run_venda(db, t, pedido_id, *, total=100.0, tipo="pix", eventos=True):
    pedido = {
        "id": pedido_id,
        "total": total,
        "itens": [{"produtoId": "prod_burger_1", "qtd": 2, "status": "pronto"}],
    }
    pagamentos = [{"tipo": tipo, "valor": total}]
    agregados_service.registrar_venda_tx(
        t,
        RID,
        pedido,
        pagamentos,
        fake_dtt(),
        evento_id=f"venda:{pedido_id}" if eventos else None,
    )


class TestInitSemCorrida:
    def test_dois_eventos_em_docs_ausentes_nao_perde_increment(self, db):
        """Doc ausente â†’ base criada + incremento na MESMA transaÃ§Ã£o; depois
        um segundo evento incrementa sobre o doc recÃ©m-criado (sem perda)."""
        t1 = FakeTx(db.store)
        _run_venda(db, t1, "p_a", total=100.0)
        t1._commit()

        t2 = FakeTx(db.store)
        _run_venda(db, t2, "p_b", total=50.0)
        t2._commit()

        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        mes = db.store.data[_rid_path("agregados_mensais", "2026-09")]

        assert dia["faturamento"] == 150.0
        assert dia["totalPedidos"] == 2
        assert mes["faturamento"] == 150.0
        assert mes["totalPedidos"] == 2

    def test_init_doc_tem_campos_todos_preenchidos(self, db):
        """Base criada com todos os campos zerados (relatÃ³rio nÃ£o ler chaves ausentes)."""
        t = FakeTx(db.store)
        _run_venda(db, t, "p_c", total=10.0)
        t._commit()
        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        for campo in {"restaurantId", "faturamento", "totalPedidos", "vendasPorHora",
                      "vendasPorFormaPagamento", "topProdutos", "saidasPorItem",
                      "despesasPorCategoria", "totalDespesas"}:
            assert campo in dia, campo

    def test_chave_somando_nao_grava_com_ponto_literal(self, db):
        """`vendasPorFormaPagamento.pix` vira campo aninhado, nunca chave literal."""
        t = FakeTx(db.store)
        _run_venda(db, t, "p_d", total=30.0, tipo="pix")
        t._commit()
        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        assert dia["vendasPorFormaPagamento"]["pix"] == 30.0
        assert "vendasPorFormaPagamento.pix" not in dia

    def test_vendasPorHora_aninhado_e_set_gravado(self, db):
        t = FakeTx(db.store)
        _run_venda(db, t, "p_e", total=12.0)
        t._commit()
        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        assert dia["vendasPorHora"]["09"] == 12.0  # 12:00 UTC = 09:00 BRT (settings.timezone)
        assert "vendasPorHora.09" not in dia
        assert "vendasPorHora.12" not in dia


class TestIdempotenciaEvento:
    def test_evento_repetido_nao_dobra_receita(self, db):
        t1 = FakeTx(db.store)
        _run_venda(db, t1, "p_f", total=77.0)
        t1._commit()

        t2 = FakeTx(db.store)
        _run_venda(db, t2, "p_f", total=77.0)  # retry com MESMO evento
        t2._commit()

        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        assert dia["faturamento"] == 77.0
        assert dia["totalPedidos"] == 1

    def test_sem_evento_duplica_por_desenho(self, db):
        """Sem evento_id (API legada), comportamento SEM idempotÃªncia â€” explÃ­cito."""
        t1 = FakeTx(db.store)
        _run_venda(db, t1, "p_g", total=40.0, eventos=False)
        t1._commit()
        t2 = FakeTx(db.store)
        _run_venda(db, t2, "p_g", total=40.0, eventos=False)
        t2._commit()
        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        assert dia["faturamento"] == 80.0  # duas somas de fato

    def test_evento_completado_documentado(self, db):
        t = FakeTx(db.store)
        _run_venda(db, t, "p_h", total=15.0)
        t._commit()
        evento = db.store.data[_rid_path("eventos_agregados", "venda:p_h")]
        assert evento["eventoId"] == "venda:p_h"
        assert evento["tipo"] == "venda"


class TestSaidasEDespesasTx:
    def test_registrar_saidas_tx_incrementa_por_item(self, db):
        t = FakeTx(db.store)
        agregados_service.registrar_saidas_tx(
            t, RID, {"farinha": 0.5, "oleo": 0.2}, fake_dtt(), evento_id="mov:m1"
        )
        t._commit()
        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        assert dia["saidasPorItem"]["farinha"] == 0.5
        assert dia["saidasPorItem"]["oleo"] == 0.2
        assert db.store.data[_rid_path("eventos_agregados", "mov:m1")]

    def test_saidas_repetidas_nao_dobram(self, db):
        t1 = FakeTx(db.store)
        agregados_service.registrar_saidas_tx(t1, RID, {"farinha": 1.5}, fake_dtt(), "mov:m2")
        t1._commit()
        t2 = FakeTx(db.store)
        agregados_service.registrar_saidas_tx(t2, RID, {"farinha": 1.5}, fake_dtt(), "mov:m2")
        t2._commit()
        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        assert dia["saidasPorItem"]["farinha"] == 1.5

    def test_ajustar_despesa_tx_creditaria_e_estorna_valor_antigo(self, db):
        t = FakeTx(db.store)
        agregados_service.ajustar_despesa_tx(
            t,
            RID,
            None,
            {"valor": 500.0, "categoria": "folha", "data": fake_dtt(), "id": "d1",
             "atualizadoEm": fake_dtt()},
            evento_id="despesa:d1:cria",
        )
        t._commit()
        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        assert dia["totalDespesas"] == 500.0
        assert dia["despesasPorCategoria"]["folha"] == 500.0

        t2 = FakeTx(db.store)
        agregados_service.ajustar_despesa_tx(
            t2,
            RID,
            {"valor": 500.0, "categoria": "folha", "data": fake_dtt(), "id": "d1",
             "atualizadoEm": fake_dtt()},
            {"valor": 350.0, "categoria": "folha", "data": fake_dtt(), "id": "d1",
             "atualizadoEm": fake_dtt()},
            evento_id="despesa:d1:edita-350",
        )
        t2._commit()
        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        assert dia["totalDespesas"] == 350.0

    def test_exclusao_zera_total(self, db):
        t = FakeTx(db.store)
        agregados_service.ajustar_despesa_tx(
            t, RID, None,
            {"valor": 25.0, "categoria": "outra", "data": fake_dtt(), "id": "d2",
             "atualizadoEm": fake_dtt()},
            "despesa:d2:cr",
        )
        t._commit()
        t2 = FakeTx(db.store)
        agregados_service.ajustar_despesa_tx(
            t2, RID,
            {"valor": 25.0, "categoria": "outra", "data": fake_dtt(), "id": "d2",
             "atualizadoEm": fake_dtt()},
            None, "despesa:d2:del",
        )
        t2._commit()
        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        assert dia["totalDespesas"] == 0.0

    def test_evento_repetido_despesa_nao_dobra(self, db):
        t = FakeTx(db.store)
        agregados_service.ajustar_despesa_tx(
            t, RID, None,
            {"valor": 100.0, "categoria": "insumo", "data": fake_dtt(), "id": "d3",
             "atualizadoEm": fake_dtt()},
            "despesa:d3:cria",
        )
        t._commit()
        t2 = FakeTx(db.store)
        agregados_service.ajustar_despesa_tx(
            t2, RID, None,
            {"valor": 100.0, "categoria": "insumo", "data": fake_dtt(), "id": "d3",
             "atualizadoEm": fake_dtt()},
            "despesa:d3:cria",
        )
        t2._commit()
        dia = db.store.data[_rid_path("agregados_diarios", "2026-09-27")]
        assert dia["totalDespesas"] == 100.0


class TestInterfaceCompat:
    def test_funcs_nao_tx_ainda_existem(self):
        """API pÃ³s-commit (registrar_venda/registrar_saidas/ajustar_despesa) preservada."""
        for fn in ("registrar_venda", "registrar_saidas", "ajustar_despesa", "obter", "resumo_agregado"):
            assert callable(getattr(agregados_service, fn)), fn
