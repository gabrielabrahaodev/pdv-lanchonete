---
title: Estrutura Firestore
tags: [dados, firestore, schema]
---

# Estrutura Firestore

## Tenant

```text
restaurantes/{restaurantId}                         # raiz do tenant
└── data/
    ├── configuracoes                               # documento único, sem /items
    ├── categorias/items/{categoriaId}
    ├── produtos/items/{produtoId}
    ├── imagens/items/{produtoId}
    ├── mesas/items/{mesaId}
    ├── pedidos/items/{pedidoId}
    ├── estoque/items/{itemId}
    ├── movimentacoes_estoque/items/{movimentoId}
    ├── usuarios/items/{uid}
    ├── sessoes_caixa/items/{sessaoId}
    ├── delivery_orders/items/{deliveryId}
    ├── fornecedores/items/{fornecedorId}
    ├── despesas/items/{despesaId}
    ├── agregados_diarios/items/{YYYY-MM-DD}
    ├── agregados_mensais/items/{YYYY-MM}
    ├── agregados_meta/items/cobertura
    ├── eventos_agregados/items/{eventoId}
    └── eventos_pagamento/items/{pedidoId}:{idempotencyKey}

onboarding/{uid}                                    # marcador de onboarding
sistema/global                                      # UIDs de donos globais
convites/{token}                                    # convite por código
```

## Convenções

- Campo é normalmente camelCase no Firestore/API. Pydantic aceita aliases camelCase.
- `createdAt/updatedAt` são timestamps básicos; helpers convertem para `criadoEm/atualizadoEm` na resposta.
- Subcoleções têm documentos-pai `data/{kind}` como âncoras.
- ID da coleção `usuarios/items` corresponde ao UID Firebase.
- Imagem é separada do documento de produto para não aumentar custo de listagem.
- Coleções de eventos funcionam como marcadores de idempotência; não apagar sem entender período de replay.

## Segurança Firestore

No snapshot analisado, `firestore.rules` permite leitura no tenant se o claim `restaurantId` combina com o caminho e nega todas as escritas diretas do cliente. Backend usa Admin SDK. Esse comportamento diverge de um resumo antigo no esquema lógico que mostrava `allow read, write`; a regra efetiva é a do arquivo `firestore.rules` e foi incluída no CI via emulator tests.

Veja [[Modelo de Dados/Dicionário de Dados]], [[Regras de Negócio/Acesso, Tenancy e Papéis]] e [[Auditoria/Discrepâncias e Riscos]].
