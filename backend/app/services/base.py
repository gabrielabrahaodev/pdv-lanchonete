"""Helpers de acesso ao Firestore.

Estrutura multi-tenant (idêntica à versão Flutter/scripts):
    restaurantes/{restaurantId}/data/{kind}/items/{itemId}
    restaurantes/{restaurantId}/data/configuracoes   (documento único)

Documentos antigos usam createdAt/updatedAt; usuarios usa criadoEm/atualizadoEm.
Tudo é normalizado para criadoEm/atualizadoEm ao ler.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from google.cloud.firestore_v1 import DocumentSnapshot

from app.core.firebase import get_db


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:16]}"


# ------------------------------------------------------------------ caminhos
def items_col(restaurant_id: str, kind: str):
    """Subcoleção 'items' de uma coleção virtual (produtos, mesas, pedidos...)."""
    return get_db().collection(f"restaurantes/{restaurant_id}/data/{kind}/items")


def item_doc(restaurant_id: str, kind: str, item_id: str):
    return items_col(restaurant_id, kind).document(item_id)


def parent_doc(restaurant_id: str, kind: str):
    """Documento pai (ex.: .../data/produtos) que ancora a subcoleção."""
    return get_db().document(f"restaurantes/{restaurant_id}/data/{kind}")


def config_doc(restaurant_id: str):
    return get_db().document(f"restaurantes/{restaurant_id}/data/configuracoes")


def restaurant_doc(restaurant_id: str):
    return get_db().document(f"restaurantes/{restaurant_id}")


# ------------------------------------------------------------------ leitura
def _to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, "ToDatetime"):  # google.cloud.firestore Timestamp
        return value.ToDatetime().replace(tzinfo=timezone.utc)
    if hasattr(value, "timestamp"):
        try:
            return datetime.fromtimestamp(value.timestamp(), tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            return None
    return None


def _first(*values: Any) -> Any:
    for v in values:
        if v is not None:
            return v
    return None


def doc_to_dict(snapshot: DocumentSnapshot) -> dict[str, Any]:
    data = dict(snapshot.to_dict() or {})
    data["id"] = snapshot.id
    criado_raw = _first(data.pop("createdAt", None), data.pop("criadoEm", None))
    atualizado_raw = _first(data.pop("updatedAt", None), data.pop("atualizadoEm", None))
    criado = _to_datetime(criado_raw)
    atualizado = _to_datetime(atualizado_raw)
    fallback = now_utc()
    data["criadoEm"] = criado or atualizado or fallback
    data["atualizadoEm"] = atualizado or criado or fallback
    return data


def get_item(restaurant_id: str, kind: str, item_id: str) -> dict[str, Any] | None:
    snap = item_doc(restaurant_id, kind, item_id).get()
    return doc_to_dict(snap) if snap.exists else None


def list_items(
    restaurant_id: str,
    kind: str,
    *,
    order_desc_by: str = "criadoEm",
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """Lista completa da subcoleção (coleções são pequenas no escopo do PDV),
    ordenada em memória para evitar necessidade de índices compostos."""
    snaps = items_col(restaurant_id, kind).stream()
    docs = [doc_to_dict(s) for s in snaps]
    key = order_desc_by

    def sort_key(d: dict[str, Any]):
        v = d.get(key)
        ts = _to_datetime(v) or datetime.min.replace(tzinfo=timezone.utc)
        return ts

    docs.sort(key=sort_key, reverse=True)
    if limit:
        docs = docs[:limit]
    return docs


def list_items_window(
    restaurant_id: str,
    kind: str,
    field: str,
    inicio: datetime | None,
    fim: datetime | None,
) -> list[dict[str, Any]]:
    """Janela por intervalo em campo único (índice automático, sem composto).

    ATENÇÃO: `field` é o nome GRAVADO no Firestore (`createdAt` via
    stamp_create, `data` em despesas), não o normalizado `criadoEm`.
    """
    col = items_col(restaurant_id, kind)
    if inicio is not None:
        col = col.where(field, ">=", _ensure_utc(inicio))
    if fim is not None:
        col = col.where(field, "<=", _ensure_utc(fim))
    return [doc_to_dict(s) for s in col.stream()]


def _ensure_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


# ------------------------------------------------------------------ escrita
def stamp_create(data: dict[str, Any]) -> dict[str, Any]:
    now = now_utc()
    return {k: v for k, v in data.items() if v is not None} | {
        "createdAt": now,
        "updatedAt": now,
    }


def stamp_update(data: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in data.items() if v is not None} | {"updatedAt": now_utc()}


def ensure_parent(restaurant_id: str, kind: str) -> None:
    doc_ref = parent_doc(restaurant_id, kind)
    if not doc_ref.get().exists:
        doc_ref.set({"nome": kind.capitalize(), "createdAt": now_utc(), "updatedAt": now_utc()})
