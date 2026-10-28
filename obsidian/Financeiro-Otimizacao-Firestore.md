# Financeiro — otimização Firestore

## Auditoria do código
Antes: Financeiro montava CRUD de fornecedores, despesas completas, fornecedores novamente e usuários, além do resumo que consulta pedidos/estoques. Paginação filtrada caía em scan integral. Produtos usam listeners compartilhados por chave; menu global ainda mantém estoque para alertas (custo independente do BI).

Depois da primeira PR: formulário carrega auxiliares sob demanda, cache por restaurante/papel; `/despesas/pagina` retorna `{items,nextCursor}` e lê no máximo 50 despesas (máximo API 200) por página, mais leitura do cursor. Filtros não indexados são aplicados ao bloco, sem scan integral: página pode ficar vazia com cursor para avançar. Ordenação por competência + snapshot de cursor. Endpoint sem limit preservado para clientes legados; não usar no novo painel. CSV exporta página atual, explicitamente.

Estimativas, não medições: 500 vendas/semana, 62 produtos, 20 aberturas/dia, sem cache:

| Origem | 7 dias | 30 dias | 90 dias |
|---|---:|---:|---:|
| Pedidos individuais (~500/7 por dia) | 500 | 2143 | 6429 |
| Dia/produto (62 em cada dia) | 434 | 1860 | 5580 |
| Diário existente | 7 | 30 | 90 |
| Mensal, meses completos | 1 | 1–2 | 3–4 |

Multiplicar por 20 para aberturas diárias hipotéticas e pelo número de restaurantes. Não inclui autenticação, documentos vazios cobrados como mínimo da consulta, reconexões, fotos nem leituras do menu global. Escrever mapas na mesma atualização de dia/mês não acrescenta documentos por item: duas gravações de agregado por venda já existentes, mais evento idempotente já existente. Particionar só após medir tamanho/contenção. Limites, índices e quota devem ser conferidos no Console antes da produção; nenhuma medição de cobrança real foi realizada.
