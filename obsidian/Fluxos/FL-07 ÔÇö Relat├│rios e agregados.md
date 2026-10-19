---
title: FL-07 — Relatórios e agregados
tags: [fluxo, relatorios, agregados]
---

# FL-07 — Relatórios e agregados

## Caminho de leitura

1. `GET /api/relatorios/resumo` recebe `inicio` e `fim`.
2. Service normaliza datas conscientes de timezone.
3. Busca marcador `agregadoDesde`.
4. Se o início do período estiver coberto, usa docs agregados por dia; caso contrário usa histórico de pedidos pagos por janela server-side.
5. Resolve nomes/categorias para top 10 e calcula despesas/CMV/resultado.

## Campos retornados

- `periodoInicio`, `periodoFim`
- `totalPedidos`, `faturamentoBruto`, `ticketMedio`
- `vendasPorHora`, `vendasPorFormaPagamento`
- `topProdutos`, `topCategorias`
- `financeiro`: categorias de despesas, total despesas, CMV estimado, resultado gerencial.

## Agregados e backfill

Vendas quitadas, saídas de estoque e mutações de despesas atualizam agregado diário e mensal. Marcadores em `eventos_agregados` evitam duplicação quando event ID é usado. A reconstrução a partir do histórico fica em `backfill_service.py` e `scripts/reconstruir_agregados.py`; modo padrão é dry-run.

## Risco atual

A branch remota analisada tem `db.get_all(*refs)` no caminho agregado e `s.to_dict().get(...)` sem tratamento para `None`, o que explica o 500 visto em consulta mensal e pode causar falha para dia sem documento. Corrigir e acrescentar teste com mais de cinco dias e docs inexistentes antes de considerar relatório confiável.
