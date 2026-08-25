"""Plano da PLATAFORMA: gestão de convites e donos (doc top-level sistema/global).

Dois planos separados:
  - PLATAFORMA (aqui): donos em sistema/global.donoUids[] gerenciam convites
    de provisionamento. Operador da plataforma NÃO tem tenant — os endpoints
    daqui usam get_current_auth SEM exigir claim restaurantId.
  - TENANT (demais routers): exigem claim restaurantId (require_restaurant).

A antiga flag onboardingAberto foi APOSENTADA: novo restaurante nasce
exclusivamente por convite válido (ver restaurantes_service.criar_primeiro).
"""
from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.firebase import get_db
from app.core.security import CurrentAuth, get_current_auth
from app.services import convites_service

router = APIRouter(prefix="/sistema", tags=["sistema"])


def _global_doc():
    return get_db().collection("sistema").document("global")


def _ler_donos() -> list[str]:
    snap = _global_doc().get()
    if not snap.exists:
        return []
    return [str(u) for u in ((snap.to_dict() or {}).get("donoUids") or [])]


def exigir_dono_plataforma(auth: CurrentAuth = Depends(get_current_auth)) -> CurrentAuth:
    """Guard do plano da PLATAFORMA: uid precisa estar em sistema/global.donoUids."""
    if auth.uid not in _ler_donos():
        raise HTTPException(403, "Acesso restrito aos donos da plataforma")
    return auth


@router.post("/convites", status_code=201)
def criar_convite(auth: CurrentAuth = Depends(exigir_dono_plataforma)) -> dict:
    """Gera um convite de provisionamento (uso único, expira em 7 dias)."""
    dados = convites_service.gerar(auth.uid)
    return {"id": dados["id"], "expiraEm": dados["expiraEm"]}


@router.get("/convites")
def listar_convites(auth: CurrentAuth = Depends(exigir_dono_plataforma)) -> list[dict]:
    """Lista todos os convites com status computado."""
    return convites_service.listar()


@router.delete("/convites/{token}", status_code=204)
def revogar_convite(token: str, auth: CurrentAuth = Depends(exigir_dono_plataforma)):
    convites_service.revogar(token)
    return Response(status_code=204)
