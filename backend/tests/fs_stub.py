"""Fake leve do Firestore (Admin SDK) para testes unitários de serviços.

Caminhos suportados (multi-tenant do projeto):
    restaurantes/{rid}/data/{kind}              -> documento pai (ancora)
    restaurantes/{rid}/data/{kind}/items        -> coleção
    restaurantes/{rid}/data/{kind}/items/{id}   -> documento
    restaurantes/{rid}/data/configuracoes       -> documento
Total de segmentos PAR = documento, ÍMPAR = coleção (regra do Firestore).

Query suportadas: where(==, >=, <=, >, <), order_by, limit, stream.
Transação: leituras antes de escritas (get após write levanta RuntimeError,
espelhando o ReadAfterWriteError do Firestore real).
"""
from __future__ import annotations

import itertools
from datetime import datetime, timezone
from typing import Any

from google.cloud.exceptions import NotFound
from google.cloud.firestore_v1 import DELETE_FIELD
from google.cloud.firestore_v1.transforms import Increment

_ids = itertools.count(1)


def fake_dtt() -> datetime:
    """Timestamp fixo, com timezone — para createdAt/updatedAt nos docs stub."""
    return datetime(2026, 9, 27, 12, 0, 0, tzinfo=timezone.utc)


def _path_typo(path: str) -> str:
    n = len(path.split("/"))
    if n <= 0:
        raise ValueError("path vazio")
    return "doc" if n % 2 == 0 else "col"


class FakeSnapshot:
    def __init__(self, ref: "FakeDocRef", data: dict[str, Any] | None):
        self.reference = ref
        self.id = ref.id
        self._data = dict(data) if data is not None else None
        self.exists = data is not None

    def to_dict(self) -> dict[str, Any] | None:
        return dict(self._data) if self._data is not None else None


class FakeDocRef:
    def __init__(self, store: "FakeStore", path: str):
        self.store = store
        self.path = path
        self.id = path.split("/")[-1]

    def get(self) -> FakeSnapshot:
        return FakeSnapshot(self, self.store.data.get(self.path))

    def set(self, data: dict[str, Any], merge: bool = False) -> None:
        old = self.store.data.get(self.path) if merge else None
        self.store.data[self.path] = {**(old or {}), **data}

    def update(self, data: dict[str, Any]) -> None:
        if self.path not in self.store.data:
            raise NotFound(f"missing document {self.path}")
        self.store.apply_update(self.path, data)

    def delete(self) -> None:
        self.store.data.pop(self.path, None)
        self.store.collections.discard(self.path)  # subcoleção morre junto


