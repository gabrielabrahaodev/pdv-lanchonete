# Financeiro — regras gerenciais

Receita: quitação de pedidos de venda (mesa e balcão). A tela Delivery usa `delivery_orders` separado e não chama a quitação: entregar ali não gera receita automática no Caixa/BI. Compras de insumos: despesa categoria insumo, inclusive reposição retroativa pendente. Despesas operacionais: categorias restantes, por competência. Custo de produção gera estoque acabado, não receita nem débito novo de BI.

Resultado gerencial BI = receita − custo direto conhecido das vendas − despesas operacionais, SOMENTE com cobertura integral de vendas BI e custos. Compra de insumos não é subtraída de novo junto ao CMV. Saldo receita menos despesas permanece um indicador separado, não lucro líquido. Relatórios legados são preservados com suas regras anteriores; não chamar sua estimativa de lucro contábil.

Margem realizada = (receita da parcela coberta − custo conhecido)/receita coberta ×100. Lucro bruto coberto é essa diferença em reais. Não extrapolar custos desconhecidos. Teórica só com snapshot completo de receita/referência. Comparação em p.p. somente com cobertura integral e ambas as margens. Meta é margem derivada do markup informado, não confundir bases percentuais.

Pagamentos de despesas não equivalem a saída de sessão de caixa. Sem saldos bancários, conciliação, impostos, taxas, folha e indiretos completos não há DRE contábil ou projeção de saldo confiável. Vencimento é distinto de competência e de pagoEm. Débito de reposição é imutável no Financeiro, exceto pagar/reabrir; preserva relação com estoque.

## Indicadores de Resultados
O backend retorna lucro bruto integral somente com cobertura completa: receita − custo direto. Margem bruta = lucro bruto/receita ×100; CMV/receita e despesas operacionais/receita usam a mesma base do painel. Variação de despesas compara operacionais com período anterior de igual duração. Divisão sem base retorna indisponível. Margem coberta permanece claramente parcial; não é usada para simular resultado integral. Ex.: receita100, CMV20, operacionais10, compras40 → lucro bruto80, resultado70; compra40 não é subtraída de novo.

Contas a pagar utilizam vencimento, independente da competência do seletor de vendas. Resumos Python usam fuso configurado, não atribuem data a contas sem vencimento e avisam quando a consulta de 200 foi truncada.

## Rastreabilidade da fórmula vigente
A rota `/financeiro` importa `FinanceiroBI.tsx`, que usa `bi_service.py` e a fórmula BI acima. O contrato legado de `relatorios_service.py` mantém `resultadoGerencial = faturamento − totalDespesas` (incluindo compras por competência); seu CMV é informativo. Não tratar os dois campos como a mesma medida. Exemplo receita100, compras40, CMV20, operacionais10: BI70 com cobertura; legado50. Nenhum deles é lucro líquido contábil. Detalhamento em [[Regras de Negócio/Financeiro, CMV e Resultado]].
