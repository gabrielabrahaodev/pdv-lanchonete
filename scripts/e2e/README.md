# Testes E2E do PDV

Suíte que valida o sistema **de ponta a ponta contra um ambiente real** (produção por padrão).
Cria dados `QA *` e faz cleanup automático ao final.

## Preparação (uma vez)

```powershell
cd scripts
npm install          # instala firebase-admin + firebase (client usado pelos testes)
```

## Rodar

```powershell
cd scripts\e2e

# 1. Token (expira em 1h — gere de novo se começar a dar 401 "Token inválido ou expirado")
node get-token.js

# 2. Suíte completa da API (34 testes) — padrão: produção (Render)
powershell -NoProfile -ExecutionPolicy Bypass -File api_test.ps1

# Contra o backend local:
powershell -NoProfile -ExecutionPolicy Bypass -File api_test.ps1 -Base http://127.0.0.1:8000

# 3. Fluxo do app direto no Firestore (valida firestore.rules + caminho client)
node e2e_test.js
```

## O que a suíte cobre

auth (401/me) · CRUD categorias/produtos · mesas · pedido→cozinha→pronto ·
caixa (abrir/suprimento/sangria/fechar) · pagamento pix minimalista quita pedido e libera mesa ·
estoque (item/movimentação/lista/delete) · delivery (criar/confirmar/listar/cancelar + 422 plataforma inválida) ·
relatório resumo **incluindo a venda recém-criada** · configurações · cleanup.

> ⚠️ A janela de datas do relatório usa a meia-noite **local convertida para UTC** (`ToUniversalTime()`).
> Histórico: montar `yyyy-MM-ddT00:00:00Z` com a data local fazia a venda das 21h de Brasília
> nascer "no dia seguinte" em UTC e o relatório parecia zerado (bug era do teste, não do sistema).

## Estado atual

- Produção (Render): **34/34 PASS** (2026-08-23)
- Backend local: 34/34 PASS
