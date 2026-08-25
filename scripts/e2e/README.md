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

auth (401/me) · CRUD categorias/produtos (com guard 409 de categoria em uso) · imagem do produto
(PUT + rota pública de bytes) · mesas · cardápio público com variação+observações (pedido SEM token) ·
pedido→cozinha bulk com baixa agregada de estoque (regressão do bug 10) · pagamento pix minimalista quita pedido e libera mesa ·
caixa (abrir/suprimento/sangria/fechar, condicionais se já houver sessão aberta) ·
estoque (item/movimentação/lista/delete) · delivery (criar/confirmar/listar/cancelar + 422 plataforma inválida) ·
relatório resumo **incluindo a venda recém-criada** · configurações ·
**onboarding com conta descartável** (signUp via Identity Toolkit REST → 201 → retry auto-cura →
refresh de claims → 409 final) · governança da flag global (`donoUids`: não-dono toma 403 —
condicional, pulado com aviso se `npm run promover-dono` ainda não rodou) · cleanup.

### Sobre a seção onboarding (seção 13)

Requer o token do DONO DA PLATAFORMA (conta `gabriel@pdv.com`, sem restaurante):

```powershell
cd scripts\e2e
node get-token.js gabriel@pdv.com 'SENHA-DO-OWNER' token-owner.txt
```

Sem esse arquivo a seção 13 é pulada com aviso (o resto da suíte roda normal).

O que ela cobre: owner gera convite · **admin de tenant tenta gerar convite → 403** (separação
de planos) · signUp descartável via Identity Toolkit REST → criação SEM convite 403 → COM convite
201 → retry auto-cura devolve o MESMO restaurante → refresh de claims (`souDono=false`) → 3º POST
409 → reuso do convite 403 → convite revogado 403.

Cria restaurantes QA mínimos (1 mesa) que NÃO são apagados pelo cleanup automático. Limpeza:

```powershell
cd scripts
npm run limpar-onboarding-qa          # dry-run (padrão)
npm run limpar-onboarding-qa -- --exec   # apaga restaurantes "QA Onboard*"/qa_onboard_*, markers e contas descartáveis
```

Gestão dos donos da plataforma (`sistema/global.donoUids`):

```powershell
cd scripts
npm run promover-dono -- listar
npm run promover-dono -- adicionar --uid <uid> --exec
npm run promover-dono -- remover --uid <uid> --exec
```

> ⚠️ A janela de datas do relatório usa a meia-noite **local convertida para UTC** (`ToUniversalTime()`).
> Histórico: montar `yyyy-MM-ddT00:00:00Z` com a data local fazia a venda das 21h de Brasília
> nascer "no dia seguinte" em UTC e o relatório parecia zerado (bug era do teste, não do sistema).

## Estado atual

- Produção (Render): 51/51 PASS (2026-08-24, antes da seção onboarding)
- Backend local: 34/34 PASS (histórico; suíte cresceu desde então)
