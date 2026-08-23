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

## Como rodar

### Backend

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env    # ajuste se necessário
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

> O backend usa o `service-account.json` (padrão: `../scripts/service-account.json`). Documentação interativa: http://localhost:8000/docs

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

Login · Seleção de Restaurante · Caixa (mesas/pedidos/pagamentos) · Produtos & Categorias · Mesas · Estoque/Inventário · KDS Cozinha · Delivery · Relatórios & Fechamento de Caixa · Configurações

## Papéis (custom claims)

`admin` · `gerente` · `caixa` · `garcom` · `cozinha` — enforcement no backend via guards FastAPI.
