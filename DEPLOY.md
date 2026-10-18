# DEPLOY EM PRODUÃ‡ÃƒO â€” R$ 0/mÃªs, sem cartÃ£o

> Stack: **Render.com free** (API FastAPI) + **Firebase Hosting Spark** (frontend PWA) + Firestore/Auth Spark.
> DecisÃµes fechadas no `PLANO-CORRECOES.md` (nÃ£o re-discutir). Tradeoff aceito: Render free dorme apÃ³s 15 min (~30â€“60s para acordar).
>
> âœ… **EXECUTADO em 2026-08-23.** URLs reais:
> - Frontend: `https://pdv-lanchonete-1fa79.web.app`
> - API: `https://pdv-lanchonete-dwiw.onrender.com` (o slug `-dwiw` existe porque nomes `.onrender.com` sÃ£o globais â€” `pdv-lanchonete.onrender.com` Ã© de OUTRA conta)
> - Repo: `https://github.com/gabrielabrahaodev/pdv-lanchonete` (push em `master` â†’ auto-deploy na Render; visibilidade no GitHub Ã© decisÃ£o do dono â€” confirme as Settings antes de assumir pÃºblico/privado)

## Arquitetura

```
Celular/Navegador
  â”‚  https://pdv-lanchonete-1fa79.web.app        (Firebase Hosting)
  â”‚  â””â”€ frontend/dist estÃ¡tico (PWA + SW workbox)
  â”‚       â””â”€ chama https://pdv-lanchonete-dwiw.onrender.com/api/...  (VITE_API_URL embutido NO BUILD)
  â–¼
Render free tier: uvicorn app.main:app --host 0.0.0.0 --port $PORT
  â””â”€ credenciais via env FIREBASE_SERVICE_ACCOUNT_JSON
Firestore/Firebase Auth â€” projeto pdv-lanchonete-1fa79
```

Sem rewrite `/api/*` (isso exigia plano Blaze): o frontend chama a API por URL direta + CORS.

## Passo a passo

### 1. GitHub

O projeto Ã© versionado localmente (commit inicial jÃ¡ feito). Para publicar:

```powershell
# com GitHub CLI autenticado (gh auth login) OU crie o repo vazio no site
gh repo create pdv-lanchonete --private --source . --push
```

âš ï¸ O `.gitignore` jÃ¡ exclui `scripts/service-account.json` (SEGREDO), `.venv/`, `node_modules/`, `dist/`, `.env`. Confira com `git status` antes de qualquer push.

### 2. Render (backend)

1. Conta grÃ¡tis em render.com (login com GitHub).
2. **New â†’ Web Service** â†’ conectar o repo.
3. Se usar o blueprint `render.yaml`: Render detecta e prÃ©-preenche. Conferir:
   - Runtime: **Python** Â· Root Directory: `backend`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Environment â†’ adicionar as 2 variÃ¡veis (ambas marcadas `sync: false` no yaml):
   - `CORS_ORIGINS` = `https://pdv-lanchonete-1fa79.web.app` (exato, com https, SEM barra final)
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = conteÃºdo integral de `scripts/service-account.json`
5. Deploy. Anotar a URL (a nossa: `https://pdv-lanchonete-dwiw.onrender.com`).

O backend lÃª credenciais nesta ordem (`app/core/firebase.py`):
1. env `FIREBASE_SERVICE_ACCOUNT_JSON` â†’ 2. arquivo local (dev) â†’ 3. ADC (futuras nuvens GCP).

### 3. Smoke do backend

```powershell
Invoke-RestMethod https://pdv-lanchonete-dwiw.onrender.com/health    # espera {"status":"ok",...}
```

Primeira chamada pode demorar ~60s (instÃ¢ncia acordando do sleep) â€” use timeout â‰¥120s.

> `/health` aceita **GET e HEAD**. MAS `/health` Ã© **estÃ¡tico** e nÃ£o prova que o Firestore estÃ¡ acessÃ­vel (bugs 7 e 12 tiveram `/health` ok com API quebrada). ApÃ³s qualquer deploy, sonde tambÃ©m um endpoint que LEIA Firestore, ex.: `GET /api/publico/{rid}/cardapio`.

### 4. Frontend build com a URL da API

`VITE_*` Ã© embutido NO BUILD (nÃ£o Ã© runtime) â€” rebuild sempre que mudar:

```powershell
cd frontend
$env:VITE_API_URL = 'https://pdv-lanchonete-dwiw.onrender.com'   # ANTES do build
npm run build
Remove-Item Env:VITE_API_URL                    # limpa p/ builds locais
```

### 5. Firebase Hosting + regras

```powershell
npm i -g firebase-tools     # se ainda nÃ£o tiver
firebase login              # uma vez
firebase deploy --only hosting,firestore:rules
```

Site no ar em `https://pdv-lanchonete-1fa79.web.app`.

### 6. Authorized Domains (login vai falhar sem isso)

Console Firebase â†’ Authentication â†’ Settings â†’ **Authorized domains** â†’ adicionar `pdv-lanchonete-1fa79.web.app`.
Sem isso o login retorna `auth/unauthorized-domain`.

### 7. Checklist final

- [ ] Login em `https://pdv-lanchonete-1fa79.web.app` funciona
- [ ] Console do navegador SEM warning `[realtime] ... indisponÃ­vel` (tempo real ativo; sem ele, banner vermelho no topo)
- [ ] QR de uma mesa escaneado do CELULAR real â†’ cardÃ¡pio somente-leitura, SEM botÃ£o de pedido (pedido pelo QR retorna 410)
- [ ] ðŸ–¨ Testar impressora em ConfiguraÃ§Ãµes (Web Bluetooth exige HTTPS â€” deve abrir o seletor)
- [ ] PWA instalÃ¡vel (Ã­cone "Instalar app" no Chrome Android)
- [ ] Pagamento pix quita pedido e DRE em RelatÃ³rios reflete a venda

