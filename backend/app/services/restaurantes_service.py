"""Restaurantes: onboarding do primeiro estabelecimento (por CONVITE).

Estrutura criada (idêntica ao init-firestore.ts):
    restaurantes/{id}                      -> {nome, criadoEm, criadorUid}
    restaurantes/{id}/data/configuracoes   -> doc único
    restaurantes/{id}/data/{kind}          -> docs-pai das coleções
    restaurantes/{id}/data/mesas/items/*   -> mesas numeradas
    restaurantes/{id}/data/usuarios/items/{uid} -> doc do criador (admin)

Provisionamento (plano da plataforma):
  - BOOTSTRAP: projeto do zero (nenhum restaurante E nenhum dono em
    sistema/global.donoUids) → cria sem convite e semeia o dono.
  - Caso normal: EXIGE token de convite válido. O consumo do convite
    (usadoEm/usadoPorUid) é gravado NA MESMA transação — uso duplo impossível.

Tudo nasce em UMA transação Firestore, leituras 100% antes das escritas
(lição do bug 10). A antiga flag onboardingAberto foi aposentada.
"""
from __future__ import annotations

from fastapi import HTTPException

from app.core.security import CurrentAuth
from app.models.models import RestaurantCreate
from app.services import convites_service
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


def _vincular_claims(auth: CurrentAuth, restaurant_id: str) -> None:
    """Emite/reemite os custom claims do criador (idempotente).

    Falhar aqui NÃO corrompe dados: o estado por baixo (restaurante + marcador
    completo + convite consumido) é consistente e um retry cai no caminho
    auto-cura, que apenas reemite os claims.
    """
    from firebase_admin import auth as fb_auth

    try:
        fb_auth.set_custom_user_claims(auth.uid, {"restaurantId": restaurant_id, "papel": "admin"})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            500,
            "Restaurante criado, mas falha ao vincular claims "
            "(repita a chamada — o retry completa o vínculo): "
            f"{exc}",
        ) from exc


def criar_primeiro(auth: CurrentAuth, payload: RestaurantCreate) -> dict:
    """Cria o primeiro restaurante do usuário e o vincula via custom claims.

    Guardas, em ordem:
      1. Claim restaurantId no token -> 409;
      2. Marcador completo (tem restaurantId) + claim ausente no token ->
         AUTO-CURA: nada é escrito; apenas re-emite os claims e devolve o
         restaurante existente;
      3. Provisionamento: BOOTSTRAP (projeto vazio) cria livre; caso normal
         EXIGE convite válido (ativo, não expirado, não usado);
      4. Marcador órfão (existe SEM restaurantId) é recuperável — a própria
         transação o sobrescreve ao criar.
    """
    if auth.restaurant_id:
        raise HTTPException(409, f"Seu usuário já está vinculado ao restaurante '{auth.restaurant_id}'")

    from google.cloud.firestore import transactional

    from app.core.firebase import get_db

    db = get_db()
    marker_ref = db.collection("onboarding").document(auth.uid)
    convites_col = db.collection("convites")

    @transactional
    def _criar_ou_curar(t) -> dict:
        # ---------- FASE 1: leituras (nenhuma escrita antes daqui) ----------
        marker_snap = next(iter(t.get(marker_ref)), None)
        marker = (marker_snap.to_dict() or {}) if (marker_snap and marker_snap.exists) else {}
        rid_existente = marker.get("restaurantId")

        if rid_existente:
            raiz = next(iter(t.get(restaurant_doc(str(rid_existente)))), None)
            nome = None
            if raiz and raiz.exists:
                nome = (raiz.to_dict() or {}).get("nome")
            return {
                "curado": True,
                "restaurantId": str(rid_existente),
                "restaurantNome": nome or str(rid_existente),
            }

        global_snap = next(iter(t.get(db.collection("sistema").document("global"))), None)
        donos = [str(u) for u in (((global_snap.to_dict() or {}).get("donoUids") or []) if global_snap and global_snap.exists else [])]

        ja_existe_tenant = next(iter(t.get(db.collection("restaurantes").limit(1))), None) is not None
        bootstrap = not ja_existe_tenant and not donos

        convite_data: dict | None = None
        if not bootstrap:
            if not payload.token:
                raise HTTPException(
                    403,
                    "Cadastro de novo estabelecimento é somente por convite. "
                    "Solicite o link de convite ao suporte.",
                )
            convite_snap = next(iter(t.get(convites_col.document(payload.token))), None)
            if not convite_snap or not convite_snap.exists:
                raise HTTPException(403, "Convite inválido.")
            convite_data = {**(convite_snap.to_dict() or {}), "id": convite_snap.id}
            erro = convites_service.erro_se_inutilizavel(convite_data)
            if erro:
                raise HTTPException(403, erro)

        # ---------- FASE 2: escritas ----------
        restaurant_id = new_id("rest_")
        agora = now_utc()

        t.set(restaurant_doc(restaurant_id), {"nome": payload.nome, "criadoEm": agora, "criadorUid": auth.uid})
        t.set(
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
            t.set(parent_doc(restaurant_id, kind), {"nome": kind.capitalize(), **stamp_create({})})

        mesa_col = db.collection(f"restaurantes/{restaurant_id}/data/mesas/items")
        for numero in range(1, payload.quantidade_mesas + 1):
            t.set(
                mesa_col.document(f"mesa_{numero:02d}"),
                stamp_create({"numero": numero, "status": "livre", "pedidoAtivoId": None, "garcomId": None}),
            )

        t.set(
            db.collection(f"restaurantes/{restaurant_id}/data/usuarios/items").document(auth.uid),
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
        # Marcador nasce COMPLETO dentro da mesma transação: sem janela de
        # marcador órfão entre reserva e batch (fonte do 409 eterno antigo).
        t.set(marker_ref, {"restaurantId": restaurant_id, "criadoEm": agora})

        # Consumo do convite no MESMO commit: uso duplo impossível nem em corrida.
        if convite_data is not None:
            t.set(
                convites_col.document(convite_data["id"]),
                {"usadoEm": agora, "usadoPorUid": auth.uid},
                merge=True,
            )

        # Bootstrap semeia o primeiro dono da plataforma atomicamente.
        if bootstrap:
            t.set(db.collection("sistema").document("global"), {"donoUids": [auth.uid]}, merge=True)

        return {
            "curado": False,
            "restaurantId": restaurant_id,
            "restaurantNome": payload.nome,
        }

    resultado = _criar_ou_curar(db.transaction())

    _vincular_claims(auth, resultado["restaurantId"])

    return {"restaurantId": resultado["restaurantId"], "restaurantNome": resultado["restaurantNome"]}
