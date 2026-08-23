"""Delivery: pedidos externos (iFood/Goomer/WhatsApp/próprio)."""
from __future__ import annotations

from fastapi import HTTPException

from app.models.models import DeliveryOrderCreate, DeliveryStatusUpdate
from app.services import produtos_service
from app.services.base import ensure_parent, get_item, item_doc, items_col, list_items, new_id, now_utc, stamp_create, stamp_update

TRANSICOES = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"preparing", "cancelled"},
    "preparing": {"ready", "cancelled"},
    "ready": {"delivered", "cancelled"},
    "delivered": set(),
    "cancelled": set(),
}


def listar(restaurant_id: str, *, status: str | None = None) -> list[dict]:
    docs = list_items(restaurant_id, "delivery_orders")
    if status:
        docs = [d for d in docs if d.get("status") == status]
    return docs


def obter(restaurant_id: str, delivery_id: str) -> dict:
    doc = get_item(restaurant_id, "delivery_orders", delivery_id)
    if not doc:
        raise HTTPException(404, "Pedido de delivery não encontrado")
    return doc


def criar(restaurant_id: str, payload: DeliveryOrderCreate) -> dict:
    ensure_parent(restaurant_id, "delivery_orders")
    itens: list[dict] = []
    total = 0.0
    for p in payload.itens:
        produto = produtos_service.obter(restaurant_id, p.produto_id)
        preco = float(produto.get("preco", 0))
        nome_variacao = None
        if p.variacao_id:
            for var in produto.get("variacoes", []):
                if var.get("id") == p.variacao_id:
                    preco += float(var.get("precoAdicional", 0) or 0)
                    nome_variacao = var.get("nome")
                    break
            else:
                raise HTTPException(404, f"Variação {p.variacao_id} não encontrada")
        itens.append(
            {
                "id": new_id("dit_"),
                "produtoId": p.produto_id,
                "nome": produto["nome"] + (f" ({nome_variacao})" if nome_variacao else ""),
                "qtd": p.qtd,
                "precoUnitario": round(preco, 2),
                "observacoes": p.observacoes,
            }
        )
        total += round(preco * p.qtd, 2)

    data = {
        "externalId": new_id("ext_"),
        "platform": payload.platform,
        "clienteNome": payload.cliente_nome,
        "clienteTelefone": payload.cliente_telefone,
        "clienteEndereco": payload.cliente_endereco,
        "itens": itens,
        "total": round(total, 2),
        "status": "pending",
        "metadata": payload.metadata,
        "restaurantId": restaurant_id,
    }
    ref = items_col(restaurant_id, "delivery_orders").document()
    ref.set(stamp_create(data))
    return obter(restaurant_id, ref.id)


def atualizar_status(restaurant_id: str, delivery_id: str, payload: DeliveryStatusUpdate) -> dict:
    pedido = obter(restaurant_id, delivery_id)
    atual, novo = pedido.get("status"), payload.status
    if novo not in TRANSICOES:
        raise HTTPException(422, "Status inválido")
    if novo not in TRANSICOES[atual]:
        raise HTTPException(409, f"Transição '{atual}' → '{novo}' não permitida")

    updates: dict = {"status": novo}
    if novo == "confirmed":
        updates["confirmadoEm"] = now_utc()
    elif novo == "ready":
        updates["prontoEm"] = now_utc()
    elif novo == "delivered":
        updates["entregueEm"] = now_utc()
    item_doc(restaurant_id, "delivery_orders", delivery_id).update(stamp_update(updates))
    return obter(restaurant_id, delivery_id)
