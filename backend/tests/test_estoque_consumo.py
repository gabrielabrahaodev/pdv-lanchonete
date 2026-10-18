"""Contrato de retorno de _aplicar_consumo: TODOS os caminhos retornam tuple[bool, dict].

Bug corrigido (P1-C): com baixa automática desativada devolvia `False` sozinho —
os chamadores fazem `_, aplicadas = ...` eram estouravam com TypeError.
"""
import pytest

from app.services import pedidos_service
from tests.conftest import RID, doc_path, seed
from tests.fs_stub import FakeTx


def _tx(db):
    return FakeTx(db.store)


class TestContratoRetorno:
    def test_flag_desativada_retorna_tuple_vazio(self, db):
        """Flag off → (False, {}) e NENhuma escrita de movimentação/saldo."""
        db.store.data[f"restaurantes/{RID}/data/configuracoes"] = {"baixaEstoqueAutomatica": False}
        path = doc_path(RID, "estoque", "farinha")
        db.store.data[path] = {"quantidadeAtual": 100.0}

        escreveu, aplicadas = pedidos_service._aplicar_consumo(
            _tx(db), RID, "pedido_1", {"farinha": 0.5}, "u1"
        )

        assert (escreveu, aplicadas) == (False, {})
        assert db.store.data[path]["quantidadeAtual"] == 100.0
        movs = list(
            db.collection(doc_path(RID, "movimentacoes_estoque")).stream()
        )
        assert movs == []

    def test_sem_config_aplica_regra_padrao_on(self, db):
        """Sem doc de configuração → flag default True → aplica e escreve mov."""
        path = doc_path(RID, "estoque", "farinha")
        db.store.data[path] = {"quantidadeAtual": 10.0}

        escreveu, aplicadas = pedidos_service._aplicar_consumo(
            _tx(db), RID, "pedido_2", {"farinha": 0.5}, "u1"
        )

        assert escreveu is True
        assert aplicadas == {"farinha": 0.5}
        assert db.store.data[path]["quantidadeAtual"] == 9.5
        movs = list(db.collection(doc_path(RID, "movimentacoes_estoque")).stream())
        assert len(movs) == 1
        mov = movs[0].to_dict()
        assert mov["tipo"] == "saida"
        assert mov["qtd"] == 0.5
        assert mov["saldoApos"] == 9.5
        assert mov["pedidoId"] == "pedido_2"

    def test_ingrediente_removido_nao_trava_preparo(self, db):
        """Item de estoque ausente → pula, sem escrita, tuple vazio."""
        escreveu, aplicadas = pedidos_service._aplicar_consumo(
            _tx(db), RID, "pedido_3", {"fantasma": 2.0}, "u1"
        )
        assert (escreveu, aplicadas) == (False, {})

    def test_saldo_micro_negativo_permite_preparo(self, db):
        """Pode ficar negativo (regra explícita): consumo 1.0 sobre saldo 0.2 → -0.8."""
        path = doc_path(RID, "estoque", "carne")
        seed(db, RID, "estoque", "carne", {"quantidadeAtual": 0.2})

        escreveu, aplicadas = pedidos_service._aplicar_consumo(
            _tx(db), RID, "pedido_4", {"carne": 1.0}, "u1"
        )

        assert (escreveu, aplicadas) == (True, {"carne": 1.0})
        assert db.store.data[path]["quantidadeAtual"] == pytest.approx(-0.8)

    def test_consumo_agregado_dois_itens_uma_escrita_por_ingrediente(self, db):
        """Dois insumos juntos → uma saidaDocumentation por ingrediente e saldo coletic.

        consumption dict passa pré-agregado: um disparo por itemId exclusivamente.
        """
        far = doc_path(RID, "estoque", "farinha")
        oleo = doc_path(RID, "estoque", "oleo")
        db.store.data[far] = {"quantidadeAtual": 5.0}
        db.store.data[oleo] = {"quantidadeAtual": 1.0}

        escreveu, aplicadas = pedidos_service._aplicar_consumo(
            _tx(db), RID, "p5", {"farinha": 0.4, "oleo": 0.2}, "u1"
        )

        assert escreveu is True
        assert aplicadas == {"farinha": 0.4, "oleo": 0.2}
        assert db.store.data[far]["quantidadeAtual"] == 4.6
        assert db.store.data[oleo]["quantidadeAtual"] == 0.8
