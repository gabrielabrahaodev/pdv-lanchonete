---
title: Financeiro, CMV e Resultado
tags: [regras, financeiro, cmv, dre]
---

# Financeiro, CMV e Resultado

## Fornecedores

Cadastro com nome e dados opcionais (documento, telefone, e-mail, observações e ativo). Escrita por admin/gerente/caixa. Fornecedor relacionado a despesa via `fornecedorId`, mas não é necessário para toda despesa.

## Despesas

Categorias permitidas no domínio: `insumo`, `folha`, `conta_fixa`, `outra`. Valor positivo. Campos incluem descrição, valor, data de competência, vencimento, status, pagoEm, fornecedor, usuário, forma de pagamento e observações.
- Criar, atualizar e excluir despesa atualiza agregados pela competência no service transacional.
- Marcar paga define `status=pago` e `pagoEm=agora`; reabrir define `status=pendente` e apaga `pagoEm` com `DELETE_FIELD`.
- Pagamento/reabertura de despesa não altera os agregados de competência, pois pagar não muda a data `data` usada no relatório.
- Relatórios incluem despesas por `data` independentemente de status pago/pendente.
- Despesa financeira não gera sangria nem baixa sessão de caixa automaticamente.

## Resultado gerencial

Fórmula implementada:

`resultadoGerencial = faturamento − totalDespesas`

`faturamentoLiquido` no contrato atual também representa faturamento bruto menos total de despesas. Essa semântica é específica do produto; não chamar de lucro líquido contábil sem qualificação.

## CMV estimado

Fórmula implementada:

`CMV estimado = Σ (quantidade de saída de estoque vinculada a pedido × custo médio atual do insumo)`

O relatório filtra movimentos tipo `saida` com `pedidoId` e usa o custo médio do cadastro no momento da consulta. O CMV é apresentado como indicador informativo e **não é subtraído novamente do resultado**: despesas de compra de insumo já podem fazer parte de `totalDespesas`; subtrair ambos poderia duplicar custo.

## Exemplo simples

Se receita for R$ 7.627,10 e despesas por competência R$ 2.035,00, o resultado exibido será R$ 5.592,10. O CMV estimado de R$ 1.734,43 aparece à parte como sinal de consumo de materiais; ele não é mais uma parcela descontada nessa fórmula do resultado.

## Limites e melhoria futura

- Resultado gerencial de receita menos despesas cadastradas não equivale necessariamente a lucro contábil/fiscal; podem faltar impostos, taxas, folha completa, pró-labore, depreciação ou outros compromissos não registrados.
- CMV baseado em custo médio atual não é custo histórico por lote.
- Caixa (pagamentos efetivos) e competência (despesas por data) são métricas diferentes.

Fontes: `despesas_service.py`, `calculos.py`, `relatorios_service.py`, `agregados_service.py`, `FinanceiroPage.tsx`.
