# PLANO DE DEPLOY EM PRODUÇÃO — HANDOFF PARA PRÓXIMA SESSÃO

> Substitui o plano de correções anterior (todas as correções validadas — ver AGENTS.md).
> Objetivo: colocar o sistema no ar com **R$ 0/mês e sem cartão de crédito**, retomando exatamente daqui.

> ✅ **EXECUTADO EM 2026-08-23.** Sistema no ar: frontend em `https://pdv-lanchonete-1fa79.web.app`, API em `https://pdv-lanchonete-dwiw.onrender.com` (Render), repo `github.com/gabrielabrahaodev/pdv-lanchonete`. Estado atual detalhado no `AGENTS.md`; guia para redeploys no `DEPLOY.md`.

## ⚡ ESTADO ATUAL

Sistema completo e validado localmente:

- PDV full: mesa/balcão/delivery, KDS tempo real c/ impressão, caixa, pagamentos
- Cardápio digital QR (`/m/{restaurantId}/{mesaId}`), baixa automática de estoque (toggle), financeiro (fornecedores/despesas/DRE), tema por usuário, onboarding self-service, PWA
- Baseline de testes: **pytest 23/23** · **suíte E2E 34/34** · `tsc` limpo · build PWA ok
- Backend rodando local (PID em `backend/server.pid`); frontend Vite na 5173

**Nada está em produção.** Sem HTTPS não funcionam: PWA, Web Bluetooth (impressora) e o QR real do cardápio.

## DECISÕES JÁ TOMADAS (não re-discutir)

1. **Opção A escolhida**: 100% grátis sem cartão.
   - Backend → **Render.com free tier**
   - Frontend → **Firebase Hosting (plano Spark)**
   - Banco/Auth → Firestore/Firebase Auth (Spark, quotas grátis suficientes)
2. **Cloud Run DESCARTADO**: exige billing/cartão ativo mesmo no free tier (política GCP).
3. **Sem rewrite `/api/*`** (era recurso do plano Blaze): frontend chama a API por URL direta via `VITE_API_URL` + CORS liberado.
4. **Tradeoff aceito**: Render free **dorme após 15 min** sem tráfego (~30–60s para acordar). Mitigações grátis documentadas: abrir o PDV antes de abrir a loja, ou ping agendado (UptimeRobot free a cada 10 min).

## ARQUIVOS A CRIAR/MODIFICAR (o trabalho desta sessão)

### 1. `backend/app/core/firebase.py` + `config.py` — credenciais em 3 níveis
Ordem de resolução em `get_firebase_app()`:
1. `FIREBASE_SERVICE_ACCOUNT_JSON` (env, JSON completo em string) → `credentials.Certificate(json.loads(...))`
2. Arquivo `scripts/service-account.json` existir (dev atual) → comportamento igual ao de hoje
3. Senão → `firebase_admin.initialize_app()` puro (**ADC**, para futuras nuvens GCP)

Em `config.py`: adicionar `service_account_json: str | None = None` (lê da env automaticamente).
⚠️ projectId: nos níveis 1 e 2 passar `{"projectId": settings.project_id}` como hoje; no ADC o projeto vem do ambiente.

### 2. `frontend/src/lib/api.ts` — base configurável
```ts
const BASE = import.meta.env.VITE_API_URL ?? ''
fetch(`${BASE}/api${path}`, ...)
```
Sem env setada (dev), comportamento idêntico ao atual (proxy do Vite cuida do resto).

### 3. `firebase.json` + `.firebaserc`
- Manter bloco `firestore.rules`; **remover qualquer ideia de rewrite**; adicionar:
```json
"hosting": {
  "public": "frontend/dist",
  "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
  "headers": [
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/registerSW.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
  ]
}
```
- `.firebaserc`: `{ "projects": { "default": "pdv-lanchonete-1fa79" } }`

### 4. `render.yaml` (blueprint opcional na raiz)
```yaml
services:
  - type: web
    name: pdv-api
    runtime: python
    rootDir: backend
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: CORS_ORIGINS
        sync: false   # preencher com https://<projeto>.web.app
      - key: FIREBASE_SERVICE_ACCOUNT_JSON
        sync: false   # colar conteúdo integral do scripts/service-account.json
```

