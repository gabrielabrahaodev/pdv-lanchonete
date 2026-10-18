"""Pagamento transacional e idempotente (P1-E).

O antigo registrar_pagamento lia FORA da transação, escrevia pedido e depois
caixa/agregado/mesa separadamente — falha no meio deixava pedido pago com
caixa divergente. Agora: UMA transação (leituras todas antes de escritas),
marcador de idempotência opcional e evento agregado determinístico.
"""
from fastapi import HTTPException

from app.services import caixa_service
from tests.conftest import RID, doc_path
from tests.fs_stub import fake_dtt


def _pedido(db, pedido_id, *, total=100.0, status="aberto", mesa_id="m1", pagamentos=None, itens=None):
    db.store.data[doc_path(RID, "pedidos", pedido_id)] = {
        "mesaId": mesa_id,
        "tipo": "local",
        "status": status,
        "itens": itens or [{"produtoId": "prod_burger", "qtd": 2, "precoUnitario": 50.0, "status": "pronto"}],
        "total": total,
        "pagamentos": pagamentos or [],
        "usuarioId": "u1",
        "restaurantId": RID,
        "createdAt": fake_dtt(),
        "updatedAt": fake_dtt(),
    }


def _mesa(db, mesa_id="m1", pedido_ativo=None):
    db.store.data[doc_path(RID, "mesas", mesa_id)] = {
        "numero": 1,
        "status": "ocupada" if pedido_ativo else "livre",
        "pedidoAtivoId": pedido_ativo,
        "garcomId": None if pedido_ativo else "u1",
        "restaurantId": RID,
        "createdAt": fake_dtt(),
        "updatedAt": fake_dtt(),
    }


def _sessao(db, sessao_id="s1", status="aberto"):
    db.store.data[doc_path(RID, "sessoes_caixa", sessao_id)] = {
        "usuarioId": "u1",
        "valorInicial": 100.0,
        "abertoEm": fake_dtt(),
        "totalVendas": 0.0,
        "totalRecebido": 0.0,
        "suprimentos": 0.0,
        "sangrias": 0.0,
        "status": status,
        "vendasPorFormaPagamento": {},
        "quantidadePorProduto": {},
        "movimentacoesCaixa": [],
        "restaurantId": RID,
        "createdAt": fake_dtt(),
        "updatedAt": fake_dtt(),
    }


def _pag(**kw):
    base = {"tipo": "pix", "valor": 100.0}
    base.update(kw)
    return caixa_service.registrar_pagamento(RID, "u1", base.pop("pedido_id", "p1"), **base)


class TestQuitacao:
    def test_quita_e_credita_caixa_mesa_agregado_uma_vez(self, db):
        _pedido(db, "p1")
        _mesa(db, "m1", pedido_ativo="p1")
        _sessao(db)

        out = caixa_service.registrar_pagamento(RID, "u1", "p1", tipo="pix", valor=100.0, idempotency_key="k1")

        assert out["status"] == "pago"
        sessao = db.store.data[doc_path(RID, "sessoes_caixa", "s1")]
        assert sessao["totalVendas"] == 100.0
        assert sessao["totalRecebido"] == 100.0
        assert sessao["vendasPorFormaPagamento"]["pix"] == 100.0
        assert sessao["quantidadePorProduto"]["prod_burger"] == 2
        mesa = db.store.data[doc_path(RID, "mesas", "m1")]
        assert mesa["status"] == "livre"
        assert "pedidoAtivoId" not in mesa
        dia = db.store.data[f"restaurantes/{RID}/data/agregados_diarios/items/2026-09-27"]
        assert dia["faturamento"] == 100.0
        assert dia["totalPedidos"] == 1
        ped = db.store.data[doc_path(RID, "pedidos", "p1")]
        assert ped.get("fechadoEm") is not None

    def test_marcador_idempotencia_gravado(self, db):
        _pedido(db, "p1")
        _sessao(db)
        caixa_service.registrar_pagamento(RID, "u1", "p1", tipo="pix", valor=100.0, idempotency_key="k2")
        ev = db.store.data[f"restaurantes/{RID}/data/eventos_pagamento/items/p1:k2"]
        assert ev["tipo"] == "pagamento"

    def test_pagamento_parcial_nao_credita_nada(self, db):
        _pedido(db, "p2", total=100.0)
        _mesa(db, "m1", pedido_ativo="p2")
        _sessao(db)

        out = caixa_service.registrar_pagamento(RID, "u1", "p2", tipo="dinheiro", valor=50.0)

        assert out["status"] == "aberto"
        assert len(out["pagamentos"]) == 1
        sessao = db.store.data[doc_path(RID, "sessoes_caixa", "s1")]
        assert sessao["totalVendas"] == 0.0  # créditos só na quitação
        mesa = db.store.data[doc_path(RID, "mesas", "m1")]
        assert mesa["status"] == "ocupada"
        dia_path = f"restaurantes/{RID}/data/agregados_diarios/items/2026-09-27"
        assert dia_path not in db.store.data

    def test_segundo_pagamento_quita_somando_sessao(self, db):
        _pedido(db, "p3", total=100.0)
        _mesa(db, "m1", pedido_ativo="p3")
        _sessao(db)
        caixa_service.registrar_pagamento(RID, "u1", "p3", tipo="dinheiro", valor=50.0)
        caixa_service.registrar_pagamento(RID, "u1", "p3", tipo="pix", valor=50.0)

        ped = db.store.data[doc_path(RID, "pedidos", "p3")]
        assert ped["status"] == "pago"
        sessao = db.store.data[doc_path(RID, "sessoes_caixa", "s1")]
        assert sessao["totalVendas"] == 100.0
        assert sessao["totalRecebido"] == 100.0
        assert sessao["vendasPorFormaPagamento"]["dinheiro"] == 50.0
        assert sessao["vendasPorFormaPagamento"]["pix"] == 50.0
        mesa = db.store.data[doc_path(RID, "mesas", "m1")]
        assert mesa["status"] == "livre"
        dia = db.store.data[f"restaurantes/{RID}/data/agregados_diarios/items/2026-09-27"]
        assert dia["faturamento"] == 100.0
        assert dia["totalPedidos"] == 1


