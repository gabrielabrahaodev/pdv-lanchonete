"""Gestão de mesas."""
from __future__ import annotations

from fastapi import HTTPException
from google.cloud.firestore_v1 import DELETE_FIELD
from google.cloud.firestore import transactional
from app.core.firebase import get_db

from app.services.base import (
    ensure_parent,
    get_item,
    item_doc,
    items_col,
    list_items,
    now_utc,
    stamp_create,
    stamp_update,
)


def listar(restaurant_id: str) -> list[dict]:
    docs = list_items(restaurant_id, "mesas")
    docs.sort(key=lambda d: d.get("numero", 0))
    return docs


def obter(restaurant_id: str, mesa_id: str) -> dict:
    doc = get_item(restaurant_id, "mesas", mesa_id)
    if not doc:
        raise HTTPException(404, "Mesa não encontrada")
    return doc


def criar(restaurant_id: str, numero: int) -> dict:
    ensure_parent(restaurant_id, "mesas")
    existentes = listar(restaurant_id)
    if any(m.get("numero") == numero for m in existentes):
        raise HTTPException(409, f"Já existe uma mesa com o número {numero}")
    data = {
        "numero": numero,
        "status": "livre",
        "pedidoAtivoId": None,
        "garcomId": None,
        "restaurantId": restaurant_id,
    }
    ref = items_col(restaurant_id, "mesas").document()
    ref.set(stamp_create(data))
    return get_item(restaurant_id, "mesas", ref.id)  # type: ignore[return-value]


def atualizar_status(restaurant_id: str, mesa_id: str, status: str) -> dict:
    permitidos = {"livre", "ocupada", "reservada", "inativa"}
    if status not in permitidos:
        raise HTTPException(422, f"Status inválido. Use: {', '.join(sorted(permitidos))}")
    ref = item_doc(restaurant_id, "mesas", mesa_id)
    @transactional
    def executar(t):
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Mesa não encontrada")
        mesa = snap.to_dict() or {}
        if mesa.get("pedidoAtivoId") and status != "ocupada":
            raise HTTPException(409, "Feche ou cancele o pedido antes de liberar a mesa")
        t.update(ref, stamp_update({"status": status}))
    executar(get_db().transaction())
    return obter(restaurant_id, mesa_id)


def ocupar(restaurant_id: str, mesa_id: str, pedido_id: str, usuario_id: str | None) -> None:
    item_doc(restaurant_id, "mesas", mesa_id).update(
        stamp_update({"status": "ocupada", "pedidoAtivoId": pedido_id, "garcomId": usuario_id})
    )


def liberar(restaurant_id: str, mesa_id: str) -> None:
    # DELETE_FIELD explícito: stamp_update descarta None e os campos ficariam
    # presos com valores antigos (pedidoAtivoId de pedido já fechado).
    item_doc(restaurant_id, "mesas", mesa_id).update(
        {
            "status": "livre",
            "pedidoAtivoId": DELETE_FIELD,
            "garcomId": DELETE_FIELD,
            "updatedAt": now_utc(),
        }
    )


def liberar_transacional(transaction, restaurant_id: str, mesa_id: str) -> None:
    """ mesmo merge de `liberar`, executado DENTRO da transação do caller
    (cancelar/registrar_pagamento) — DELETE_FIELD explícito nos dois campos."""
    transaction.update(
        item_doc(restaurant_id, "mesas", mesa_id),
        {
            "status": "livre",
            "pedidoAtivoId": DELETE_FIELD,
            "garcomId": DELETE_FIELD,
            "updatedAt": now_utc(),
        },
    )


def remover(restaurant_id: str, mesa_id: str) -> None:
    ref = item_doc(restaurant_id, "mesas", mesa_id)
    @transactional
    def executar(t):
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Mesa não encontrada")
        mesa = snap.to_dict() or {}
        if mesa.get("status") == "ocupada" or mesa.get("pedidoAtivoId"):
            raise HTTPException(409, "Mesa está ocupada — feche o pedido antes de remover")
        t.delete(ref)
    executar(get_db().transaction())
