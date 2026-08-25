# PDV Lanchonete — v2 (React + FastAPI + Firebase)

Reimplementação do PDV com **TypeScript + Tailwind** no frontend, **Python (FastAPI)** no backend e **Firebase** como banco (mesmo projeto `pdv-lanchonete-1fa79`, mesmos modelos e estrutura Firestore da versão Flutter).

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | Vite + React 18 + TypeScript + Tailwind CSS 4 |
| Dados/Estado | TanStack Query (polling conservador p/ plano Spark) |
| Backend | FastAPI + firebase-admin (acesso exclusivo ao Firestore) |
| Auth | Firebase Auth (client) + verificação de ID token no backend |
| Banco | Firestore — `restaurantes/{restaurantId}/data/{colecao}/items/{id}` |

## Estrutura

```
python/
├── backend/        # API FastAPI (porta 8000)
│   ├── app/
│   │   ├── core/       # config, firebase-admin, segurança (JWT verify + papéis)
│   │   ├── models/     # Pydantic (espelho dos modelos do app Flutter)
│   │   ├── routers/    # endpoints REST por feature
│   │   └── services/   # regras de negócio / acesso Firestore
│   ├── requirements.txt
│   └── .env.example
├── frontend/       # SPA React (porta 5173, proxy /api → 8000)
└── scripts/        # scripts TS Admin (init, seed, delete) — herdados do projeto Flutter
```

## Produção

| Componente | URL |
|------------|-----|
| Frontend (PWA) | https://pdv-lanchonete-1fa79.web.app |
| API (Render free) | https://pdv-lanchonete-dwiw.onrender.com |
| Repo | https://github.com/gabrielabrahaodev/pdv-lanchonete (privado) |

- **API**: push em `master` dispara auto-deploy na Render. Credenciais via env `FIREBASE_SERVICE_ACCOUNT_JSON` + `CORS_ORIGINS`.
- **Frontend**: rebuild obrigatório com a URL da API embutida (`VITE_API_URL`) → `firebase deploy --only hosting`. Passo a passo completo no `DEPLOY.md`.
- A instância da Render dorme após ~15 min sem tráfego (cold start ~30–60s); UptimeRobot mantém `/health` pingado.

## Como rodar

### Backend

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env    # ajuste se necessário
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

> **Sem `--reload`**: após alterar código Python, reinicie o processo. A credencial Firebase é resolvida nesta ordem (`app/core/firebase.py`): env `FIREBASE_SERVICE_ACCOUNT_JSON` → arquivo local `service-account.json` → ADC. Documentação interativa: http://localhost:8000/docs

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Acesse http://localhost:5173 e faça login com `admin@restaurante.com` / `SenhaForte123!`.

### Scripts Firebase (Admin)

```bash
cd scripts
npm install          # apenas na primeira vez
npm run init         # setup completo (restaurante, categorias, produtos, estoque, mesas, admin)
npm run seed         # dados complementares
npx ts-node delete-all-collections.ts   # limpar tudo
```

## Módulos

Login · Seleção de Restaurante / Onboarding por convite · Caixa (mesas/pedidos/pagamentos) · Produtos & Categorias (com foto) · Mesas (QR code por mesa) · Estoque/Inventário (receitas + baixa automática) · KDS Cozinha (cartão por mesa, bulk) · Delivery · Financeiro (fornecedores/despesas/DRE) · Relatórios & Fechamento de Caixa · Cardápio digital por QR Code · Impressão térmica ESC/POS · Configurações · Plataforma (convites — donos)

## Papéis (custom claims)

`admin` · `gerente` · `caixa` · `garcom` · `cozinha` — enforcement no backend via guards FastAPI. Donos da plataforma (`sistema/global.donoUids`) são separados e não têm tenant.

## Testes & CI

```powershell
# Unitários (lógica pura)
cd backend && .venv\Scripts\python -m pytest tests -q

# Suíte E2E da API (padrão: produção; -Base http://127.0.0.1:8000 para local)
cd scripts\e2e && powershell -NoProfile -ExecutionPolicy Bypass -File api_test.ps1
```

- CI: `.github/workflows/ci.yml` — pytest + tsc + build em todo push/PR.
- Backup diário do Firestore: `.github/workflows/backup.yml` commita em `backups/`.
- Regra de fluxo: **validar em localhost antes de qualquer deploy**.
- O dev server do frontend NÃO registra service worker — testar PWA com `npm run build && npm run preview`.
