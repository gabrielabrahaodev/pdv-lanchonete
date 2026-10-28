# Financeiro — navegação e indicadores

| Seção | Pergunta | Conteúdo |
|---|---|---|
| Visão geral | Como está o restaurante? | Até seis indicadores prioritários, alertas e evolução de receita |
| Resultados | Como o resultado é formado? | Receita − CMV = lucro bruto; − operacionais = resultado; compras separadas, percentuais e comparativo |
| Receitas | Como as vendas evoluem? | Receita diária/mensal, vendas, ticket, variação e meios de pagamento |
| Despesas | Quais lançamentos pertencem ao período? | CRUD paginado e competência filtrada no Firestore |
| Contas a pagar | Quais compromissos estão pendentes? | Vencimento, fornecedor/categoria, datas de competência/pagamento e totais |
| Lucratividade por produto | Quais produtos contribuem? | Ranking compacto; métricas e evolução apenas no detalhe selecionado |
| Previsibilidade | O que esperar? | Cenários explicáveis, histórico suficiente e resumo de vencimentos conhecidos |

Fórmulas e limitações são explicadas nos cartões e em Resultados. Indisponível não significa zero. Resumo de contas no executivo é carregado sob solicitação, preservando economia Spark. Despesas usam fuso configurado no backend; contas a pagar mostram compromissos por vencimento independentemente do período de vendas. Pagar não implica saída automática da sessão de caixa.

Frontend: FinanceiroBI.tsx (navegação, ranking/detalhe), FinanceiroPage.tsx (CRUD com período). Backend: bi_service.py (indicadores/resumo/cache), despesas router/service (datas civis e invalidação), reposicao_service.py (invalidação após recebimento). Sem novas rotas por seção e sem mudanças em snapshots/receita de venda.
