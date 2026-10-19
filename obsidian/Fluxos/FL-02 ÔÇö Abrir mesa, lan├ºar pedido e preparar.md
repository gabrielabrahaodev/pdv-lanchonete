---
title: FL-02 — Pedido e preparo
tags: [fluxo, pedido, estoque, kds]
---

# FL-02 — Abrir mesa, lançar pedido e preparar

```mermaid
flowchart TD
  A[Selecionar mesa] --> B{Mesa livre ou reservada?}
  B -- não: ocupada/inativa --> X[Rejeitar conforme estado]
  B -- sim --> C[Resolver produto/variação e preço no servidor]
  C --> D[Transação cria pedido aberto + ocupa mesa]
  D --> E{precisaPreparar?}
  E -- sim --> F[Item pendente aparece no KDS]
  F --> G[Transição pendente para preparo]
  G --> H[Se flag ligada, baixa receita uma vez]
  H --> I[pronto -> entregue]
  E -- não --> J[Item nasce entregue; baixa na criação se receita existe]
```

## Cuidados

- `pedidoAtivoId` e `garcomId` têm que coincidir com pedido aberto; limpar com `DELETE_FIELD` ao liberar mesa.
- Item em preparo não pode ser removido fisicamente como se pendente fosse.
- Reenvio de status não pode repetir baixa: `baixadoEm` e eventos agregados.
- Ingredientes compartilhados devem ser agregados por itemId antes de escrever.
- Fazer todas as leituras da transação antes de começar qualquer gravação.
- Cancelar item após baixa não estorna estoque automaticamente.

Fontes: `pedidos_service.py`, `cozinha_service.py`, `mesas_service.py`, `calculos.py`.
