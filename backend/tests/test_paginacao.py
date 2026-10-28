"""PaginaÃ§Ã£o server-side por cursor (P1-L).

Contrato: sem `limit` = comportamento de hoje (TUDO â€” nenhuma tela quebra).
Com `limit`, endpoint devolve a MESMA lista + header `X-Next-Cursor`.
Cursor = id do Ãºltimo doc; empate no timestamp Ã© resolvido de forma
determinÃ­stica (createdAt, depois id do doc).
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from tests.conftest import RID, seed
from tests.fs_stub import fake_dtt

_TZ = ZoneInfo("America/Sao_Paulo")


def _ts(a, b) -> datetime:
    return datetime(2026, 9, a, b, 0, tzinfo=timezone.utc)


@pytest.fixture
def api(db):
    from app.main import app
    from app.core.security import CurrentAuth, require_restaurant

    app.dependency_overrides[require_restaurant] = lambda: CurrentAuth(
        uid="u1", email="a@b.c", restaurant_id=RID, papel="admin"
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def _seed_pedidos(db, n=5):
    for i in range(n):
        seed(db, RID, "pedidos", f"pq{i}", {
            "id": f"pq{i}", "status": "aberto", "mesaId": "m1", "tipo": "local",
            "itens": [], "total": 10.0 + i, "restaurantId": RID,
            "createdAt": _ts(27, 8 + i), "updatedAt": _ts(27, 8 + i),
        })


class TestHelperBase:
    def test_paginas_e_cursor_no_final(self, db):
        from app.services.base import list_items_paginado

        _seed_pedidos(db)
        docs, cursor = list_items_paginado(RID, "pedidos", limit=2)

        assert [d["id"] for d in docs] == ["pq4", "pq3"]  # mais recente primeiro
        assert cursor == "pq3"
        docs2, cursor2 = list_items_paginado(RID, "pedidos", limit=2, cursor_id=cursor)
        assert [d["id"] for d in docs2] == ["pq2", "pq1"]
        assert cursor2 == "pq1"
        docs3, cursor3 = list_items_paginado(RID, "pedidos", limit=2, cursor_id=cursor2)
        assert [d["id"] for d in docs3] == ["pq0"]
        assert cursor3 is None  # Ãºltima pÃ¡gina sem cursor

    def test_empate_no_timestamp_cursor_deterministico(self, db):
        from app.services.base import list_items_paginado

        same = _ts(27, 12)
        seed(db, RID, "pedidos", "t1", {"id": "t1", "status": "aberto", "total": 1, "createdAt": same, "updatedAt": same, "restaurantId": RID, "itens": []})
        seed(db, RID, "pedidos", "t2", {"id": "t2", "status": "aberto", "total": 2, "createdAt": same, "updatedAt": same, "restaurantId": RID, "itens": []})
        seed(db, RID, "pedidos", "t3", {"id": "t3", "status": "aberto", "total": 3, "createdAt": same, "updatedAt": same, "restaurantId": RID, "itens": []})

        p1, cur1 = list_items_paginado(RID, "pedidos", limit=2)
        p2, cur2 = list_items_paginado(RID, "pedidos", limit=2, cursor_id=cur1)

        assert len(p1) == 2 and len(p2) == 1
        assert set(d["id"] for d in p1 + p2) == {"t1", "t2", "t3"}  # cobre todos, sem repetir
        assert [d["id"] for d in p1] != [d["id"] for d in p2]

    def test_cursor_invalido_erro(self, db):
        from app.services.base import list_items_paginado

        _seed_pedidos(db)
        with pytest.raises(Exception) as e:
            list_items_paginado(RID, "pedidos", limit=2, cursor_id="nope")
        assert "404" in str(getattr(e.value, "status_code", "")) or "cursor" in str(e.value).lower()


class TestRotas:
    def test_pedidos_com_limit_tem_header_e_segunda_pagina(self, db, api):
        _seed_pedidos(db)
        r1 = api.get("/api/pedidos", params={"limit": 2})
        assert r1.status_code == 200
        body = r1.json()
        assert len(body) == 2
        cursor = r1.headers.get("X-Next-Cursor")
        assert cursor == body[-1]["id"]

        r2 = api.get("/api/pedidos", params={"limit": 2, "cursor": cursor})
        ids = [d["id"] for d in r2.json()]
        assert len(ids) == 2
        assert not set(ids) & {d["id"] for d in body}

    def test_pedidos_sem_limit_devolve_tudo_sem_header(self, db, api):
        """Sem limit: TUDO (nenhum limite escondido) e sem header de cursor."""
        _seed_pedidos(db)
        r = api.get("/api/pedidos")
        assert len(r.json()) == 5
        assert "X-Next-Cursor" not in r.headers

    def test_pedidos_filtros_mantidos(self, db, api):
        _seed_pedidos(db)
        seed(db, RID, "pedidos", "pq9", {
            "id": "pq9", "status": "pago", "mesaId": "m2", "tipo": "local",
            "itens": [], "total": 99.0, "restaurantId": RID,
            "createdAt": _ts(28, 9), "updatedAt": _ts(28, 9),
        })
        r = api.get("/api/pedidos", params={"status": "pago"})
        assert [d["id"] for d in r.json()] == ["pq9"]

    def test_movimentacoes_paginadas(self, db, api):
        for i in range(4):
            seed(db, RID, "movimentacoes_estoque", f"mv{i}", {
                "id": f"mv{i}", "tipo": "saida", "itemId": "farinha", "qtd": 1,
                "restaurantId": RID, "createdAt": _ts(27, 9 + i), "updatedAt": _ts(27, 9 + i),
            })
        r1 = api.get("/api/estoque/movimentacoes", params={"limit": 2})
        assert len(r1.json()) == 2
        cursor = r1.headers.get("X-Next-Cursor")
        assert cursor == r1.json()[-1]["id"]
        r2 = api.get("/api/estoque/movimentacoes", params={"limit": 2, "cursor": cursor})
        assert len(r2.json()) == 2
        cursor2 = r2.headers.get("X-Next-Cursor")
        r3 = api.get("/api/estoque/movimentacoes", params={"limit": 2, "cursor": cursor2})
        assert r3.json() == []  # página vazia
        assert "X-Next-Cursor" not in r3.headers

    def test_movimentacoes_com_item_id_mantem_contrato(self, db, api):
        """Filtro itemId continua devolvendo lista completa (comportamento igual)."""
        for i in range(3):
            seed(db, RID, "movimentacoes_estoque", f"mi{i}", {
                "id": f"mi{i}", "tipo": "saida", "itemId": "farinha", "qtd": 1,
                "restaurantId": RID, "createdAt": _ts(27, 10 + i), "updatedAt": _ts(27, 10 + i),
            })
        seed(db, RID, "movimentacoes_estoque", "mx", {
            "id": "mx", "tipo": "entrada", "itemId": "carne", "qtd": 5,
            "restaurantId": RID, "createdAt": _ts(28, 8), "updatedAt": _ts(28, 8),
        })
        r = api.get("/api/estoque/movimentacoes", params={"item_id": "farinha"})
        assert len(r.json()) == 3
        assert all(d["itemId"] == "farinha" for d in r.json())

    def test_despesas_paginadas_janela(self, db, api):
        for i in range(4):
            seed(db, RID, "despesas", f"dz{i}", {
                "id": f"dz{i}", "descricao": f"D{i}", "categoria": "folha",
                "valor": 100.0, "status": "pendente", "restaurantId": RID,
                "data": datetime(2026, 9, 26 + i, 12, 0, tzinfo=_TZ),
                "createdAt": _ts(26 + i, 12), "updatedAt": _ts(26 + i, 12),
            })
        r1 = api.get("/api/despesas", params={"limit": 2})
        assert len(r1.json()) == 2
        cursor = r1.headers.get("X-Next-Cursor")
        assert cursor == r1.json()[-1]["id"]
        r2 = api.get("/api/despesas", params={"limit": 2, "cursor": cursor})
        assert len(r2.json()) == 2
        cursor2 = r2.headers.get("X-Next-Cursor")
        r3 = api.get("/api/despesas", params={"limit": 2, "cursor": cursor2})
        assert r3.json() == []
        assert "X-Next-Cursor" not in r3.headers

    def test_despesas_com_outro_filtro_paginado(self, db, api):
        """Filtro NÃƒO-server-side (status) devolve tudo â€” sem header."""
        for i in range(3):
            seed(db, RID, "despesas", f"dz{i}", {
                "id": f"dz{i}", "descricao": f"D{i}", "categoria": "folha",
                "valor": 100.0, "status": "pendente", "restaurantId": RID,
                "data": datetime(2026, 9, 26 + i, 12, 0, tzinfo=_TZ),
                "createdAt": _ts(26 + i, 12), "updatedAt": _ts(26 + i, 12),
            })
        r = api.get("/api/despesas", params={"status": "pendente", "limit": 2})
        assert len(r.json()) == 2
        assert "X-Next-Cursor" in r.headers

    def test_sessoes_caixa_paginadas(self, db, api):
        for i in range(4):
            seed(db, RID, "sessoes_caixa", f"s{i}", {
                "id": f"s{i}", "status": "fechado", "valorInicial": 100.0,
                "restaurantId": RID, "createdAt": _ts(26 + i, 8), "updatedAt": _ts(26 + i, 8),
            })
        r1 = api.get("/api/caixa/sessoes", params={"limit": 2})
        assert len(r1.json()) == 2
        cursor = r1.headers.get("X-Next-Cursor")
        assert cursor == r1.json()[-1]["id"]
        r2 = api.get("/api/caixa/sessoes", params={"limit": 2, "cursor": cursor})
        assert len(r2.json()) == 2
        cursor2 = r2.headers.get("X-Next-Cursor")
        r3 = api.get("/api/caixa/sessoes", params={"limit": 2, "cursor": cursor2})
        assert r3.json() == []
        assert "X-Next-Cursor" not in r3.headers

    def test_sessoes_caixa_sem_limit_tudo(self, db, api):
        for i in range(4):
            seed(db, RID, "sessoes_caixa", f"s{i}", {
                "id": f"s{i}", "status": "fechado", "valorInicial": 100.0,
                "restaurantId": RID, "createdAt": _ts(26 + i, 8), "updatedAt": _ts(26 + i, 8),
            })
        r = api.get("/api/caixa/sessoes")
        assert len(r.json()) == 4
        assert "X-Next-Cursor" not in r.headers
