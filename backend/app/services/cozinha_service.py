"""KDS — fila de pedidos para a cozinha."""
from __future__ import annotations

from app.services.pedidos_service import listar


def fila(restaurant_id: str) -> list[dict]:
    """Pedidos abertos ordenados do mais antigo para o mais novo,
    com apenas os itens relevantes (pendente/preparo/pronto)."""
    pedidos = [p for p in listar(restaurant_id) if p.get("status") in {"aberto", "pago"}]
    pedidos.reverse()  # mais antigo primeiro
    resultado = []
    for p in pedidos:
        itens = [i for i in p.get("itens", []) if i.get("status") in {"pendente", "preparo", "pronto"}]
        if itens:
            resultado.append(
                {
                    "id": p["id"],
                    "mesaId": p.get("mesaId"),
                    "criadoEm": p.get("criadoEm"),
                    "itens": sorted(itens, key=lambda i: 0 if i["status"] == "pendente" else 1),
                }
            )
    return resultado
