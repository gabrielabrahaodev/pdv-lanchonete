---
title: FL-04 — Estoque
tags: [fluxo, estoque]
---

# FL-04 — Entradas e saídas de estoque

## Entrada de compra

1. Operador autorizado registra entrada de quantidade positiva.
2. Transação lê saldo atual.
3. Calcula saldo novo e persiste `saldoApos` no movimento junto da atualização.
4. Para compra financeira, criar também despesa separada se a intenção é contar no resultado gerencial; movimentação de estoque, por si só, não é automaticamente pagamento/conta da sessão de caixa.

## Saída manual

1. Escolhe item, quantidade e observação.
2. Service transacional diminui saldo e cria movimento.
3. Movimento armazena tipo `saida`, `itemId`, quantidade, saldo após e usuário.

## Saída automática pela venda

1. Receita de produto × quantidade pedida.
2. Agrupar consumos por item de estoque.
3. Fazer leituras necessárias de configuração e itens antes das escritas.
4. Criar movimentações vinculadas a `pedidoId`, atualizar saldo e marcar item `baixadoEm`.
5. Publicar agregado idempotente se o fluxo transacional exige.

## Auditoria do saldo

Para reconciliar discrepância: saldo inicial + entradas − saídas ± ajustes deve coincidir com `quantidadeAtual`. Não usar script de limpeza de demonstração para corrigir dados reais sem identificar IDs de lote e movimentos posteriores.
