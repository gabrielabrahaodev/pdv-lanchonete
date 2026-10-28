---
title: Relatórios e Agregados
tags: [regras, relatórios, desempenho]
---

# Relatórios e Agregados

## Definição da venda no relatório

- Só pedido `status=pago` conta em `totalPedidos` e faturamento.
- Competência da venda é `fechadoEm`; a documentação descreve fallback `criadoEm` para calcular a hora se fechamento estiver ausente. Atenção: a consulta histórica por `fechadoEm` pode não encontrar documentos antigos sem esse campo.
- `vendasPorHora` usa `ZoneInfo(settings.timezone)`; default `America/Sao_Paulo`.
- Top produtos/categorias no máximo dez; IDs são resolvidos para nomes atuais dos cadastros.
- Tipos de pagamento do agregado aparecem agrupados por forma.

## Despesas e CMV no relatório legado

- Despesas são somadas por `data` (competência), independentemente do status.
- CMV estimado usa saídas de estoque ligadas a pedido multiplicadas pelo custo médio atual.
- Resultado gerencial LEGADO = faturamento − despesas por competência. O menu Financeiro usa o BI (receita − CMV − operacionais), com cobertura integral; ver [[Financeiro-Regras-Contabeis]].

## Agregados no Firestore

- Dia: `restaurantes/{rid}/data/agregados_diarios/items/{YYYY-MM-DD}`.
- Mês: `restaurantes/{rid}/data/agregados_mensais/items/{YYYY-MM}`.
- Campos: `faturamento`, `totalPedidos`, `vendasPorHora`, `vendasPorFormaPagamento`, `topProdutos`, `saidasPorItem`, `despesasPorCategoria`, `totalDespesas`, `restaurantId`.
- `agregados_meta/items/cobertura` registra `agregadoDesde`; a rota de resumo decide agregado vs histórico a partir desse marcador.
- `eventos_agregados/items/{evento_id}` guarda marcadores de evento para deduplicação em rotas transacionais.
- A CLI `scripts/reconstruir_agregados.py` chama `backfill_service.reconstruir`; por padrão é dry-run e só grava com `--apply` + confirmação explícita.

## Custo de leitura: observação

Não assumir que todo relatório custa apenas uma leitura. O caminho de resumo agregado lê documentos diários (em lote) para cada dia do período e ainda lista produtos, categorias e estoque para resolver nomes/calcular CMV. `GET /relatorios/agregado` também consulta outras coleções no método `resumo_agregado`.

## Estado da correção de leitura

O defeito histórico de `get_all(*refs)` foi corrigido: a master usa `get_all(refs)`
e trata snapshot ausente. Não descrever o 500 histórico como bloqueador vigente.
Conferir `relatorios_service.py` e os testes de intervalo atuais.

## Backfill: divergência de comentário

`agregados_service.py` ainda diz “SEM backfill — histórico anterior não entra”, mas existe `backfill_service.py` com reconstrução de dados e marcador de cobertura. A capacidade de backfill existe no código; o comentário de módulo está desatualizado. O backfill atual também usa fuso hardcoded `America/Sao_Paulo`, enquanto relatórios usam `settings.timezone`.

Fontes: `relatorios_service.py`, `agregados_service.py`, `backfill_service.py`, `scripts/reconstruir_agregados.py`, testes `test_relatorios_intervalo.py` e `test_backfill.py`.
