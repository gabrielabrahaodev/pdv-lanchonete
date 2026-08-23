"""Autenticação: perfil do usuário logado + restaurante."""
from __future__ import annotations

from app.core.security import CurrentAuth
from app.services.base import config_doc, get_item, restaurant_doc


def me(auth: CurrentAuth) -> dict:
    """Monta o contexto do usuário a partir dos custom claims + Firestore."""
    restaurant_id = auth.restaurant_id
    restaurant_nome = None
    configuracoes = None
    if restaurant_id:
        snap = restaurant_doc(restaurant_id).get()
        if snap.exists:
            data = snap.to_dict() or {}
            restaurant_nome = data.get("nome")
            cfg_snap = config_doc(restaurant_id).get()
            if cfg_snap.exists:
                configuracoes = cfg_snap.to_dict()
    perfil = get_item(restaurant_id, "usuarios", auth.uid) if restaurant_id else None
    return {
        "uid": auth.uid,
        "email": auth.email,
        "papel": (perfil or {}).get("papel") or auth.papel,
        "restaurantId": restaurant_id,
        "restaurantNome": restaurant_nome,
        "configuracoes": configuracoes,
        "perfil": perfil,
    }
