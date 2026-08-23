# DEPLOY EM PRODUÇÃO — R$ 0/mês, sem cartão

> Stack: **Render.com free** (API FastAPI) + **Firebase Hosting Spark** (frontend PWA) + Firestore/Auth Spark.
> Decisões fechadas no `PLANO-CORRECOES.md` (não re-discutir). Tradeoff aceito: Render free dorme após 15 min (~30–60s para acordar).

## Arquitetura

```
Celular/Navegador
  │  https://pdv-lanchonete-1fa79.web.app        (Firebase Hosting)
  │  └─ frontend/dist estático (PWA + SW workbox)
  │       └─ chama https://<url-render>/api/...  (VITE_API_URL embutido NO BUILD)
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
5. Deploy. Anotar a URL (ex.: `https://pdv-api-xxxx.onrender.com`).

O backend lê credenciais nesta ordem (`app/core/firebase.py`):
1. env `FIREBASE_SERVICE_ACCOUNT_JSON` → 2. arquivo local (dev) → 3. ADC (futuras nuvens GCP).

### 3. Smoke do backend

```powershell
Invoke-RestMethod https://<url-render>/health    # espera {"status":"ok",...}
```

Primeira chamada pode demorar ~60s (instância acordando do sleep).

### 4. Frontend build com a URL da API

`VITE_*` é embutido NO BUILD (não é runtime) — rebuild sempre que mudar:

```powershell
cd frontend
$env:VITE_API_URL = 'https://<url-render>'      # ANTES do build
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

## Armadilhas conhecidas

- **Segredo**: `service-account.json` NUNCA vai pro GitHub — na Render ele entra como env var.
- **CORS**: valor exato `https://<projeto>.web.app`; erro típico = "CORS policy" no console.
- **sw.js sem no-cache**: PWA para de receber atualizações (headers já configurados no `firebase.json`).
- **Render sleep**: primeira chamada lenta ~30–60s; mitigação grátis = UptimeRobot pingando `/health` a cada 10 min, ou abrir o PDV antes de abrir a loja.
- **Quotas Firestore Spark**: 50k leituras/20k escritas/dia — listeners onSnapshot contam leituras; monitorar no Console.
- PowerShell 5.1: `$env:VAR='x'; npm run build` funciona; não usar `set VAR=x`.

## Baseline de regressão pós-deploy

```powershell
cd backend && .venv\Scripts\python -m pytest tests -q          # 23 passed
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\Temp\opencode\e2e-repro\api_test.ps1"   # 34/34 (node get-token.js antes se expirou)
cd frontend && npx tsc --noEmit                                 # exit 0
```
