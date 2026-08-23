"""Firebase Admin SDK: inicialização única + cliente Firestore.

Ordem de resolução das credenciais (ver PLANO-CORRECOES.md):
1. FIREBASE_SERVICE_ACCOUNT_JSON (env, JSON completo em string) — Render/nuvem
2. Arquivo scripts/service-account.json existir — dev local
3. ADC (Application Default Credentials) — futuras nuvens GCP
"""
from __future__ import annotations

import json
import logging

import firebase_admin
from firebase_admin import auth as fb_auth_module
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.client import Client

from app.core.config import settings

logger = logging.getLogger(__name__)

_app: firebase_admin.App | None = None


def _build_credential() -> tuple[credentials.Base | None, bool]:
    """Retorna (credential, passar_project_id_explicito)."""
    if settings.service_account_json:
        data = json.loads(settings.service_account_json)
        return credentials.Certificate(data), True
    if settings.service_account_path.is_file():
        return credentials.Certificate(str(settings.service_account_path)), True
    # ADC: o projeto vem do ambiente (GOOGLE_CLOUD_PROJECT / metadata server).
    return None, False


def get_firebase_app() -> firebase_admin.App:
    global _app
    if _app is None:
        try:
            _app = firebase_admin.get_app()
        except ValueError:
            cred, explicit_project = _build_credential()
            opts = {"projectId": settings.project_id} if explicit_project else None
            if cred is not None:
                _app = firebase_admin.initialize_app(cred, opts)
            else:
                logger.info("Firebase Admin sem credencial explícita — usando ADC")
                _app = firebase_admin.initialize_app(options=opts)
    return _app


def get_db() -> Client:
    get_firebase_app()
    return firestore.client()


def get_auth() -> fb_auth_module:
    get_firebase_app()
    return fb_auth_module
