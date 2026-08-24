# DEPLOY EM PRODUÇÃO — R$ 0/mês, sem cartão

> Stack: **Render.com free** (API FastAPI) + **Firebase Hosting Spark** (frontend PWA) + Firestore/Auth Spark.
> Decisões fechadas no `PLANO-CORRECOES.md` (não re-discutir). Tradeoff aceito: Render free dorme após 15 min (~30–60s para acordar).
>
> ✅ **EXECUTADO em 2026-08-23.** URLs reais:
> - Frontend: `https://pdv-lanchonete-1fa79.web.app`
> - API: `https://pdv-lanchonete-dwiw.onrender.com` (o slug `-dwiw` existe porque nomes `.onrender.com` são globais — `pdv-lanchonete.onrender.com` é de OUTRA conta)
> - Repo: `https://github.com/gabrielabrahaodev/pdv-lanchonete` (privado; push em `master` → auto-deploy na Render)

## Arquitetura

```
Celular/Navegador
  │  https://pdv-lanchonete-1fa79.web.app        (Firebase Hosting)
  │  └─ frontend/dist estático (PWA + SW workbox)
  │       └─ chama https://pdv-lanchonete-dwiw.onrender.com/api/...  (VITE_API_URL embutido NO BUILD)
  ▼
Render free tier: uvicorn app.main:app --host 0.0.0.0 --port $PORT
  └─ credenciais via env FIREBASE_SERVICE_ACCOUNT_JSON
Firestore/Firebase Auth — projeto pdv-lanchonete-1fa79
```

Sem rewrite `/api/*` (isso exigia plano Blaze): o frontend chama a API por URL direta + CORS.

## Passo a passo

### 1. GitHub

O projeto é versionado localmente (commit inicial já feito). Para publicar:

```powershell
# com GitHub CLI autenticado (gh auth login) OU crie o repo vazio no site
gh repo create pdv-lanchonete --private --source . --push
```

⚠️ O `.gitignore` já exclui `scripts/service-account.json` (SEGREDO), `.venv/`, `node_modules/`, `dist/`, `.env`. Confira com `git status` antes de qualquer push.

### 2. Render (backend)

1. Conta grátis em render.com (login com GitHub).
2. **New → Web Service** → conectar o repo.
3. Se usar o blueprint `render.yaml`: Render detecta e pré-preenche. Conferir:
   - Runtime: **Python** · Root Directory: `backend`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Environment → adicionar as 2 variáveis (ambas marcadas `sync: false` no yaml):
   - `CORS_ORIGINS` = `https://pdv-lanchonete-1fa79.web.app` (exato, com https, SEM barra final)
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = conteúdo integral de `scripts/service-account.json`
5. Deploy. Anotar a URL (a nossa: `https://pdv-lanchonete-dwiw.onrender.com`).

O backend lê credenciais nesta ordem (`app/core/firebase.py`):
1. env `FIREBASE_SERVICE_ACCOUNT_JSON` → 2. arquivo local (dev) → 3. ADC (futuras nuvens GCP).

### 3. Smoke do backend

```powershell
Invoke-RestMethod https://pdv-lanchonete-dwiw.onrender.com/health    # espera {"status":"ok",...}
```

Primeira chamada pode demorar ~60s (instância acordando do sleep) — use timeout ≥120s.

> `/health` aceita **GET e HEAD** (monitores como UptimeRobot fazem HEAD).

### 4. Frontend build com a URL da API

`VITE_*` é embutido NO BUILD (não é runtime) — rebuild sempre que mudar:

```powershell
cd frontend
$env:VITE_API_URL = 'https://pdv-lanchonete-dwiw.onrender.com'   # ANTES do build
npm run build
Remove-Item Env:VITE_API_URL                    # limpa p/ builds locais
```

### 5. Firebase Hosting + regras

```powershell
npm i -g firebase-tools     # se ainda não tiver
firebase login              # uma vez
firebase deploy --only hosting,firestore:rules
```

Site no ar em `https://pdv-lanchonete-1fa79.web.app`.

### 6. Authorized Domains (login vai falhar sem isso)

Console Firebase → Authentication → Settings → **Authorized domains** → adicionar `pdv-lanchonete-1fa79.web.app`.
Sem isso o login retorna `auth/unauthorized-domain`.

