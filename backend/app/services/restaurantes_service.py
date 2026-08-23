"""Restaurantes: onboarding do primeiro estabelecimento.

Estrutura criada (idêntica ao init-firestore.ts):
    restaurantes/{id}                      -> {nome, criadoEm}
    restaurantes/{id}/data/configuracoes   -> doc único
    restaurantes/{id}/data/{kind}          -> docs-pai das coleções
    restaurantes/{id}/data/mesas/items/*   -> mesas numeradas
    restaurantes/{id}/data/usuarios/items/{uid} -> doc do criador (admin)
"""
from __future__ import annotations

from fastapi import HTTPException

from app.core.security import CurrentAuth
from app.models.models import RestaurantCreate
from app.services.base import config_doc, new_id, now_utc, parent_doc, restaurant_doc, stamp_create


COLECOES = (
    "categorias",
    "produtos",
    "mesas",
    "estoque",
    "pedidos",
    "movimentacoes_estoque",
    "usuarios",
    "sessoes_caixa",
)


def criar_primeiro(auth: CurrentAuth, payload: RestaurantCreate) -> dict:
    """Cria o primeiro restaurante do usuário e o vincula via custom claims.

    Guardas: claim restaurantId ausente no token E nenhum marcador em
    onboarding/{uid} (transacional — protege contra token antigo e corrida).
    """
    if auth.restaurant_id:
        raise HTTPException(409, f"Seu usuário já está vinculado ao restaurante '{auth.restaurant_id}'")

    from google.cloud.firestore import transactional

    from firebase_admin import auth as fb_auth

    from app.core.firebase import get_db

    db = get_db()
    marker_ref = db.collection("onboarding").document(auth.uid)

    @transactional
    def _reservar_id(t) -> None:
        snap = next(iter(t.get(marker_ref)), None)
        if snap and snap.exists:
            rid = (snap.to_dict() or {}).get("restaurantId", "?")
            raise HTTPException(409, f"Seu usuário já criou o restaurante '{rid}'")
        t.set(marker_ref, {"criadoEm": now_utc()})

    _reservar_id(db.transaction())

    restaurant_id = new_id("rest_")
    agora = now_utc()

    restaurant_ref = restaurant_doc(restaurant_id)
    batch = db.batch()
    batch.set(restaurant_ref, {"nome": payload.nome, "criadoEm": agora, "criadorUid": auth.uid})
    batch.set(
        config_doc(restaurant_id),
        stamp_create(
            {
                "nome": payload.nome,
                "moeda": "BRL",
                "timezone": "America/Sao_Paulo",
                "impressoraTipo": "bluetooth",
                "impressoraEndereco": "",
            }
        ),
    )
    for kind in COLECOES:
        batch.set(parent_doc(restaurant_id, kind), {"nome": kind.capitalize(), **stamp_create({})})

    mesa_col = db.collection(f"restaurantes/{restaurant_id}/data/mesas/items")
    for numero in range(1, payload.quantidade_mesas + 1):
        mesa_id = f"mesa_{numero:02d}"
        batch.set(
            mesa_col.document(mesa_id),
            stamp_create({"numero": numero, "status": "livre", "pedidoAtivoId": None, "garcomId": None}),
        )

    admin_doc = db.collection(f"restaurantes/{restaurant_id}/data/usuarios/items").document(auth.uid)
    batch.set(
        admin_doc,
        {
            "nome": auth.nome or auth.email or "Admin",
            "email": auth.email,
            "papel": "admin",
            "ativo": True,
            "tema": "claro",
            "restaurantId": restaurant_id,
            "criadoEm": agora,
            "atualizadoEm": agora,
        },
    )
    batch.commit()
    marker_ref.set({"restaurantId": restaurant_id, "criadoEm": agora})

    try:
        fb_auth.set_custom_user_claims(auth.uid, {"restaurantId": restaurant_id, "papel": "admin"})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Restaurante criado, mas falha ao vincular claims: {exc}") from exc

    return {"restaurantId": restaurant_id, "restaurantNome": payload.nome}
