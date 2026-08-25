# Plano de Configuração e Versionamento — PDV Lanchonete v2

Define como o código, o ambiente, os segredos e os dados são configurados, versionados e controlados.

---

## 1. Repositório e estrutura versionada

```
pdv-restaurante/python/
├── backend/            # API FastAPI (+ .venv ignorado)
├── frontend/           # SPA React (+ node_modules, dist ignorados)
├── scripts/            # TS Admin (service-account.json IGNORADO) + e2e/ (suíte de API)
├── docs/               # esta biblioteca de documentação
├── backups/            # JSON diário do Firestore (commitado pelo backup.yml)
├── .github/workflows/  # ci.yml (pytest+tsc+build) e backup.yml (backup diário)
├── firestore.rules     # regras de segurança (versionadas)
├── firebase.json
├── render.yaml         # blueprint da Render
├── AGENTS.md           # instruções vivas para agentes/devs
└── README.md
```

## 2. Arquivos ignorados (.gitignore) — nunca versionar

| Padrão | Motivo |
|---|---|
| `service-account.json`, `serviceAccountKey.json` | segredo de Admin SDK |
| `.env`, `.env*` (exceto `.env.example`) | configuração sensível por máquina |
| `.venv/`, `node_modules/`, `dist/`, `__pycache__/` | artefatos gerados |
| `*.out.log`, `*.err.log`, `server.pid`, `.pytest_cache/` | runtime local |

**Template de variáveis**: `backend/.env.example`
```
PROJECT_ID=pdv-lanchonete-1fa79
# SERVICE_ACCOUNT_PATH=../scripts/service-account.json
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
# TIMEZONE=America/Sao_Paulo
# SENTRY_DSN=
# Em nuvem (Render): FIREBASE_SERVICE_ACCOUNT_JSON=<JSON completo>
```
Defaults equivalentes existem em código (`core/config.py`), incluindo `timezone=America/Sao_Paulo`. pydantic-settings vincula a env pelo nome EXATO do campo (sem prefixo).

## 3. Estratégia de branches

Equipe pequena → **trunk-based simplificado**:

- `master` — sempre funcional e **branch de deploy**: push dispara CI + auto-deploy da Render.
- Branches de trabalho `feat/<tema>`, `fix/<bug>` curtas (dias), merge/rebase em `master` após validação local (regra permanente: localhost antes de qualquer deploy).
- Tags de release: `v2.x.y` nos marcos (MVP, correções B/M, quick wins...).

Regras:
- Nenhum commit direto em `master` para mudanças de fluxo core sem validação E2E local antes.
- Cada PR descreve: o quê, por quê, como validar (comando executado).

## 4. Versionamento de componentes

| Artefato | Esquema | Onde está |
|---|---|---|
| Projeto/API | SemVer `2.0.0` | `app/main.py` (FastAPI version), `frontend/package.json` |
| Dependências Python | **pin exato para o stack GCP/Firebase** (`firebase-admin==7.5.0`, `google-cloud-firestore==2.28.1`, `google-api-core==2.34.0`, `google-auth==2.56.3`, `grpcio==1.83.0`); faixas só para fastapi/pydantic/sentry-sdk/tzdata — drift derrubou a produção (bug 12) |
| Dependências JS | caret no `package.json` + `package-lock.json` commitado |
| Schema Firestore | evolutivo aditivo; mudanças documentadas em `esquema-logico-banco-dados.md` §6 |

## 5. Configuração por ambiente

| Ambiente | Backend | Frontend | Banco |
|---|---|---|---|
| Desenvolvimento (atual) | uvicorn :8000 com `.env` local + service account local (sem --reload; reiniciar processo após mudanças) | Vite dev :5173 com proxy `/api` (SW não registrado) | Firebase projeto pdv-lanchonete-1fa79 (dados demo via scripts) |
| Produção (**ativa desde 2026-08-23**) | Render free (`pdv-lanchonete-dwiw.onrender.com`) com env vars + segredo injetado; dorme ~15 min | Firebase Hosting (`pdv-lanchonete-1fa79.web.app`) com `VITE_API_URL` embutido no build; sem rewrite `/api` (decisão Spark) | mesmo projeto; backup diário automático (`backups/`) |
| Staging/homologação (futuro, se necessário) | PaaS com tenant de teste dedicado | Hosting branch channel | mesmo projeto, tenants separados |

⚠️ Enquanto houver um único projeto Firebase compartilhado, qualquer homologação usa tenants separados — nunca dados reais.

## 6. Provisionamento e seeds

```powershell
# backend
cd backend && python -m venv .venv
.venv\Scripts\pip install -r requirements.txt   # inclui tzdata (obrigatório)
copy .env.example .env                           # ajustar se preciso

# dados iniciais
cd ..\scripts && npm install
npm run init      # estrutura + admin (UID fixo) + claims
npm run seed      # usuários por papel, movimentações, caixa aberta, configs extras
# npm run clean / delete-all-collections.ts para resetar (destrutivo)
```

## 7. Pipeline de qualidade (gate de merge)

1. `pytest tests -q` (backend) — obrigatório verde.
2. `tsc && vite build` (frontend) — sem erros de tipo/build.
3. Suíte E2E de API (52 passos base + 13 onboarding condicionais) quando o toque afetar fluxo pedido→pagamento→caixa.
4. Revisão das `firestore.rules` se autenticação/acesso direto mudou.

**CI ativo**: GitHub Actions `.github/workflows/ci.yml` roda pytest + tsc + build em todo push/PR.

## 8. Backup e recuperação

- Código: histórico git — remote `github.com/gabrielabrahaodev/pdv-lanchonete` (privado).
- Firestore: **backup diário automático** (GitHub Actions `backup.yml`, 03:30 BRT, commita JSON completo por tenant em `backups/`; execução manual local: `cd scripts && npm run backup`). Restauração com scripts Admin (`set`) a partir do JSON.
- Segredos: rotação da service account via Console GCP se exposta; revogação imediata da anterior.

## 9. Configuração operacional pós-deploy

- Reinício do backend após alterar código Python (sem --reload): parar PID (`backend/server.pid`) e subir novamente.
- Logs locais redirecionados para `uv-test.out.log`/`srv.err.log` (ruído do access logger no Windows é conhecido e inofensivo).