class FakeQuery:
    def __init__(self, store: "FakeStore", col_path: str):
        self.store = store
        self.col_path = col_path
        self.filters: list[tuple[str, str, Any]] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None

    def where(self, field: str, op: str, value: Any) -> "FakeQuery":
        self.filters.append((field, op, value))
        return self

    def order_by(self, field: str, direction: Any = None) -> "FakeQuery":
        self._order = (field, bool(direction and str(direction).endswith("DESCENDING")))
        return self

    def limit(self, n: int) -> "FakeQuery":
        self._limit = n
        return self

    def start_after(self, snapshot) -> "FakeQuery":
        """Análogo ao Admin SDK: recebe snapshot do doc-cursor; RETIRA docs
        até ele (na ordem vigente, incluindo o próprio cursor)."""
        self._after_id = snapshot.id
        self._after_val = _dig(snapshot.to_dict() or {}, self._order[0]) if self._order else None
        return self

    def _docs(self) -> list[tuple[str, dict[str, Any]]]:
        out: list[tuple[str, dict[str, Any]]] = []
        for path, dat in self.store.data.items():
            if path == self.col_path or not path.startswith(self.col_path + "/"):
                continue
            uploaded = path[len(self.col_path) + 1 :].split("/")
            if len(uploaded) != 1:
                continue  # subcoleção não faz parte da query flat
            ok = True
            for f, op, v in self.filters:
                actual = _dig(dat, f)
                if actual is None:
                    ok = False
                    break
                if op == "==":
                    ok = actual == v
                elif op == ">=":
                    ok = actual >= v
                elif op == "<=":
                    ok = actual <= v
                elif op == ">":
                    ok = actual > v
                elif op == "<":
                    ok = actual < v
                else:
                    raise ValueError(f"operador não suportado no stub: {op}")
                if not ok:
                    break
            if ok:
                out.append((path, dat))
        return out

    def stream(self) -> list[FakeSnapshot]:
        docs = self._docs()
        if self._order:
            field, desc = self._order

            def key(pair):
                return (_dig(pair[1], field), pair[0])  # id do doc desempata

            docs = sorted(docs, key=key, reverse=desc)
            if getattr(self, "_after_id", None) is not None:
                docs = [p for p in docs if self._pos(p, field, desc)]
        if self._limit is not None:
            docs = docs[: self._limit]
        return [FakeSnapshot(FakeDocRef(self.store, p), d) for p, d in docs]

    def _pos(self, pair, field, desc) -> bool:
        """True = vem depois do cursor na ordem vigente (paginação segue)."""
        path, dat = pair
        val, did = _dig(dat, field), path.split("/")[-1]
        cval, cid = self._after_val, self._after_id
        if desc:
            return (val, did) < (cval, cid)
        return (val, did) > (cval, cid)

    def get(self) -> list[FakeSnapshot]:
        return self.stream()


def _dig(data: dict[str, Any], field: str) -> Any:
    cur: Any = data
    for part in field.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _cancel(data: dict[str, Any], field: str) -> Any:
    v = _dig(data, field)
    return v if v is not None else 0


class FakeStore:
    def __init__(self):
        self.data: dict[str, dict[str, Any]] = {}
        self.collections: set[str] = set()

    def apply_update(self, path: str, data: dict[str, Any]) -> None:
        dat: dict[str, Any] = self.data.setdefault(path, {})
        delete_cls = type(DELETE_FIELD)
        for key, value in data.items():
            if isinstance(value, Increment):
                old = _dig(dat, key) or 0
                nested_set(dat, key, old + value.value)
            elif isinstance(value, delete_cls):  # DELETE_FIELD / sentinelas
                nested_pop(dat, key)
            else:
                nested_set(dat, key, value)


def nested_set(dat: dict[str, Any], dotted: str, value: Any) -> None:
    parts = dotted.split(".")
    cur = dat
    for p in parts[:-1]:
        cur = cur.setdefault(p, {})
    cur[parts[-1]] = value


def nested_pop(dat: dict[str, Any], dotted: str) -> None:
    parts = dotted.split(".")
    cur = dat
    for p in parts[:-1]:
        cur = cur.get(p)
        if cur is None:
            return
    cur.pop(parts[-1], None)


class FakeClient:
    def __init__(self, store: FakeStore):
        self.store = store

    def __call__(self) -> "FakeClient":  # get_db() retorna chamável? não — devolve self
        return self

    def document(self, path: str) -> FakeDocRef:
        assert _path_typo(path) == "doc", f"esperado DOC, got: {path}"
        return FakeDocRef(self.store, path)

    def collection(self, path: str) -> FakeCollection:
        assert _path_typo(path) == "col", f"esperado COLEÇÃO, got: {path}"
        return FakeCollection(self.store, path)

    def transaction(self) -> "FakeTx":
        return FakeTx(self.store)

    def get_all(self, *refs) -> list[FakeSnapshot]:
        """Batch get (equivalente Admin SDK): devolve snapshots das refs existentes."""
        return [r.get() for r in refs if r.path in self.store.data]


