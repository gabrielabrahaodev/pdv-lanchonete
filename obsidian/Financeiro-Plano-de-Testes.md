# Financeiro — plano de testes e homologação

## Automatizado
Pytest inclui CRUD/tenant e exclusão vinculada de fornecedor, paginação filtrada com cursor em página vazia, fornecedor de outro tenant, rateio em centavos, item/pedido cancelado, variações, custo subcentavo, centenas de unidades, evento agregado repetido, produção de 40/venda de 25, custo alterado depois da venda, cobertura parcial/desconhecida, resultado sem dupla dedução, previsão insuficiente/cenários e API negada para garçom/cozinha.

As suítes existentes cobrem compras kg/g/ml/L/pacote, recebimento retroativo, débito imutável, fechamento, reserva, perda, concorrência no emulador e Rules. Teste com stub não prova contenção real. Relatório de execução está em docs/04-testes/financeiro-bi.md; não confundir resultado local com GitHub Actions ou homologação autenticada.

## Homologação no localhost
1. Entrar como admin/gerente/caixa e confirmar menu Fornecedores; cozinha/garçom não devem ver BI.
2. Criar fornecedor com todos campos, buscar por documento/contato, editar sem perder cursor, desativar/ativar. Excluir sem vínculos; vincular insumo/despesa/reposição e confirmar bloqueio.
3. Abrir Financeiro e Network: nenhuma lista de pedidos, ingredientes ou usuários para indicadores; fornecedores só no formulário/section pertinente. Paginar despesas com filtros, inclusive página vazia com próxima.
4. Receber reposição de mês anterior conforme PR #17, 2 kg por R$16 em estoque g; conferir saldo, custo, despesa pendente R$16 e competência. Repetir recebimento não duplica. Pagar/reabrir sem editar valor vinculado.
5. Produzir 40 unidades, vender 25; receita e custo de venda são de 25. Conferir reserva/entrega/perda sem baixar ingredientes duas vezes. Balcão, mesa e delivery quitados contam uma vez.
6. Venda preparada com custo conhecido, alterar receita/custo depois e confirmar margem histórica estável. Venda sem baixa automática ou quitada antes do preparo deve apresentar custo desconhecido.
7. Conferir filtro 7/30/90/customizado, categorias/produtos/variações e rankings. Soma receita atribuída fecha com pedido. Margem parcial usa somente receita coberta e mostra cobertura.
8. Confirmar resultado gerencial exclui compra de insumos já representada pelo CMV; não rotular como lucro líquido.
9. Previsão não aparece com histórico insuficiente. Com observações suficientes, conferir hipóteses, cenários e vencimentos conhecidos; sem projeção fictícia de saldo.
10. Validar Android/iOS/PWA, teclado/Tab/Escape, 320–1440 px, claro/escuro. Desconectar rede e verificar erros visíveis, sem indicadores fictícios.

Não executar backfill ou dados reais antes de aprovação. PR #17 é dependência. Ordem de revisão: fornecedores → captura por produto → BI. Sem merge/deploy automático.

## Regressão de navegação e período
- Visão geral tem resumo executivo, Resultados tem demonstrativo e percentuais; não são telas iguais. Contar chamadas ao painel ao alternar.
- Em Despesas, aplicar um dia e registrar despesas antes/depois da meia-noite São Paulo: somente a competência selecionada deve vir da API paginada. Paginar sem eliminar datas no frontend.
- Criar/editar/excluir valor/data/categoria → retornar ao executivo e conferir totais atualizados; pagar/reabrir só muda situação e resumos de contas, não o resultado por competência.
- Ranking de 62 produtos: comparar receita/volume/contribuição/margem coberta, abrir detalhes e filtrar variação; nenhuma reconstrução com custo atual.
- Previsibilidade mostra resumo e acesso a contas, sem repetir lista completa. Histórico insuficiente continua bloqueando projeção.
