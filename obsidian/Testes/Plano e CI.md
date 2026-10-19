---
title: Plano de Testes e CI
tags: [testes, ci, qualidade]
---

# Plano de Testes e CI

## CI no snapshot

`.github/workflows/ci.yml` executa:

1. Backend: Python 3.12, instala `backend/requirements-dev.txt`, roda `python -m pytest tests -q`.
2. Frontend: Node 20, `npm ci`, `npx tsc --noEmit`, `npm run build`.
3. Firestore rules: instala Java 21 + npm e executa `firebase emulators:exec --only firestore ... node tests/firestore_rules.test.mjs`.

Workflow está configurado para push em `master` e pull request.

## Testes backend presentes

- `test_agregados_transacionais.py`
- `test_backfill.py`
- `test_calculos.py`
- `test_cancelar_pedido.py`
- `test_despesas_transacionais.py`
- `test_estoque_consumo.py`
- `test_health.py`
- `test_models.py`
- `test_money.py`
- `test_pagamento_transacional.py`
- `test_paginacao.py`
- `test_precisa_preparar.py`
- `test_relatorios_intervalo.py`
- `test_validacao_valores.py`

Verificar resultado real em CI ou local; a lista de arquivos não equivale a confirmação de que testes passam na versão local.

## Prioridades de teste

| Prioridade | Risco | Casos mínimos |
|---|---|---|
| P1 | Pagamento/caixa | parcial, quitação, excesso, concorrência, replay idempotente, sessão aberta/ausente |
| P1 | Consumo de estoque | flag on/off, unidade, ingredientes compartilhados, idempotência, no-prep, saldo negativo documentado |
| P1 | Relatórios agregados | período de um dia, 7 dias, mês com 31 dias, documento inexistente, fallback histórico, timezone |
| P1 | Despesa/agregados | criar, alterar valor/categoria/data, excluir, pagar/reabrir e replays |
| P2 | Segurança | 401, 403, papel, tenant cruzado, regras cliente de leitura/escrita |
| P2 | Estados | mesa ocupada, remover item não pendente, cancelar com pagamento, delivery transição inválida |
| P3 | UI/PWA | celular 320–430 px, tablet/desktop, CSV, QR, impressão e update PWA |

## Bugs históricos documentados para regressão

A documentação de teste menciona: função inexistente depois de criar pedido, mistura de API transacional Node/Python, `Transaction.get` retornando generator, campos não removidos, duas instâncias FastAPI, contrato de pagamento antigo, plataforma delivery inválida e regras de leitura/escrita. A lista serve como orientação; confirmar quais casos continuam ativos na suíte vigente.

## Regra de aceite

Build verde não comprova comportamento visual/mobile, e unit tests não substituem E2E de Firestore real. Toda correção crítica deve ter um caso que falha antes e passa depois.
