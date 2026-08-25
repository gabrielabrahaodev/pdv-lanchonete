"""Convites de provisionamento — plano da PLATAFORMA.

Cada convite é um documento cujo ID É o token: coleção top-level
`convites/{token}` (24+ chars url-safe). Uso único genérico, expira em
EXPIRA_EM_DIAS, revogável pelo dono da plataforma.

O CONSUMO (usadoEm/usadoPorUid) acontece dentro da transação de criação do
restaurante (restaurantes_service.criar_primeiro) — impossível usar o mesmo
convite duas vezes, nem em corrida.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from app.core.firebase import get_db
from app.services.base import now_utc

EXPIRA_EM_DIAS = 7


def _col():
    return get_db().collection("convites")


def _para_datetime(valor: Any) -> datetime | None:
    """Normaliza Timestamp do Firestore / datetime para comparacoes seguras."""
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor if valor.tzinfo else valor.replace(tzinfo=timezone.utc)
    if hasattr(valor, "ToDatetime"):  # google.cloud Timestamp
        return valor.ToDatetime().replace(tzinfo=timezone.utc)
    return None


def gerar(criado_por_uid: str) -> dict:
    token = secrets.token_urlsafe(18)
    agora = now_utc()
    dados = {
        "criadoPor": criado_por_uid,
        "criadoEm": agora,
        "expiraEm": agora + timedelta(days=EXPIRA_EM_DIAS),
        "ativo": True,
        "usadoEm": None,
        "usadoPorUid": None,
    }
    _col().document(token).set(dados)
    return {"id": token, **dados}


def listar() -> list[dict]:
    agora = now_utc()
    saida: list[dict] = []
    for snap in _col().stream():
        data = {**(snap.to_dict() or {}), "id": snap.id}
        if data.get("usadoEm"):
            data["status"] = "usada"
        elif not data.get("ativo", True):
            data["status"] = "revogada"
        elif (_para_datetime(data.get("expiraEm")) or agora) < agora:
            data["status"] = "expirada"
        else:
            data["status"] = "ativa"
        saida.append(data)
    saida.sort(key=lambda d: _para_datetime(d.get("criadoEm")) or agora, reverse=True)
    return saida


def erro_se_inutilizavel(data: dict) -> str | None:
    """Mensagem de erro se o convite não puder ser consumido; None se OK."""
    if not data.get("ativo", True):
        return "Este convite foi revogado."
    if data.get("usadoEm"):
        return "Este convite já foi utilizado."
    expira = _para_datetime(data.get("expiraEm"))
    if expira and expira < now_utc():
        return "Este convite está expirado."
    return None


def revogar(token: str) -> None:
    ref = _col().document(token)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(404, "Convite não encontrado")
    data = snap.to_dict() or {}
    if data.get("usadoEm"):
        raise HTTPException(409, "Convite já utilizado; não pode ser revogado")
    ref.set({"ativo": False}, merge=True)
