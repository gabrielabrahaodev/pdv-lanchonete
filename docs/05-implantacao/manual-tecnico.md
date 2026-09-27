# Manual Técnico — PDV Lanchonete v2

Referência para desenvolvedores/operadores que instalarão, diagnosticarão e evoluirão o sistema.

---

## 1. Stack e versões

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.12 · FastAPI ≥0.115 · uvicorn[standard] · firebase-admin **pin exato** (`firebase-admin==7.5.0`, `google-cloud-firestore==2.28.1`, `google-api-core==2.34.0`, `google-auth==2.56.3`, `grpcio==1.83.0` — drift de dependências derrubou a produção, bug 12) · pydantic v2 + pydantic-settings · **tzdata (obrigatório)** |
| Frontend | Vite 5 · React 18 · TypeScript 5.6 · Tailwind 4 (`@tailwindcss/vite`, `@custom-variant dark`) · TanStack Query 5 · react-router-dom 6 · firebase JS 11 · qrcode · vite-plugin-pwa + workbox |
| Infra | Firebase Auth · Firestore (projeto `pdv-lanchonete-1fa79`) · firestore.rules v2 |
| Ferramentas | pytest · scripts TS com firebase-admin |

## 2. Como subir o ambiente

```powershell
# backend (SEMPRE pelo python da .venv — o global não tem fastapi)
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python -m uvicorn app.main:app --port 8000

# frontend
cd frontend && npm install && npm run dev   # :5173, proxy /api → :8000

# PWA precisa de build:
npm run build && npm run preview

# seeds
cd ..\scripts && npm install && npm run init && npm run seed
```

**Servidor em background (Windows):** saída em `uv-test.out.log`/`srv.err.log`, PID em `server.pid`. Não usar `--reload`: após mudar código Python, `Stop-Process` no PID e subir de novo. Ruído `--- Logging error --- OSError [Errno 22]` no log é do access logger do uvicorn em pipe no Windows — inofensivo.

## 3. Configuração

Backend (lido por pydantic-settings — a env é vinculada pelo NOME DO CAMPO):
| Var | Default | Uso |
|---|---|---|
| `PROJECT_ID` | pdv-lanchonete-1fa79 | projeto Firebase |
| `SERVICE_ACCOUNT_PATH` | `<raiz>/scripts/service-account.json` | credencial nível 2 (dev) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | — | credencial nível 1: JSON completo em string (Render/nuvem). Ordem: env → arquivo → ADC |
| `CORS_ORIGINS` | http://localhost:5173,http://127.0.0.1:5173 | produção: `https://pdv-lanchonete-1fa79.web.app` |
| `TIMEZONE` (settings.timezone) | America/Sao_Paulo | fuso dos relatórios |
| `SENTRY_DSN` | — | opcional; sem a env a integração fica inativa |

Frontend: `VITE_API_URL` é embutido NO BUILD (produção: `https://pdv-lanchonete-dwiw.onrender.com`; vazio no dev = proxy do Vite). Firebase web config em `src/lib/firebase.ts`.

## 4. Arquitetura de código (mapa rápido)

```
backend/app
 main.py            # UMA instância: lifespan(firebase) + CORS + routers(prefix=/api) + /health
 core/security.py   # get_current_auth → require_restaurant → require_roles(*papeis)
 services/base.py   # items_col/item_doc/config_doc; stamp_create/update; doc_to_dict normaliza datas
 services/*.py      # regras; transações com @transactional (SDK python!)
 models/models.py   # CamelModel (alias camelCase)
frontend/src
 lib/api.ts         # fetch + Bearer getIdToken() + ApiError(status)
  hooks/useFirestore  # 13 hooks onSnapshot filtrados por tela = fonte dos dados (zero polling)
 context/*          # AuthContext (/auth/me), ThemeContext (tema por uid)
```

## 5. Banco de dados

Estrutura e dicionário completos em `../02-modelagem/esquema-logico-banco-dados.md`. Pontos técnicos:

- Leitura sempre via `doc_to_dict` (normaliza createdAt→criadoEm etc.).
- `list_items` carrega a coleção e ordena em memória — sem índices compostos; telas quentes usam filtros server-side de campo único (`status==aberto`, janelas de data, `limit`); `list_items_window` para janelas.
- Queries transacionais usadas: `sessoes_caixa where status==aberto`.
- Limpeza de campo: **DELETE_FIELD explícito** (stamp_update descarta None).

## 6. Autenticação e claims

- ID token (~1h) verificado por `verify_id_token`; claims exigidos: `restaurantId` (403 se ausente) + `papel`.
- Claims só valem no **próximo token**: após set_custom_user_claims, cliente deve `getIdToken(true)`.
- Onboarding tem guard duplo (claim + marcador transacional `onboarding/{uid}`).
- Para guardas críticos não confie só no claim (token pode estar velho).

## 7. Testes

```powershell
# unitários (35; CI roda via backend/requirements-dev.txt)
backend\.venv\Scripts\python -m pytest tests -q

# suíte E2E de API (80 passos base + 13 de onboarding condicionais) — versionada em scripts/e2e/, alvo padrão = produção
cd scripts\e2e
node get-token.js        # expira em 1h — refazer se der 401
powershell -NoProfile -ExecutionPolicy Bypass -File api_test.ps1
# local: ... -Base http://127.0.0.1:8000
# seção 13 (onboarding/convites): requer token do dono da plataforma
node get-token.js gabriel@pdv.com '<senha>' token-owner.txt   # sem o arquivo, seção pulada com aviso
```

