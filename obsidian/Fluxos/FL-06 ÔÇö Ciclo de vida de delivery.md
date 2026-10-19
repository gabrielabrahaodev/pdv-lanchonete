---
title: FL-06 — Delivery
tags: [fluxo, delivery]
---

# FL-06 — Ciclo de vida de delivery

Estados/fluxo:

`pending → confirmed → preparing → ready → delivered`

Cancelamento permitido desde `pending`, `confirmed`, `preparing` e `ready`. `delivered` e `cancelled` são terminais. Transições fora do mapa retornam 409.

O service resolve preço/nome pelo cadastro e atualiza `confirmadoEm`, `prontoEm` e `entregueEm` ao passar pelas transições pertinentes.

Papéis: admin/gerente/caixa/garçom podem criar; status permite também cozinha. O módulo presente não comprova sincronização com API real da plataforma externa; classificar como gerenciamento interno do pedido até haver integração evidenciada.
