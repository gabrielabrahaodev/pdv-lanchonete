---
title: Mesas, Pedidos e Cozinha
tags: [regras, pedido, mesa, kds]
---

# Mesas, Pedidos e Cozinha

## Mesa

Estados documentados: `livre`, `ocupada`, `reservada`, `inativa`.
- Número de mesa é único; duplicidade → 409.
- Mesa ocupada não pode ser excluída.
- Abrir pedido verifica estado e altera mesa para `ocupada`, gravando `pedidoAtivoId` e `garcomId` na mesma transação que cria o pedido.
- Ao liberar a mesa, `pedidoAtivoId` e `garcomId` precisam ser apagados com `DELETE_FIELD`, não apenas omitidos da atualização.
- Quitação e cancelamento do pedido liberam a mesa.

## Pedido

Estados: `aberto`, `pago`, `cancelado`.
- Pedido precisa conter ao menos um item para criação.
- `tipo` normalizado para `local`, `delivery` ou `balcao` (fallback `local` na lógica descrita).
- Adicionar item só no pedido aberto.
- Remover item fisicamente apenas se o item estiver `pendente`.
- Total recalculado no servidor: soma de `qtd × precoUnitario` para itens não cancelados, arredondada a 2 casas.
- Cancelar pedido inteiro apenas quando `aberto` e sem pagamentos. Registra `cancelado` e `fechadoEm`; libera mesa.

## Item / KDS

Estados usuais: `pendente → preparo → pronto → entregue`, com cancelamento previsto. Item entra pendente se produto precisa de preparo; sem preparo nasce entregue.
- KDS exibe apenas itens que precisam passar pela cozinha e agrega a UI por pedido/mesa.
- Endpoint preferencial para alterar lote: `PATCH /api/cozinha/pedidos/{pedido_id}/itens/status` com `itemIds[]` e `novoStatus`; modelo limita lista de 1 a 50 IDs.
- Operações bulk evitam várias transações concorrentes tocando no mesmo pedido e nos mesmos ingredientes.
- A transição para `preparo` pode disparar consumo da receita quando item estava pendente e ainda não foi baixado.
- `baixadoEm` registra que a baixa foi feita; reenvio/retry não deve consumir novamente.
- Cancelamento depois da baixa não estorna os ingredientes automaticamente (decisão de negócio documentada).

## Pagamento versus preparo

O ciclo operacional da mesa normalmente começa com pedido aberto e itens no KDS, mas pagamento só fecha o pedido quando soma de pagamentos atinge o total dentro da tolerância. A mesa não deve ser liberada apenas por mudar status de item de cozinha.

Fontes: `pedidos_service.py`, `mesas_service.py`, `cozinha_service.py`, `calculos.py`, `routers/pedidos.py`, `routers/cozinha.py`, `docs/02-modelagem/diagrama-estados.md`.
