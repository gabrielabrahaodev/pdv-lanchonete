---
title: Financeiro, CMV e Resultado
tags: [regras, financeiro, cmv, dre]
---

# Financeiro, CMV e Resultado

## Qual tela e qual indicador?

Conferido na master `5cbe450` em 28/10/2026. Esta nota corrige a descrição antiga,
que apresentava a fórmula dos relatórios como se fosse também a da central Financeiro.
Nenhuma regra financeira foi modificada por esta correção documental.

| Contexto vigente | Cálculo | Limites |
|---|---|---|
| Menu **Financeiro**, `/financeiro`, `FinanceiroBI.tsx`, API `/bi/visao-geral` | Receita − custo direto das vendas − despesas operacionais | Resultado integral exige todas as vendas com coleta BI e custos conhecidos. Caso contrário, indisponível. |
| Contrato legado de **Relatórios**, `relatorios_service.py` | `resultadoGerencial = faturamento − totalDespesas` por competência | Inclui compras na despesa; CMV estimado é informativo e não é descontado outra vez. Não confundir com resultado BI. |

`FinanceiroPage.tsx` permanece no código como fonte de componentes reutilizados
(como `DespesasCard`). A página principal de `/financeiro` é `FinanceiroBI.tsx`.
O campo legado `faturamentoLiquido` também é faturamento menos despesas; o nome
não deve ser interpretado como lucro líquido contábil. Nem todos esses campos
legados são exibidos como cartões na tela atual de Relatórios.

## Central Financeiro BI

- Receita: vendas de pedidos quitados, reconhecidas na quitação; produção não gera receita.
- Compra de insumos: categoria `insumo`; forma estoque e é mostrada separada do CMV.
- Operacionais: demais categorias (`folha`, `conta_fixa`, `outra`), por competência.
- CMV/custo direto: custo atribuído às unidades vendidas com snapshots confiáveis;
  não toda a compra nem toda a fornada.
- Lucro bruto integral = receita − CMV; resultado gerencial = lucro bruto − operacionais.
- Compra não é deduzida novamente quando o CMV já representa o custo vendido.
- Margem realizada coberta = (receita coberta − custo conhecido) / receita coberta × 100.
  Não extrapolar essa margem para vendas sem cobertura.
- Valores desconhecidos são indisponíveis, não custo zero. Histórico sem snapshots
  e vendas pagas antes de capturar custo podem permanecer sem cobertura.

Exemplo: receita R$ 100, CMV R$ 20, operacionais R$ 10, compras R$ 40.
BI: lucro bruto R$ 80 e resultado R$ 70 (com cobertura integral).
Legado: receita menos despesas R$ 50, se as despesas do período forem compras40 + operacionais10.
São medidas diferentes, não um erro de subtração. Não somar CMV ao legado novamente.

## Despesas, pagamento e datas

Valor positivo; descrição, categoria e competência identificam o lançamento.
Competência é a data a que pertence; vencimento é o prazo; `pagoEm` é o pagamento.
Pendente também entra por competência. Marcar paga/reabrir muda pendência, não competência,
e não gera sangria/suprimento. Débito de reposição é protegido contra edição/exclusão;
pagar/reabrir continua permitido. Recebimento cria débito pendente e não prova pagamento.

## Relatórios legados e CMV estimado

O caminho legado preserva a composição de sua época. Pode combinar custos congelados
das saídas/produção com estimativas históricas sem snapshot baseadas na referência de
estoque atual. Não afirmar que todo CMV legado usa custo atual, nem que todo ele é histórico
confiável. O resultado legado continua receita menos despesas, independentemente dessa estimativa.

## Delivery e limites gerais

O módulo `delivery_orders` da tela Delivery registra estados próprios; criar/entregar ali
não chama quitação de pedidos, caixa, baixa de ingredientes ou reserva da estufa.
Não documentar receita automática de delivery como se existisse nessa tela.

Resultado gerencial não é lucro contábil/fiscal. Sem impostos, taxas, indiretos completos,
saldos bancários e conciliação, não há lucro líquido ou fluxo de caixa completo garantidos.

Fontes: `AppAutenticado.tsx`, `FinanceiroBI.tsx`, `bi_service.py`, `lucratividade.py`,
`relatorios_service.py`, `calculos.py`, `despesas_service.py`, `delivery_service.py`.
Ver [[Financeiro-Regras-Contabeis]], [[Financeiro-Custos-Teoricos-e-Reais]] e [[Wiki-Central-de-Ajuda]].
