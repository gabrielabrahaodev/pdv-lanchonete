"""Segurança: verificação de ID token do Firebase Auth e guards por papel."""
import logging
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from firebase_admin import auth as fb_auth

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CurrentAuth:
    uid: str
    email: str | None
    restaurant_id: str | None
    papel: str | None
    nome: str | None = None


def get_current_auth(authorization: str = Header(default="")) -> CurrentAuth:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token ausente ou malformado")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        decoded = fb_auth.verify_id_token(token)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Falha ao verificar ID token: %s", exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido ou expirado") from exc
    email = decoded.get("email") or (decoded.get("firebase", {}).get("sign_in_attributes", {}).get("email"))
    return CurrentAuth(
        uid=decoded["uid"],
        email=email,
        restaurant_id=decoded.get("restaurantId"),
        papel=decoded.get("papel"),
        nome=decoded.get("name") or decoded.get("display_name"),
    )


def require_restaurant(auth: CurrentAuth = Depends(get_current_auth)) -> CurrentAuth:
    if not auth.restaurant_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Usuário sem restaurante associado (custom claim 'restaurantId' ausente)",
        )
    return auth


def require_roles(*roles: str):
    """Dependency factory: restringe o endpoint aos papéis informados."""

    def dep(auth: CurrentAuth = Depends(require_restaurant)) -> CurrentAuth:
        if roles and auth.papel not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Acesso negado para o papel '{auth.papel}'",
            )
        return auth

    return dep
