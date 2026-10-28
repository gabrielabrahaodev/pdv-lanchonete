"""Liveness (/health) x readiness (/ready) — P1-M.

/health: NUNCA toca o Firestore (liveness — não derruba o serviço em queda
temporária). /ready: leitura curta com timeout baixo; falha → 503 genérico
(sem expor detalhes de credenciais/projeto).
"""
import pytest
from fastapi.testclient import TestClient

from tests.conftest import RID


@pytest.fixture
def client():
    from app.main import app

    # Sem `with` — não roda a lifespan (em testes, Firebase real é proibido).
    return TestClient(app)


def _patch_firestore(monkeypatch, behavior):
    import app.core.firebase as fb

    if behavior == "ok":
        class _Ping:
            def get(self):
                class _S:
                    exists = False

                return _S()

        class _Doc:
            def document(self, _path):
                return _Ping()

        class _Db:
            def collection(self, _c):
                return _Doc()

        monkeypatch.setattr(fb, "get_db", lambda: _Db())
    else:
        def _raise():
            raise TimeoutError("ping estourou")

        monkeypatch.setattr(fb, "get_db", _raise)


def test_health_liveness_nao_toca_firestore(client, monkeypatch):
    """/health sobe mesmo com Firestore quebrado (não chama get_db)."""
    import app.core.firebase as fb

    calls = []

    def _count():
        calls.append(1)
        raise AssertionError("health não deve acessar Firestore")

    monkeypatch.setattr(fb, "get_db", _count)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert not calls


def test_ready_ok_quando_firestore_saudavel(client, monkeypatch):
    _patch_firestore(monkeypatch, "ok")
    r = client.get("/ready")
    assert r.status_code == 200
    assert r.json() == {"status": "ready"}


def test_ready_503_genérico_quando_firestore_cai(client, monkeypatch):
    _patch_firestore(monkeypatch, "erro")
    r = client.get("/ready")
    assert r.status_code == 503
    assert r.json() == {"status": "unavailable"}
    # sem detalhes internos (credenciais/projeto)
    body = r.text
    assert "project" not in body.lower()
    assert "credential" not in body.lower()
    assert "timeouterror" not in body.lower()


def test_ready_head_sem_corpo(client, monkeypatch):
    _patch_firestore(monkeypatch, "ok")
    r = client.head("/ready")
    assert r.status_code == 200


def test_health_informa_commit_sem_consultar_firestore(client, monkeypatch):
    monkeypatch.setenv('RENDER_GIT_COMMIT', 'a'*40)
    assert client.get('/health').json()['commit'] == 'a'*40
    monkeypatch.delenv('RENDER_GIT_COMMIT')
    assert client.get('/health').json()['commit'] is None
