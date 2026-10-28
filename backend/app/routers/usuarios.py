"""Gestão de usuários do restaurante."""

from fastapi import APIRouter, Depends

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import (
    PreferenciasUpdate,
    UserCreate,
    UserUpdate,
    SolicitacaoSeguranca,
)
from app.services import usuarios_service

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

GESTAO = require_roles("admin", "gerente")


@router.get("/me")
def minhas_preferencias(auth: CurrentAuth = Depends(require_restaurant)) -> dict:
    return usuarios_service.obter_preferencias(auth.restaurant_id or "", auth.uid)


@router.patch("/me")
def atualizar_minhas_preferencias(
    payload: PreferenciasUpdate, auth: CurrentAuth = Depends(require_restaurant)
) -> dict:
    return usuarios_service.atualizar_preferencias(
        auth.restaurant_id or "",
        auth.uid,
        email=auth.email,
        nome=auth.nome,
        papel=auth.papel,
        payload=payload,
    )


@router.get("")
def listar(
    restaurant_id: str = Depends(require_roles("admin", "gerente", "caixa"))
) -> list[dict]:
    return usuarios_service.listar(restaurant_id.restaurant_id)


@router.post("", status_code=201)
def criar(payload: UserCreate, auth: CurrentAuth = Depends(GESTAO)) -> dict:
    return usuarios_service.criar(auth.restaurant_id, auth.papel or "", payload)


@router.patch("/{usuario_id}")
def atualizar(
    usuario_id: str, payload: UserUpdate, auth: CurrentAuth = Depends(GESTAO)
) -> dict:
    return usuarios_service.atualizar(
        auth.restaurant_id, auth.papel or "", usuario_id, payload, auth.uid
    )


@router.delete("/{usuario_id}", status_code=204)
def remover(usuario_id: str, auth: CurrentAuth = Depends(GESTAO)) -> None:
    usuarios_service.remover(auth.restaurant_id, auth.papel or "", usuario_id, auth.uid)


@router.post("/me/sincronizar-login")
def sincronizar_login(auth: CurrentAuth = Depends(require_restaurant)):
    return usuarios_service.sincronizar_login(auth.restaurant_id, auth.uid)


@router.post("/{usuario_id}/recuperacao")
def recuperacao(usuario_id: str, auth: CurrentAuth = Depends(GESTAO)):
    return usuarios_service.preparar_recuperacao(
        auth.restaurant_id, usuario_id, auth.papel, auth.uid
    )


@router.post("/me/seguranca", status_code=201)
def registrar_solicitacao_seguranca(
    payload: SolicitacaoSeguranca, auth: CurrentAuth = Depends(require_restaurant)
):
    return usuarios_service.registrar_solicitacao_seguranca(
        auth.restaurant_id, auth.uid, payload.acao
    )