Fluxo validado ponta a ponta: categoria/produto QA → pedido em mesa livre → mesa ocupada → item preparo/pronto via `/api/cozinha/...` → pagamento pix quita → mesa livre → venda credita caixa → fechar confere totais → relatório reflete.

## 8. Diagnóstico de problemas

| Sintoma | Causa provável | Ação |
|---|---|---|
| Todo `/api/*` dá 404, só `/health` responde | duas instâncias FastAPI | garantir routers na instância exportada (main.py) |
| `ZoneInfoNotFoundError: America/Sao_Paulo` | tzdata ausente | `.venv\Scripts\pip install tzdata` |
| 401 "Token inválido ou expirado" na suíte | token.txt velho | rodar `node get-token.js` |
| "Token ausente" com URL aparentemente correta | barra final → 307 stripa Authorization | chamar sem trailing slash |
| 403 em tudo após criar usuário/papel | claim antigo no token | logout/login ou getIdToken(true) |
| **Produção: 401 em toda rota autenticada + 500 nos endpoints públicos, `/health` ok** | credencial Admin quebrada/ausente (ex.: env `FIREBASE_SERVICE_ACCOUNT_JSON` não vinculada — ver D-6 em ../04-testes/relatorios-teste.md) | conferir Environment na Render; log de boot mostra "Firebase Admin: usando ..." |
| Monitor externo reporta "405 method not allowed" com serviço saudável | monitor faz HEAD e o endpoint só aceitava GET | endpoints de health devem aceitar `methods=["GET","HEAD"]` |
| Relatório/DRE parece zerado à noite | janela de datas do CHAMADOR com data local rotulada como UTC | converter local→UTC explicitamente (`ToUniversalTime()` / `toISOString()` após setHours) |
| **Produção: `500 {"detail":"Erro interno: InvalidArgument"}` em toda chamada Firestore, `/health` ok, MESMO código funciona local** | drift de dependências gRPC/firestore (`Invalid database id %28default%29`) | conferir pins exatos no requirements.txt e redeploy (bug 12) |
| **500 ao iniciar preparo só em produto com 2+ ingredientes** | `ReadAfterWriteError`: transação leu doc depois de escrever outro | fase de leitura completa antes das escritas; usar o bulk da cozinha (bug 10) |
| **Erro 500 que chega ao browser como falha de CORS** | exceção não tratada passa fora do CORSMiddleware | middleware interno `_Erros500Json` devolve 500 JSON dentro da pilha (bug 9) |
| "+ Adicionar itens" dá 409 silencioso / botão morto | tela usava cache react-query de estado volável; mutation sem onError | revalidar no servidor dentro do `mutationFn` + onError visível (bug 11) |
| Caixa mostra "desde Invalid Date" | sessão antiga sem campo `abertoEm` | corrigido (2026-08-25): backend grava `abertoEm`; frontend usa fallback `criadoEm` |
| onSnapshot warning no console + banner vermelho | rules não publicadas | `firebase deploy --only firestore:rules` (leituras caem no cache; escritas falham) |
| PowerShell: filtro sobre array devolve array | pipar Invoke-RestMethod direto em Where-Object | atribuir a variável antes: `$l = Invoke-...; @($l | Where ...)[0]` |
| ConvertTo-Json desmonta array de 1 | comportamento PS 5.1 | `ConvertTo-Json -InputObject $array` |

## 9. Operação e manutenção básica

- **Produção**: app https://pdv-lanchonete-1fa79.web.app · API https://pdv-lanchonete-dwiw.onrender.com (free tier: dorme após ~15 min; cron-job.org mantém aquecido 06–20h BRT). Release frontend: build com `VITE_API_URL` + `firebase deploy --only hosting`. Push em `master` → CI + auto-deploy da API.

- **Sentry (opcional)**: criar projeto FastAPI no sentry.io → env `SENTRY_DSN` na Render → redeploy. Inativo sem DSN.
- Reset total do banco demo: `scripts/delete-all-collections.ts` (**destrutivo**).
- Reinício limpo do backend local: parar PID de `backend/server.pid`, subir novamente.
- Monitorar: `/health`, latência das listagens, quota Spark (leituras diárias), tamanho das coleções.
- ⚠️ `/health` é estático e NÃO prova que o Firestore está acessível — smoke pós-deploy deve incluir um endpoint que LEIA Firestore (ex.: `GET /api/publico/{rid}/cardapio`).
- Fluxo da cozinha: preferir sempre o endpoint bulk `PATCH /api/cozinha/pedidos/{id}/itens/status` (nunca N PATCHes paralelos por item).

## 10. Extensões planejadas (onde mexer)

| Evolução | Ponto de extensão |
|---|---|
| Webhook iFood/Goomer | novo router público com HMAC → `delivery_service.criar` já aceita metadata/externalId |
| Fila offline de escritas (PWA) | workbox background sync + idempotency keys nos POSTs |
| NFC-e | módulo fiscal novo chamado dentro da quitação (`caixa_service.registrar_pagamento`) |
| Paginação de coleções grandes | substituir `list_items` por queries com índices |
