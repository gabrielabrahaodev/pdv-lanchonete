---
title: Desenvolvimento Local
tags: [operacao, desenvolvimento]
---

# Desenvolvimento Local

## Pré-requisitos

- Python 3.12; backend usa `requirements.txt` e `requirements-dev.txt`.
- Node.js 20 para CI, npm para frontend.
- Projeto Firebase e credenciais adequadas para o ambiente de desenvolvimento.
- `tzdata` instalado (usado por `zoneinfo`, importante no Windows).

## Backend — PowerShell

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
# configure valores locais de ambiente sem colocar segredos no Git
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

Documentação da API local: `http://localhost:8000/docs`.

Sem `--reload` é a recomendação atual do README para reiniciar conscientemente depois de mudar Python. A credencial Firebase é resolvida por `FIREBASE_SERVICE_ACCOUNT_JSON`, arquivo local `service-account.json` ou ADC, nessa ordem indicada pelo `core/firebase.py`. Não incluir credenciais reais no vault nem em commits.

## Frontend

```powershell
cd frontend
npm ci
npm run dev
```

Vite sobe em `http://localhost:5173` e usa proxy `/api` para o backend, conforme configuração local. Para validar o bundle:

```powershell
npx tsc --noEmit
npm run build
npm run preview
```

Dev server não é validação suficiente da PWA; usar build + preview para testar service worker.

## Testes backend

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests -q
```

## E2E API

A suíte PowerShell `scripts/e2e/api_test.ps1` por padrão está documentada contra produção; preferir explicitamente uma API local ao validar local e verificar parâmetros do script antes de executar.

## Segurança e dados

- Use tenant/usuário de teste.
- Não execute scripts de limpeza geral no projeto de produção.
- Seeds devem ser identificáveis e reversíveis.
- Ao testar movimentos de estoque, confirme saldo inicial/unidades antes de gerar quantidades.
