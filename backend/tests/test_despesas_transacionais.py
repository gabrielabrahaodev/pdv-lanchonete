"""Despesas transacionais (P1-F): doc + agregados numa ÚNICA transação.

O antigo gravava doc, depois chamava agregados pós-commit — uma falha no
meio deixava despesa sem agregado (ou agregado sem despesa). Agora o doc e
os incrementos dia/mês vão juntos, com evento determinístico.
"""
from datetime import datetime

from fastapi import HTTPException

from app.models.models import DespesaCreate, DespesaUpdate
from app.services import agregados_service, despesas_service
from tests.conftest import RID
from tests.fs_stub import fake_dtt


def _competencia_caminho(dia: str, mes: str) -> tuple[str, str]:
    d = f"restaurantes/{RID}/data/agregados_diarios/items/{dia}"
    m = f"restaurantes/{RID}/data/agregados_mensais/items/{mes}"
    return d, m


def _despesa_payload(**overrides):
    base = {
        "categoria": "folha",
        "descricao": "Salário January 2026",
        "valor": 500.0,
        "data": fake_dtt(),
    }
    base.update(overrides)
    return DespesaCreate(**base)


class TestCriar:
    def test_cria_doc_e_credencia_agregado_na_mesma_transacao(self, db):
        d, m = _competencia_caminho("2026-09-27", "2026-09")

        criado = despesas_service.criar(RID, _despesa_payload())

        assert criado["status"] == "pendente"
        assert db.store.data[f"restaurantes/{RID}/data/despesas/items/{criado['id']}"]
        dia = db.store.data[d]
        assert dia["totalDespesas"] == 500.0
        assert dia["despesasPorCategoria"]["folha"] == 500.0
        mes = db.store.data[m]
        assert mes["totalDespesas"] == 500.0

    def test_evento_maragdado(self, db):
        criado = despesas_service.criar(RID, _despesa_payload())
        evento = db.store.data[f"restaurantes/{RID}/data/eventos_agregados/items/despesa:{criado['id']}:cria"]
        assert evento["tipo"] == "despesa"


class TestAtualizar:
    def test_edita_valor_estorna_compatencia_ganha_novo(self, db):
        d, _ = _competencia_caminho("2026-09-27", "2026-09")
        criado = despesas_service.criar(RID, _despesa_payload())

        despesas_service.atualizar(
            RID, criado["id"], DespesaUpdate(valor=350.0)
        )

        dia = db.store.data[d]
        assert dia["totalDespesas"] == 350.0
        assert dia["despesasPorCategoria"]["folha"] == 350.0
        doc = despesas_service.obter(RID, criado["id"])
        assert doc["valor"] == 350.0

    def test_muda_competencia_migra_entre_dias(self, db):
        d_old, _ = _competencia_caminho("2026-09-27", "2026-09")
        d_new, _ = _competencia_caminho("2026-09-28", "2026-09")
        criado = despesas_service.criar(RID, _despesa_payload())

        despesas_service.atualizar(
            RID, criado["id"], DespesaUpdate(data=datetime(2026, 9, 28, 12, 0, tzinfo=None))
        )

        assert db.store.data[d_old]["totalDespesas"] == 0.0
        assert db.store.data[d_new]["totalDespesas"] == 500.0

    def test_marca_pago_sem_mudar_total_agregado(self, db):
        d, _ = _competencia_caminho("2026-09-27", "2026-09")
        criado = despesas_service.criar(RID, _despesa_payload())

        despesas_service.marcar_pago(RID, criado["id"], None)

        assert db.store.data[d]["totalDespesas"] == 500.0  # competência por `data`
        assert despesas_service.obter(RID, criado["id"])["status"] == "pago"

    def test_reabrir_limpa_pagoEm(self, db):
        criado = despesas_service.criar(RID, _despesa_payload())
        despesas_service.marcar_pago(RID, criado["id"], None)
        pagas = despesas_service.listar(RID, status="pago")
        assert len(pagas) == 1
        despesas_service.atualizar(RID, criado["id"], DespesaUpdate(ativo_pago=False))
        again = despesas_service.obter(RID, criado["id"])
        assert again["status"] == "pendente"
        assert "pagoEm" not in again

    def test_categoria_invalida_422(self, db):
        db.store.data[f"restaurantes/{RID}/data/despesas/items/x"] = {"valor": 1}
        with pytest.raises(HTTPException) as err:
            despesas_service.listar(RID, categoria="marketing")
        assert err.value.status_code == 422


class TestRemover:
    def test_excluir_zera_agregado(self, db):
        d, _ = _competencia_caminho("2026-09-27", "2026-09")
        criado = despesas_service.criar(RID, _despesa_payload())
        assert db.store.data[d]["totalDespesas"] == 500.0

        despesas_service.remover(RID, criado["id"])

        assert db.store.data[d]["totalDespesas"] == 0.0
        assert db.store.data.get(f"restaurantes/{RID}/data/despesas/items/{criado['id']}") is None

    def test_excluir_inexistente_404(self, db):
        with pytest.raises(HTTPException) as err:
            despesas_service.remover(RID, "fantasma")
        assert err.value.status_code == 404


import pytest  # noqa: E402