### 8. Keep-alive (mitigaÃ§Ã£o grÃ¡tis do sleep do Render)

O plano free da Render dorme apÃ³s 15 min sem trÃ¡fego (~30â€“60s para acordar).
Jobs no cron-job.org (grÃ¡tis), timezone `America/Sao_Paulo`, timeout 30s:

1. `pdv-pre-warm-0555` â€” `GET /health`, 1Ã—/dia Ã s 05:50 e 05:55 (acorda antes de abrir; o 1Âº pode dar timeout e mesmo assim acorda a instÃ¢ncia)
2. `pdv-keepalive-06-20` â€” `GET /health`, `*/10 6-20 * * *` (sÃ³ 06â€“20h; fora disso a Render dorme sozinha ~20:15 e economiza ~300h/mÃªs do teto 750h)

Pronto â€” quente no comercial, dormindo de madrugada. Zero custo.
> `/health` aceita GET e HEAD. UptimeRobot 24/7 foi pausado (substituÃ­do pela janela acima).

### 9. Sentry (alerta de erros, opcional mas recomendado)

O backend jÃ¡ tem integraÃ§Ã£o pronta â€” fica **inativo** sem a env:

1. Conta grÃ¡tis em sentry.io â†’ criar projeto **FastAPI** â†’ copiar o DSN
2. Render â†’ serviÃ§o pdv-lanchonete â†’ Environment â†’ adicionar `SENTRY_DSN=<dsn>` â†’ Save (redeploy)
3. Pronto: qualquer exceÃ§Ã£o 5xx aparece no Sentry com stack trace

Frontend: deixar para depois (custo de bundle vs benefÃ­cio â€” prioridade foi o code-splitting).

---

## Armadilhas conhecidas

- **Segredo**: `service-account.json` NUNCA vai pro GitHub â€” na Render ele entra como env var.
- **pydantic-settings**: a env Ã© vinculada pelo NOME DO CAMPO (case-insensitive, sem prefixo). O campo tem que se chamar `firebase_service_account_json` para ler `FIREBASE_SERVICE_ACCOUNT_JSON` â€” jÃ¡ corrigido (bug histÃ³rico: campo `service_account_json` nunca lia a var da Render e o backend caÃ­a no ADC sem projeto â†’ 401 em tudo com token e 500 nos endpoints pÃºblicos).
- **CORS**: valor exato `https://<projeto>.web.app`; erro tÃ­pico = "CORS policy" no console.
- **sw.js sem no-cache**: PWA para de receber atualizaÃ§Ãµes (headers jÃ¡ configurados no `firebase.json`).
- **Render sleep**: primeira chamada lenta ~30â€“60s; mitigaÃ§Ã£o grÃ¡tis = cron-job.org pingando `/health` 06â€“20h BRT (Â§8), ou abrir o PDV antes de abrir a loja.
- **Quotas Firestore Spark**: 50k leituras/20k escritas/dia â€” telas leem via snapshot filtrado por tela (sem polling); pagos/fechados sÃ³ em sessÃ£o e relatÃ³rios; monitorar no Console.
- PowerShell 5.1: `$env:VAR='x'; npm run build` funciona; nÃ£o usar `set VAR=x`.

## Baseline de regressÃ£o pÃ³s-deploy

> âš ï¸ **Regra permanente (2026-08-24): validar em localhost ANTES de qualquer deploy/push.**
> Backend local + suÃ­te E2E com `-Base http://127.0.0.1:8000` â†’ sÃ³ depois commit/deploy.

```powershell
cd backend && .venv\Scripts\python -m pytest tests -q           # contagem honesta: veja no rodapÃ© do pytest (117+ unitÃ¡rios com stub)

# token para E2E â€” credenciais NUNCA embutidas: args ou env
cd scripts\e2e && node get-token.js <email> <senha>             # token vale 1h
# equivalente por env: $env:E2E_EMAIL; $env:E2E_SENHA; node get-token.js

# Opcional (seÃ§Ã£o 13 onboarding): token do DONO da plataforma
# node get-token.js gabriel@pdv.com '<senha>' token-owner.txt   # sem o arquivo, seÃ§Ã£o 13 Ã© pulada com aviso

powershell -NoProfile -ExecutionPolicy Bypass -File api_test.ps1               # padrÃ£o: produÃ§Ã£o (exige E2E_SENHA)
powershell -NoProfile -ExecutionPolicy Bypass -File api_test.ps1 -Base http://127.0.0.1:8000  # local
cd frontend && npx tsc --noEmit                                 # exit 0
cd frontend && npx firebase-tools emulators:exec --only firestore --project demo-p0a "node tests/firestore_rules.test.mjs"
```

**Liveness x readiness (P1-M):**
- `GET /health` â€” liveness puro (nunca toca Firestore). UptimeRobot/cron-job devem usar ESTE para nÃ£o derrubar o serviÃ§o.
- `GET /ready` â€” readiness: ping curto no Firestore (timeout 1.5s); 503 = Firestore indisponÃ­vel. Monitores que decidem trÃ¡fego usam ESTE.
- Contagem de unitÃ¡rios no rodapÃ© do pytest (nada hardcode â€” o numero cresce conforme suÃ­tes novas).
Ãšltimo baseline completo validado em produÃ§Ã£o: 2026-08-24 (51/51 antes da seÃ§Ã£o onboarding); fix do caixa `abertoEm` revalidado em produÃ§Ã£o em 2026-08-25.

CI (GitHub Actions) roda pytest + tsc + build em todo push/PR.
