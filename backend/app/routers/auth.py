"""Endpoints de autenticação / contexto do usuário."""
from fastapi import APIRouter, Depends

from app.core.security import CurrentAuth, get_current_auth
from app.services import auth_service
from app.models.models import AuthMe

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=None)
def me(auth: CurrentAuth = Depends(get_current_auth)) -> dict:
    """Contexto do usuário logado (claims + perfil + restaurante).

    Não exige restaurantId no claim — a tela de seleção precisa disso.
    """
    return auth_service.me(auth)