### 5. `DEPLOY.md` na raiz — guia passo a passo (conteúdo abaixo)

## PASSO A PASSO QUE O GUIA DEVE CONTER (executar COM o usuário)

1. **Versionar o código**: o projeto NÃO é repo git ainda.
   - `git init` + commit inicial
   - `.gitignore` OBRIGATÓRIO antes do push: `.venv/`, `node_modules/`, `dist/`, `__pycache__/`, `*.log`, `server.pid`, **`scripts/service-account.json` (SEGREDO — nunca versionar)**, `.env`
   - Criar repo no GitHub e push
2. **Render**: conta grátis (login c/ GitHub) → New Web Service → selecionar repo → conferir rootDir/build/start do blueprint → preencher as 2 env vars (`CORS_ORIGINS=https://<projeto>.web.app`, `FIREBASE_SERVICE_ACCOUNT_JSON=<conteúdo do json>`) → Deploy → anotar URL (ex.: `https://pdv-api-xxxx.onrender.com`)
3. **Smoke do backend**: `Invoke-RestMethod https://<url-render>/health` → `{"status":"ok",...}`
4. **Frontend build com a URL da API**:
   ```powershell
   cd frontend
   $env:VITE_API_URL = 'https://<url-render>'   # bake-time, precisa vir ANTES do build
   npm run build
   Remove-Item Env:VITE_API_URL                  # limpar p/ não vazar em builds locais
   ```
5. **Firebase CLI**: `npm i -g firebase-tools` → `firebase login` → `firebase deploy --only hosting,firestore:rules` ← **publica também as regras pendentes** (desbloqueia o tempo real onSnapshot)
6. **Authorized Domains**: Console Firebase → Authentication → Settings → Authorized domains → adicionar `<projeto>.web.app` (sem isso o login falha com `auth/unauthorized-domain`)
7. **Checklist final de produção**:
   - [ ] Login pelo domínio `https://<projeto>.web.app`
   - [ ] Badge/tempo real ativos (console sem warning `[realtime] ... permission-denied`)
   - [ ] QR de uma mesa escaneado do CELULAR real → pedido cai no KDS
   - [ ] 🖨 Testar impressora em Configurações (Web Bluetooth só funciona com HTTPS — agora deve abrir o seletor)
   - [ ] PWA instalável (ícone no Chrome Android)
   - [ ] Pagamento pix quita pedido e DRE reflete

## ARMADILHAS PREVISÍVEIS

- **Segredo**: `service-account.json` NUNCA vai pro GitHub — por isso existe a env `FIREBASE_SERVICE_ACCOUNT_JSON` na Render
- **CORS**: valor exato `https://<projeto>.web.app` (com https, sem barra final); erro típico = "CORS policy" no console do navegador
- **Vite**: `VITE_*` é embutido NO BUILD, não é runtime — rebuild sempre que mudar
- **sw.js sem no-cache**: PWA para de receber atualizações (por isso os headers no firebase.json)
- **Render sleep**: primeira chamada lenta ~30–60s; UptimeRobot free pingando `/health` a cada 10 min resolve
- **Quotas Firestore Spark**: 50k leituras/20k escritas por dia — listeners onSnapshot contam leituras; monitorar uso no Console se o movimento for alto
- PowerShell 5.1: `$env:VAR='x'; npm run build` funciona; não usar `set VAR=x`

## BASELINE PARA REGRESSÃO PÓS-DEPLOY

- `cd backend && .venv\Scripts\python -m pytest tests -q` → 23 passed
- `powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\Temp\opencode\e2e-repro\api_test.ps1"` → 34/34 (token expira em 1h: `node get-token.js` antes)
- `cd frontend && npx tsc --noEmit` → exit 0

Detalhes de todas as funcionalidades entregues estão no `AGENTS.md` (sessões 2026-08-22, partes 1–3).
