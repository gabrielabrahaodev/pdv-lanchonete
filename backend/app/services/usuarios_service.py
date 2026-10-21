"""Usuários do restaurante (Firebase Auth + documento Firestore)."""
from __future__ import annotations

from fastapi import HTTPException

from app.models.models import UserCreate, UserUpdate
from app.services.base import ensure_parent, get_item, item_doc, items_col, list_items, stamp_create, stamp_update

PAPEIS = {"admin", "gerente", "caixa", "garcom", "cozinha"}


def listar(restaurant_id: str) -> list[dict]:
    docs = list_items(restaurant_id, "usuarios")
    # Fallback em lote só para docs legados sem email persistido.
    faltando = [d for d in docs if not d.get("email")]
    if faltando:
        try:
            from firebase_admin import auth as fb_auth

            from app.core.firebase import get_auth

            identifiers = [fb_auth.UserIdentifier(d["id"]) for d in faltando]
            emails = {u.uid: u.email for u in get_auth().get_users(identifiers)}
            for d in faltando:
                d["email"] = emails.get(d["id"])
        except Exception:  # noqa: BLE001
            pass
    return docs


def criar(restaurant_id: str, criador_papel: str, payload: UserCreate) -> dict:
    if payload.papel not in PAPEIS - {"admin"}:
        raise HTTPException(422, f"Papel deve ser um de: {', '.join(sorted(PAPEIS - {'admin'}))}")
    if payload.papel in {"gerente"} and criador_papel != "admin":
        raise HTTPException(403, "Somente admin cria gerentes")

    from app.core.firebase import get_auth

    auth = get_auth()
    try:
        user = auth.create_user(email=payload.email, password=payload.senha, display_name=payload.nome)
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "EMAIL_EXISTS" in msg:
            raise HTTPException(409, "E-mail já cadastrado") from exc
        raise HTTPException(500, f"Falha ao criar usuário no Auth: {msg}") from exc

    auth.set_custom_user_claims(user.uid, {"restaurantId": restaurant_id, "papel": payload.papel})
    ensure_parent(restaurant_id, "usuarios")
    data = {
        "nome": payload.nome,
        "email": payload.email,
        "papel": payload.papel,
        "ativo": True,
        "restaurantId": restaurant_id,
        "criadoEm": _utcnow(),
        "atualizadoEm": _utcnow(),
    }
    items_col(restaurant_id, "usuarios").document(user.uid).set(data)
    return {**get_item(restaurant_id, "usuarios", user.uid), "email": user.email}  # type: ignore[operator]


def atualizar(restaurant_id: str, ator_papel: str, usuario_id: str, payload: UserUpdate) -> dict:
    atual = get_item(restaurant_id, "usuarios", usuario_id)
    if not atual:
        raise HTTPException(404, "Usuário não encontrado")
    changes = {k: v for k, v in payload.model_dump(by_alias=True).items() if v is not None}
    senha = changes.pop("senha", None)

    from app.core.firebase import get_auth

    auth = get_auth()
    novo_papel = changes.get("papel")
    if novo_papel and novo_papel not in PAPEIS:
        raise HTTPException(422, "Papel inválido")
    if (novo_papel == "admin" or atual.get("papel") == "admin") and ator_papel != "admin":
        raise HTTPException(403, "Apenas admin altera contas admin")
    auth_changes = {}
    if senha:
        auth_changes["password"] = senha
    if "ativo" in changes:
        auth_changes["disabled"] = not changes["ativo"]
    if auth_changes:
        auth.update_user(usuario_id, **auth_changes)
    if changes.get("ativo") is False:
        auth.revoke_refresh_tokens(usuario_id)
    if novo_papel:
        claims = auth.get_user(usuario_id).custom_claims or {}
        auth.set_custom_user_claims(
            usuario_id,
            {"restaurantId": claims.get("restaurantId", restaurant_id), "papel": novo_papel},
        )
    if changes:
        item_doc(restaurant_id, "usuarios", usuario_id).update(stamp_update(changes))
    doc = get_item(restaurant_id, "usuarios", usuario_id)
    try:
        doc["email"] = auth.get_user(usuario_id).email  # type: ignore[index]
    except Exception:  # noqa: BLE001
        pass
    return doc


def remover(restaurant_id: str, ator_papel: str, usuario_id: str) -> None:
    atual = get_item(restaurant_id, "usuarios", usuario_id)
    if not atual:
        raise HTTPException(404, "Usuário não encontrado")
    if atual.get("papel") == "admin" and ator_papel != "admin":
        raise HTTPException(403, "Apenas admin remove contas admin")
    from app.core.firebase import get_auth

    auth = get_auth()
    auth.update_user(usuario_id, disabled=True)
    auth.revoke_refresh_tokens(usuario_id)
    item_doc(restaurant_id, "usuarios", usuario_id).delete()


# ------------------------------------------------------------- preferências
TEMA_DEFAULT = "claro"


def obter_preferencias(restaurant_id: str, uid: str) -> dict:
    doc = get_item(restaurant_id, "usuarios", uid)
    return {"tema": (doc or {}).get("tema") or TEMA_DEFAULT}


def atualizar_preferencias(
    restaurant_id: str, uid: str, email: str | None, nome: str | None, papel: str | None, payload
) -> dict:
    """Grava tema no doc do próprio usuário; cria o doc se ainda não existir."""
    ref = item_doc(restaurant_id, "usuarios", uid)
    atual = get_item(restaurant_id, "usuarios", uid)
    if not atual:
        ensure_parent(restaurant_id, "usuarios")
        data = {
            "nome": nome or (email or "Usuário"),
            "email": email,
            "papel": papel or "admin",
            "ativo": True,
            "restaurantId": restaurant_id,
            "criadoEm": _utcnow(),
            "atualizadoEm": _utcnow(),
        }
        ref.set(data)
    ref.update(stamp_update({"tema": payload.tema}))
    return {"tema": payload.tema}


def _utcnow():
    from app.services.base import now_utc

    return now_utc()
