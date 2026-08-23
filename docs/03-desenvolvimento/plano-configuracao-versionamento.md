# Plano de Configuração e Versionamento — PDV Lanchonete v2

Define como o código, o ambiente, os segredos e os dados são configurados, versionados e controlados.

---

## 1. Repositório e estrutura versionada

```
pdv-restaurante/python/
├── backend/            # API FastAPI (+ .venv ignorado)
├── frontend/           # SPA React (+ node_modules, dist ignorados)
├── scripts/            # TS Admin (service-account.json IGNORADO)
├── docs/               # esta biblioteca de documentação
├── firestore.rules     # regras de segurança (versionadas)
├── firebase.json
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
```
Defaults equivalentes existem em código (`core/config.py`), incluindo `timezone=America/Sao_Paulo`.

## 3. Estratégia de branches

Equipe pequena → **trunk-based simplificado**:

- `main` — sempre funcional (backend sobe, build do frontend passa, testes verdes).
- Branches de trabalho `feat/<tema>`, `fix/<bug>` curtas (dias), merge em `main` após validação.
- Tags de release: `v2.x.y` nos marcos (MVP, correções B/M, quick wins...).

Regras:
- Nenhum commit direto em `main` para mudanças de fluxo core (pedidos/caixa/pagamentos).
- Cada PR descreve: o quê, por quê, como validar (comando executado).

## 4. Versionamento de componentes

| Artefato | Esquema | Onde está |
|---|---|---|
| Projeto/API | SemVer `2.0.0` | `app/main.py` (FastAPI version), `frontend/package.json` |
| Dependências Python | ranges pinados no `requirements.txt` (`fastapi>=0.115,<1` etc.) + lock implícito pela .venv |
| Dependências JS | caret no `package.json` + `package-lock.json` commitado |
| Schema Firestore | evolutivo aditivo; mudanças documentadas em `esquema-logico-banco-dados.md` §6 |

## 5. Configuração por ambiente

| Ambiente | Backend | Frontend | Banco |
|---|---|---|---|
| Desenvolvimento (atual) | uvicorn :8000 com `.env` local + service account local | Vite dev :5173 com proxy `/api` | Firebase projeto pdv-lanchonete-1fa79 (dados demo via scripts) |
| Staging/homologação (futuro) | PaaS (ex.: Render) com env vars + segredo injetado | Build estático publicado (ex.: Firebase Hosting branch channel) | mesmo projeto, tenant de teste (`rest_*` dedicado) |
| Produção (planejado) | idem staging + TLS + workers | Hosting produção + rewrites `/api` | mesmo projeto; backup/export programado |

⚠️ Enquanto houver um único projeto Firebase compartilhado, staging usa tenants separados — nunca dados reais.

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
3. Suíte E2E de API (34 casos) quando o toque afetar fluxo pedido→pagamento→caixa.
4. Revisão das `firestore.rules` se autenticação/acesso direto mudou.

CI automatizado ainda não existe (sem GitHub Actions no repo); os passos acima rodam manualmente — plano M5 inclui pipeline.

## 8. Backup e recuperação

- Código: histórico git (remoto recomendado — hoje não há remote configurado).
- Firestore: export programado (recomendado ativar antes do go-live); scripts de init/seed permitem reconstruir ambiente demo.
- Segredos: rotação da service account via Console GCP se exposta; revogação imediata da anterior.

## 9. Configuração operacional pós-deploy

- Reinício do backend após alterar código Python (sem --reload): parar PID (`backend/server.pid`) e subir novamente.
- Logs locais redirecionados para `uv-test.out.log`/`srv.err.log` (ruído do access logger no Windows é conhecido e inofensivo).
