"""Fixtures compartilhadas dos testes unitários (Firestore stub, sem Firebase real)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests.fs_stub import patch_firestore_store  # noqa: E402

# Módulos cujo `get_db` deve apontar para o stub (import por nome → patch por módulo)
# REGRA: todo service novo que importar get_db ENTRA aqui — a barreira anti-leak
# de fs_stub faz o suite falhar estrondoso se algum módulo ficar de fora.
MODULES = [
    "app.services.base",
    "app.services.bi_service",
    "app.services.usuarios_service",
    "app.services.producao_service",
    "app.services.pedidos_service",
    "app.services.caixa_service",
    "app.services.mesas_service",
    "app.services.estoque_service",
    "app.services.agregados_service",
    "app.services.produtos_service",
    "app.services.despesas_service",
    "app.services.relatorios_service",
    "app.services.fornecedores_service",
    "app.services.delivery_service",
    "app.services.backfill_service",
]

RID = "r1"


@pytest.fixture
def db(monkeypatch):
    """Client fake; pedidos/caixa/mesas/agregados/despesas/relatorios/estoque roteados p/ ele.
    Relógio fixo (fake_dtt) para que fechadoEm/competências sejam determinísticas."""
    fake = patch_firestore_store(monkeypatch, MOZ吉他 := MODULES)
    from tests.fs_stub import fake_dtt  # noqa: F401

    monkeypatch.setattr("app.services.caixa_service.now_utc", lambda: fake_dtt())
    return fake


def doc_path(rid: str, kind: str, item_id: str | None = None) -> str:
    base = f"restaurantes/{rid}/data/{kind}/items"
    return f"{base}/{item_id}" if item_id else base


def seed(db, rid: str, kind: str, item_id: str, data: dict) -> str:
    """Grava um documento direto no store fake."""
    path = doc_path(rid, kind, item_id)
    db.store.data[path] = {**data}
    return path