class TestValidacoes:
    def test_valor_excede_saldo_422_sem_escrita(self, db):
        _pedido(db, "p4")
        _sessao(db)
        with pytest.raises(HTTPException) as err:
            caixa_service.registrar_pagamento(RID, "u1", "p4", tipo="pix", valor=120.0)
        assert err.value.status_code == 422
        sessao = db.store.data[doc_path(RID, "sessoes_caixa", "s1")]
        assert sessao["totalRecebido"] == 0.0
        ped = db.store.data[doc_path(RID, "pedidos", "p4")]
        assert ped["pagamentos"] == []

    def test_tipo_invalido_422(self, db):
        with pytest.raises(HTTPException) as err:
            caixa_service.registrar_pagamento(RID, "u1", "p1", tipo="cheque", valor=10.0)
        assert err.value.status_code == 422

    def test_pedido_inexistente_404(self, db):
        with pytest.raises(HTTPException) as err:
            caixa_service.registrar_pagamento(RID, "u1", "fantasma", tipo="pix", valor=10.0)
        assert err.value.status_code == 404

    def test_pedido_ja_pago_409(self, db):
        _pedido(db, "p5", status="pago")
        with pytest.raises(HTTPException) as err:
            caixa_service.registrar_pagamento(RID, "u1", "p5", tipo="pix", valor=10.0)
        assert err.value.status_code == 409


class TestIdempotencia:
    def test_replay_mesma_key_nao_dobra_receita(self, db):
        _pedido(db, "p6")
        _mesa(db, "m1", pedido_ativo="p6")
        _sessao(db)
        caixa_service.registrar_pagamento(RID, "u1", "p6", tipo="pix", valor=100.0, idempotency_key="kx")

        with pytest.raises(HTTPException) as err:
            caixa_service.registrar_pagamento(RID, "u1", "p6", tipo="pix", valor=100.0, idempotency_key="kx")
        assert err.value.status_code == 409

        sessao = db.store.data[doc_path(RID, "sessoes_caixa", "s1")]
        assert sessao["totalVendas"] == 100.0  # não dobrou
        dia = db.store.data[f"restaurantes/{RID}/data/agregados_diarios/items/2026-09-27"]
        assert dia["faturamento"] == 100.0
        ped = db.store.data[doc_path(RID, "pedidos", "p6")]
        assert len(ped["pagamentos"]) == 1

    def test_keys_diferentes_repassam_saldo_normalmente(self, db):
        _pedido(db, "p7", pagamentos=[{"id": "pag_a", "tipo": "pix", "valor": 50.0}])
        _sessao(db)
        out = caixa_service.registrar_pagamento(RID, "u1", "p7", tipo="dinheiro", valor=50.0, idempotency_key="kb")
        assert out["status"] == "pago"

    def test_sem_key_sem_marcador(self, db):
        _pedido(db, "p8", total=20.0)
        caixa_service.registrar_pagamento(RID, "u1", "p8", tipo="dinheiro", valor=20.0)
        assert f"restaurantes/{RID}/data/eventos_pagamento/items/p8" not in db.store.data


class TestConcorrenciaSerial:
    def test_dois_pagamentos_mesmo_saldo_um_efetiva(self, db):
        """Simulação serial (Firestore serializa): saldo 100, dois pagamentos
        de 100 → o 2º re-ler o estado pós-commit (já pago) e recebe 409/422;
        agregados/turnover só refletem UMA venda."""
        _pedido(db, "p9")
        _mesa(db)
        _sessao(db)
        caixa_service.registrar_pagamento(RID, "u1", "p9", tipo="pix", valor=100.0, idempotency_key="kc")
        with pytest.raises(HTTPException) as err:
            caixa_service.registrar_pagamento(RID, "u1", "p9", tipo="pix", valor=100.0, idempotency_key="kd")
        assert err.value.status_code in (409, 422)
        dia = db.store.data[f"restaurantes/{RID}/data/agregados_diarios/items/2026-09-27"]
        assert dia["totalPedidos"] == 1  # exatamente uma venda no agregado


class TestSessaoAusente:
    def test_quita_sem_sessao_nao_trava(self, db):
        _pedido(db, "p10")
        _mesa(db, "m1", pedido_ativo="p10")

        out = caixa_service.registrar_pagamento(RID, "u1", "p10", tipo="pix", valor=100.0)
        assert out["status"] == "pago"
        dia = db.store.data[f"restaurantes/{RID}/data/agregados_diarios/items/2026-09-27"]
        assert dia["faturamento"] == 100.0


import pytest  # noqa: E402
