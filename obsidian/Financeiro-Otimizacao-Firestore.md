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

## Orçamento completo do painel implementado
Comparação anterior + previsão compartilham histórico: 7 dias → até 56 referências; 30 → 60; 90 → 180, mais autenticação. A 20 aberturas sem cache: 1.120 / 1.200 / 3.600 referências diárias por restaurante. Ex.: 10 restaurantes no cenário 90 dias consumiriam 36.000 referências/dia somente nesse painel; não garante que o Spark comporte o restante. Cache por processo de 30 s e React Query podem reduzir repetições próximas; não pressupor taxa de acerto. Contas a pagar: até 201 documentos somente quando seção aberta; despesas: blocos de 50+cursor. Produto selecionado: evolução diária adicional, cache frontend por filtro.

Fonte oficial conferida: https://firebase.google.com/docs/firestore/quotas (28/10/2026): free tier com 50 mil leituras/dia, 20 mil escritas/dia, 1 GiB armazenado e documento até 1 MiB, compartilhados pelo projeto. Não há quota separada por restaurante. O dimensionamento aqui não mede uso produtivo.

`firestore.indexes.json`: isenta mapas de métricas de produto/variação/compras de índices automáticos no collection group `items`, pois são lidos integralmente pelos agregados. Revisar e publicar separadamente somente após homologação; nenhuma configuração real foi aplicada. Transformações numéricas dos mapas BI são consolidadas usando o snapshot já lido da transação, evitando o limite de 500 transforms por documento em vendas com muitas linhas.
