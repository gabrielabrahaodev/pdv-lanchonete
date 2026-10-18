"""Cancelamento de pedido transacional.

P1-D: pedido + mesa numa ÚNICA transação (o cancelar antigo era 2 updates
separados → crach de mesa presa; mesa reassociada podia desmarcar de outro
pedido; condicional: mesa com pedidoAtivoId != pedido não vira livre).
"""
import pytest
from fastapi import HTTPException

from app.services import pedidos_service
from tests.conftest import RID, doc_path
from tests.fs_stub import fake_dtt  # noqa: F401  (stamp usa pequena padronização)


def _pedido(db, pedido_id, *, status="aberto", mesa_id="m1", pagamentos=None):
    path = doc_path(RID, "pedidos", pedido_id)
    db.store.data[path] = {
        "mesaId": mesa_id,
        "tipo": "local",
        "status": status,
        "itens": [],
        "total": 10.0,
        "pagamentos": pagamentos or [],
        "usuarioId": "u1",
        "restaurantId": RID,
        "createdAt": fake_dtt(),
        "updatedAt": fake_dtt(),
    }
    return path


def _mesa(db, mesa_id, *, status="ocupada", pedido_ativo="p1", garcom="u1"):
    path = doc_path(RID, "mesas", mesa_id)
    db.store.data[path] = {
        "numero": 1,
        "status": status,
        "pedidoAtivoId": pedido_ativo,
        "garcomId": garcom,
        "restaurantId": RID,
        "createdAt": fake_dtt(),
        "updatedAt": fake_dtt(),
    }
    return path


class TestCancelarTransacional:
    def test_cancela_aberto_sem_pagamento_e_libera_mesa(self, db):
        _pedido(db, "p1")
        mesa_path = _mesa(db, "m1", pedido_ativo="p1")

        out = pedidos_service.cancelar(RID, "p1")

        assert out["status"] == "cancelado"
        ped = db.store.data[doc_path(RID, "pedidos", "p1")]
        assert ped["status"] == "cancelado"
        assert ped.get("fechadoEm") is not None
        mesa = db.store.data[mesa_path]
        assert mesa["status"] == "livre"
        assert "pedidoAtivoId" not in mesa  # DELETE_FIELD executado
        assert "garcomId" not in mesa

    def test_pedido_com_pagamento_nao_cancela_nem_libera_mesa(self, db):
        _pedido(db, "p2", pagamentos=[{"id": "pag_x", "tipo": "dinheiro", "valor": 10.0}])
        mesa_path = _mesa(db, "m1", pedido_ativo="p2")

        with pytest.raises(HTTPException) as err:
            pedidos_service.cancelar(RID, "p2")
        assert err.value.status_code == 409
        assert db.store.data[doc_path(RID, "pedidos", "p2")]["status"] == "aberto"
        assert db.store.data[mesa_path]["status"] == "ocupada"

    def test_pedido_ja_pago_409(self, db):
        _pedido(db, "p3", status="pago", pagamentos=[{"id": "x", "valor": 10.0, "tipo": "pix"}])
        with pytest.raises(HTTPException) as err:
            pedidos_service.cancelar(RID, "p3")
        assert err.value.status_code == 409

    def test_pedido_ja_cancelado_409(self, db):
        _pedido(db, "p4", status="cancelado")
        with pytest.raises(HTTPException) as err:
            pedidos_service.cancelar(RID, "p4")
        assert err.value.status_code == 409

    def test_mesa_reassociada_nao_liberada(self, db):
        """Mesa apontando para OUTRO pedido: cancela o pedido mas mesa intacta."""
        _pedido(db, "p5")
        mesa_path = _mesa(db, "m2", pedido_ativo="outro_pedido")

        out = pedidos_service.cancelar(RID, "p5")
        assert out["status"] == "cancelado"
        mesa = db.store.data[mesa_path]
        assert mesa["status"] == "ocupada"
        assert mesa["pedidoAtivoId"] == "outro_pedido"

    def test_pedido_inexistente_404(self, db):
        mesa_path = _mesa(db, "m1")
        with pytest.raises(HTTPException) as err:
            pedidos_service.cancelar(RID, "fantasma")
        assert err.value.status_code == 404
        assert db.store.data[mesa_path]["status"] == "ocupada"

    def test_mesa_ausente_nao_impede_cancelamento(self, db):
        _pedido(db, "p6", status="aberto", mesa_id="m_vazia")
        out = pedidos_service.cancelar(RID, "p6")
        assert out["status"] == "cancelado"  # mesa já removida: só cancela o pedido
