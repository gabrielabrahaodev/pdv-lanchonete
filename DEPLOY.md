# DEPLOY EM PRODUÇÃO — R$ 0/mês, sem cartão

> Stack: **Render.com free** (API FastAPI) + **Firebase Hosting Spark** (frontend PWA) + Firestore/Auth Spark.
> Decisões fechadas no `PLANO-CORRECOES.md` (não re-discutir). Tradeoff aceito: Render free dorme após 15 min (~30–60s para acordar).
>
> ✅ **EXECUTADO em 2026-08-23.** URLs reais:
> - Frontend: `https://pdv-lanchonete-1fa79.web.app`
> - API: `https://pdv-lanchonete-dwiw.onrender.com` (o slug `-dwiw` existe porque nomes `.onrender.com` são globais — `pdv-lanchonete.onrender.com` é de OUTRA conta)
> - Repo: `https://github.com/gabrielabrahaodev/pdv-lanchonete` (push em `master` → auto-deploy na Render; visibilidade no GitHub é decisão do dono — confirme as Settings antes de assumir público/privado)

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

> `/health` aceita **GET e HEAD**. MAS `/health` é **estático** e não prova que o Firestore está acessível (bugs 7 e 12 tiveram `/health` ok com API quebrada). Após qualquer deploy, sonde também um endpoint que LEIA Firestore, ex.: `GET /api/publico/{rid}/cardapio`.

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
- [ ] Console do navegador SEM warning `[realtime] ... indisponível` (tempo real ativo; sem ele, banner vermelho no topo)
- [ ] QR de uma mesa escaneado do CELULAR real → cardápio somente-leitura, SEM botão de pedido (pedido pelo QR retorna 410)
- [ ] 🖨 Testar impressora em Configurações (Web Bluetooth exige HTTPS — deve abrir o seletor)
- [ ] PWA instalável (ícone "Instalar app" no Chrome Android)
- [ ] Pagamento pix quita pedido e DRE em Relatórios reflete a venda

### 8. Keep-alive (mitigação grátis do sleep do Render)

O plano free da Render dorme após 15 min sem tráfego (~30–60s para acordar).
Jobs no cron-job.org (grátis), timezone `America/Sao_Paulo`, timeout 30s:

1. `pdv-pre-warm-0555` — `GET /health`, 1×/dia às 05:50 e 05:55 (acorda antes de abrir; o 1º pode dar timeout e mesmo assim acorda a instância)
2. `pdv-keepalive-06-20` — `GET /health`, `*/10 6-20 * * *` (só 06–20h; fora disso a Render dorme sozinha ~20:15 e economiza ~300h/mês do teto 750h)

Pronto — quente no comercial, dormindo de madrugada. Zero custo.
> `/health` aceita GET e HEAD. UptimeRobot 24/7 foi pausado (substituído pela janela acima).

### 9. Sentry (alerta de erros, opcional mas recomendado)

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
- **Render sleep**: primeira chamada lenta ~30–60s; mitigação grátis = cron-job.org pingando `/health` 06–20h BRT (§8), ou abrir o PDV antes de abrir a loja.
- **Quotas Firestore Spark**: 50k leituras/20k escritas/dia — telas leem via snapshot filtrado por tela (sem polling); pagos/fechados só em sessão e relatórios; monitorar no Console.
- PowerShell 5.1: `$env:VAR='x'; npm run build` funciona; não usar `set VAR=x`.

## Baseline de regressão pós-deploy

> ⚠️ **Regra permanente (2026-08-24): validar em localhost ANTES de qualquer deploy/push.**
> Backend local + suíte E2E com `-Base http://127.0.0.1:8000` → só depois commit/deploy.

```powershell
cd backend && .venv\Scripts\python -m pytest tests -q          # 35 passed
cd scripts\e2e && node get-token.js                            # token vale 1h

# Opcional (seção 13 onboarding): token do DONO da plataforma
# node get-token.js gabriel@pdv.com '<senha>' token-owner.txt   # sem o arquivo, seção 13 é pulada com aviso

powershell -NoProfile -ExecutionPolicy Bypass -File api_test.ps1               # padrão: produção
powershell -NoProfile -ExecutionPolicy Bypass -File api_test.ps1 -Base http://127.0.0.1:8000  # local
cd frontend && npx tsc --noEmit                                 # exit 0
```

Contagem atual: **80 passos** na base + **13 passos** de onboarding (condicionais ao `token-owner.txt`) = 93 no máximo.
Último baseline completo validado em produção: 2026-08-24 (51/51 antes da seção onboarding); fix do caixa `abertoEm` revalidado em produção em 2026-08-25.

CI (GitHub Actions) roda pytest + tsc + build em todo push/PR.
