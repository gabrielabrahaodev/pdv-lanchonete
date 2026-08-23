"""Onboarding: criação do primeiro estabelecimento do usuário."""
from fastapi import APIRouter, Depends

from app.core.security import CurrentAuth, get_current_auth
from app.models.models import RestaurantCreate
from app.services import restaurantes_service

router = APIRouter(prefix="/restaurantes", tags=["restaurantes"])


@router.post("/primeiro", status_code=201)
def criar_primeiro(payload: RestaurantCreate, auth: CurrentAuth = Depends(get_current_auth)) -> dict:
    """Cria o primeiro restaurante do usuário logado (exige conta SEM claim restaurantId).

    O claim só vale no próximo ID token — o frontend deve forçar refresh após 201.
    """
    return restaurantes_service.criar_primeiro(auth, payload)
