"""Configurações do restaurante (documento único)."""
from fastapi import APIRouter, Depends

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import Configuracoes
from app.services.base import config_doc, now_utc

router = APIRouter(prefix="/configuracoes", tags=["configuracoes"])


@router.get("")
def obter(restaurant_id: str = Depends(require_restaurant)) -> dict:
    snap = config_doc(restaurant_id.restaurant_id).get()
    data = snap.to_dict() or {}
    for campo in ("createdAt", "updatedAt", "criadoEm", "atualizadoEm"):
        data.pop(campo, None)
    return data


@router.put("")
def atualizar(
    payload: Configuracoes,
    auth: CurrentAuth = Depends(require_roles("admin", "gerente")),
) -> dict:
    ref = config_doc(auth.restaurant_id)
    ref.set(
        {**payload.model_dump(by_alias=True), "updatedAt": now_utc()},
        merge=True,
    )
    snap = ref.get()
    data = snap.to_dict() or {}
    for campo in ("createdAt", "updatedAt", "criadoEm", "atualizadoEm"):
        data.pop(campo, None)
    return data