### 7. Checklist final

- [ ] Login em `https://pdv-lanchonete-1fa79.web.app` funciona
- [ ] Console do navegador SEM warning `[realtime] ... permission-denied` (tempo real onSnapshot ativo)
- [ ] QR de uma mesa escaneado do CELULAR real → pedido cai no KDS (rota `/m/{restaurantId}/{mesaId}`)
- [ ] 🖨 Testar impressora em Configurações (Web Bluetooth exige HTTPS — deve abrir o seletor)
- [ ] PWA instalável (ícone "Instalar app" no Chrome Android)
- [ ] Pagamento pix quita pedido e DRE em Relatórios reflete a venda

### 8. UptimeRobot (mitigação grátis do sleep do Render)

O plano free da Render dorme após 15 min sem tráfego (~30–60s para acordar).
Configure 1 monitor no UptimeRobot free (sem limites práticos — 50 monitors, intervalo mínimo 5 min):

1. uptimerobot.com → conta grátis → **Add New Monitor**
2. Tipo: **HTTP(s)** → URL: `https://pdv-lanchonete-dwiw.onrender.com/health`
3. Intervalo: **10 min** (ou 5 min)
4. Alert contacts: opcional (e-mail/Telegram/Discord)
5. Save

Pronto — a instância permanece "quente" enquanto o monitor roda. Zero custo, sem limites atingíveis.
> `/health` aceita GET e HEAD (monitores fazem HEAD).

### 9. Backup automático do Firestore (GitHub Actions)

Workflow `.github/workflows/backup.yml`: **todo dia 03:30 (Brasília)** exporta todos os tenants
em JSON e commita em `backups/` no próprio repo privado. Também roda sob demanda
(Aba Actions → Backup Firestore → Run workflow).

- Secret necessário: `FIREBASE_SERVICE_ACCOUNT_JSON` no GitHub (Settings → Secrets and variables → Actions).
- Manual local: `cd scripts && npm run backup` → gera `backups/backup-<data>.json`.
- Restauração: os JSON são completos por tenant (`config` + todas as coleções) — reimportar
  com um script Admin (`set`) quando necessário.

### 10. Sentry (alerta de erros, opcional mas recomendado)

O backend já tem integração pronta — fica **inativo** sem a env:

1. Conta grátis em sentry.io → criar projeto **FastAPI** → copiar o DSN
2. Render → serviço pdv-lanchonete → Environment → adicionar `SENTRY_DSN=<dsn>` → Save (redeploy)
3. Pronto: qualquer exceção 5xx aparece no Sentry com stack trace

Frontend: deixar para depois (custo de bundle vs benefício — prioridade foi o code-splitting).

---

## Armadilhas conhecidas

- **Segredo**: `service-account.json` NUNCA vai pro GitHub — na Render ele entra como env var.
- **pydantic-settings**: a env é vinculada pelo NOME DO CAMPO (case-insensitive, sem prefixo). O campo tem que se chamar `firebase_service_account_json` para ler `FIREBASE_SERVICE_ACCOUNT_JSON` — já corrigido (bug histórico: campo `service_account_json` nunca lia a var da Render e o backend caía no ADC sem projeto → 401 em tudo com token e 500 nos endpoints públicos).
- **CORS**: valor exato `https://<projeto>.web.app`; erro típico = "CORS policy" no console.
- **sw.js sem no-cache**: PWA para de receber atualizações (headers já configurados no `firebase.json`).
- **Render sleep**: primeira chamada lenta ~30–60s; mitigação grátis = UptimeRobot pingando `/health` a cada 10 min, ou abrir o PDV antes de abrir a loja.
- **Quotas Firestore Spark**: 50k leituras/20k escritas/dia — listeners onSnapshot contam leituras; monitorar no Console.
- PowerShell 5.1: `$env:VAR='x'; npm run build` funciona; não usar `set VAR=x`.

## Baseline de regressão pós-deploy

```powershell
cd backend && .venv\Scripts\python -m pytest tests -q          # 23 passed
cd scripts\e2e && node get-token.js                            # token vale 1h
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\e2e\api_test.ps1   # 35/35 (produção)
cd frontend && npx tsc --noEmit                                 # exit 0
```

CI (GitHub Actions) roda pytest + tsc + build em todo push/PR.
