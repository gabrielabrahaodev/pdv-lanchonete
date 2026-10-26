"""Pedidos e itens."""
from fastapi import APIRouter, Depends, Query, Response, Header

from app.core.security import CurrentAuth, require_restaurant, require_roles
from app.models.models import OrderItemAdd
from app.services import pedidos_service

router = APIRouter(prefix="/pedidos", tags=["pedidos"])

# garcom monta pedidos; cozinha não cria (apenas status de itens)
ESCRITA = require_roles("admin", "gerente", "caixa", "garcom")
STATUS = require_roles("admin", "gerente", "caixa", "cozinha", "garcom")


@router.get("")
def listar(
    response: Response,
    status: str | None = Query(default=None),
    mesa_id: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=200, description="Sem limit → lista completa (compat)"),
    cursor: str | None = Query(default=None),
    restaurant_id: str = Depends(require_restaurant),
) -> list[dict]:
    docs, next_cursor = pedidos_service.listar_paginado(
        restaurant_id.restaurant_id,
        limit=limit,
        cursor_id=cursor,
        status=status,
        mesa_id=mesa_id,
    )
    if next_cursor:
        response.headers["X-Next-Cursor"] = next_cursor
    return docs


@router.post("/balcao", status_code=201)
def criar_balcao(
    itens: list[OrderItemAdd],
    chave: str = Header(alias="Idempotency-Key", min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"),
    auth: CurrentAuth = Depends(require_roles("admin", "gerente", "caixa")),
) -> dict:
    return pedidos_service.criar_balcao(auth.restaurant_id, auth.uid, itens, chave)


@router.get("/{pedido_id}")
def obter(pedido_id: str, restaurant_id: str = Depends(require_restaurant)) -> dict:
    return pedidos_service.obter(restaurant_id.restaurant_id, pedido_id)


@router.post("", status_code=201)
def criar(
    mesa_id: str,
    itens: list[OrderItemAdd],
    tipo: str = Query(default="local"),
    auth: CurrentAuth = Depends(ESCRITA),
) -> dict:
    return pedidos_service.criar(auth.restaurant_id, auth.uid, mesa_id, tipo, itens)


@router.post("/{pedido_id}/itens", status_code=201)
def adicionar_item(
    pedido_id: str,
    payload: OrderItemAdd,
    auth: CurrentAuth = Depends(ESCRITA),
) -> dict:
    return pedidos_service.adicionar_item(auth.restaurant_id, auth.uid, pedido_id, payload)


@router.post("/{pedido_id}/itens/lote", status_code=201)
def adicionar_itens(
    pedido_id: str,
    payload: list[OrderItemAdd],
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$"),
    auth: CurrentAuth = Depends(ESCRITA),
) -> dict:
    return pedidos_service.adicionar_itens(auth.restaurant_id, auth.uid, pedido_id, payload, idempotency_key)


@router.delete("/{pedido_id}/itens/{item_id}")
def remover_item(pedido_id: str, item_id: str, auth: CurrentAuth = Depends(ESCRITA)) -> dict:
    return pedidos_service.remover_item(auth.restaurant_id, pedido_id, item_id)


@router.patch("/{pedido_id}/itens/{item_id}/status")
def status_item(
    pedido_id: str,
    item_id: str,
    novo_status: str,
    auth: CurrentAuth = Depends(STATUS),
) -> dict:
    if auth.papel == "garcom" and novo_status != "entregue":
        from fastapi import HTTPException
        raise HTTPException(403, "Garçom pode apenas confirmar a entrega")
    return pedidos_service.atualizar_status_item(auth.restaurant_id, pedido_id, item_id, novo_status, auth.uid)


@router.post("/{pedido_id}/cancelar")
def cancelar(pedido_id: str, auth: CurrentAuth = Depends(require_roles("admin", "gerente", "caixa"))) -> dict:
    return pedidos_service.cancelar(auth.restaurant_id, pedido_id)


@router.post("/{pedido_id}/itens/{item_id}/renovar-reserva")
def renovar_reserva(pedido_id: str, item_id: str, auth: CurrentAuth = Depends(STATUS)):
    return pedidos_service.renovar_reserva(auth.restaurant_id, pedido_id, item_id, auth.uid)
