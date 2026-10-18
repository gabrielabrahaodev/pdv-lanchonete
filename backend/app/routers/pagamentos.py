"""Pagamentos de pedidos."""
from fastapi import APIRouter, Depends, Header

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import PaymentCreate
from app.services import caixa_service

router = APIRouter(prefix="/pagamentos", tags=["pagamentos"])

CAIXA = require_roles("admin", "gerente", "caixa")


@router.post("/{pedido_id}", status_code=201)
def registrar(
    pedido_id: str,
    pagamento: PaymentCreate,
    auth: CurrentAuth = Depends(CAIXA),
    idempotencia: str | None = Header(default=None, alias="X-Idempotency-Key"),
) -> dict:
    """Registra um pagamento (dinheiro/pix/credito/debito) — transação única.

    Quita o pedido quando a soma dos pagamentos cobre o total; sessão de
    caixa, mesa e agregado vão juntos na mesma transação. Header opcional
    `X-Idempotency-Key`: replay com a MESMA chave → 409 sem duplicar
    receita/caixa/agregado (recomendado em clientes com retry).
    """
    return caixa_service.registrar_pagamento(
        auth.restaurant_id,
        auth.uid,
        pedido_id,
        tipo=pagamento.tipo,
        valor=pagamento.valor,
        troco=pagamento.troco,
        referencia=pagamento.referencia,
        idempotency_key=idempotencia,
    )