class FakeCollection:
    def __init__(self, store: FakeStore, col_path: str):
        self.store = store
        self.path = col_path

    def document(self, doc_id: str | None = None) -> FakeDocRef:
        if doc_id is None:
            doc_id = f"auto_{next(_ids):x}"
        return FakeDocRef(self.store, f"{self.path}/{doc_id}")

    def where(self, field: str, op: str, value: Any) -> FakeQuery:
        return FakeQuery(self.store, self.path).where(field, op, value)

    def order_by(self, field: str, direction: Any = None) -> FakeQuery:
        return FakeQuery(self.store, self.path).order_by(field, direction)

    def start_after(self, snapshot) -> FakeQuery:
        return FakeQuery(self.store, self.path).start_after(snapshot)

    def limit(self, n: int) -> FakeQuery:
        return FakeQuery(self.store, self.path).limit(n)

    def stream(self) -> list[FakeSnapshot]:
        return FakeQuery(self.store, self.path).stream()

    def get(self) -> list[FakeSnapshot]:
        return self.stream()


class FakeTx:
    """Transação serial: leitura após escrita é proibida (como no Firestore)."""

    # Necessário ao decorador @transactional do google (caminho feliz só lê isto)
    _read_only = False
    _max_attempts = 2
    _id = None

    def __init__(self, store: FakeStore):
        self.store = store
        self._wrote = 0

    def _rollback(self) -> None:
        self._wrote = 0  # no-op: stub é serial, escritas revertidas pelos próprios testes

    # Interface adicional exigida pelo decorador @transactional (no-ops)
    def _clean_up(self) -> None:
        self._wrote = 0

    def _reset(self) -> None:
        self._wrote = 0

    def _begin(self, **_kwargs) -> None:
        return None

    def _commit(self, **_kwargs) -> None:
        return None

    def _set_retry_id(self, *_a, **_k) -> None:
        return None

    def get(self, ref_or_query):  # noqa: ANN001
        if self._wrote:
            raise RuntimeError("ReadAfterWriteError: leitura após escrita na transação")
        if isinstance(ref_or_query, FakeDocRef):
            snap = ref_or_query.get()
            return [snap]
        if hasattr(ref_or_query, "stream"):
            return list(ref_or_query.stream())
        raise TypeError("tx.get espera doc ref ou query")

    def set(self, ref: FakeDocRef, data: dict[str, Any]) -> None:
        self._wrote += 1
        ref.set(data)

    def update(self, ref: FakeDocRef, data: dict[str, Any]) -> None:
        self._wrote += 1
        ref.update(data)

    def delete(self, ref: FakeDocRef) -> None:
        self._wrote += 1
        ref.delete()


def patch_firestore_store(monkeypatch, modules, store: FakeStore | None = None):  # noqa: ANN001
    """Aponta `get_db()` de todos os módulos listados para um FakeClient.

    `modules` deve incluir "app.services.base" + cada módulo que fez
    `from app.core.firebase import get_db` (import por nome pega o próprio
    atributo do módulo). Retorna o fake (para asserts).

    BARREIRA ANTI-LEAK: bloqueia `firebase_admin.initialize_app`/`get_app` —
    se algum módulo esquecido tentar o Firestore REAL dentro de um teste,
    o erro estoura aqui com a instrução certa em vez de escrever na produção.
    """
    import importlib

    import firebase_admin

    def _deny(*_a, **_kw):  # noqa: ANN002, ANN003
        raise RuntimeError(
            "Firebase REAL chamado dentro de teste: módulo novo de serviço não "
            "está em tests/conftest.py:MODULES (ou o import de get_db saiu do "
            "padrão `from app.core.firebase import get_db`)."
        )

    monkeypatch.setattr(firebase_admin, "initialize_app", _deny)

    def _deny_get_app(*_a, **_kw):  # noqa: ANN002, ANN003
        raise _deny()

    monkeypatch.setattr(firebase_admin, "get_app", _deny_get_app)

    fake = FakeClient(store or FakeStore())
    for mod_name in modules:
        mod = importlib.import_module(mod_name)
        monkeypatch.setattr(mod, "get_db", lambda: fake, raising=False)
    return fake
