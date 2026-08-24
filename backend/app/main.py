"""PDV Lanchonete — API FastAPI."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

if settings.sentry_dsn:  # pragma: no cover - ativo apenas em produção com DSN
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.0, send_default_pii=False)
    except ImportError:  # sdk não instalado (dev minimalista)
        pass

from app.routers import (
    auth,
    caixa,
    categorias,
    configuracoes,
    cozinha,
    delivery,
    despesas,
    estoque,
    fornecedores,
    mesas,
    pagamentos,
    pedidos,
    produtos,
    publico,
    relatorios,
    restaurantes,
    usuarios,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    from app.core.firebase import get_firebase_app

    get_firebase_app()
    yield


app = FastAPI(
    title="PDV Lanchonete API",
    version="2.0.0",
    description="Backend FastAPI + Firebase para o PDV de lanchonete",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router,
    restaurantes.router,
    categorias.router,
    produtos.router,
    mesas.router,
    pedidos.router,
    pagamentos.router,
    cozinha.router,
    estoque.router,
    fornecedores.router,
    despesas.router,
    caixa.router,
    delivery.router,
    publico.router,
    relatorios.router,
    configuracoes.router,
    usuarios.router,
):
    app.include_router(router, prefix="/api")


@app.api_route("/health", methods=["GET", "HEAD"], tags=["meta"])
def health() -> dict:
    return {"status": "ok", "project": settings.project_id}
