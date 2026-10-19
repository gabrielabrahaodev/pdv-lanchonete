---
title: Deploy
tags: [operacao, deploy, firebase, render]
---

# Deploy

## Topologia documentada

- Frontend: Firebase Hosting `https://pdv-lanchonete-1fa79.web.app`.
- API: Render `https://pdv-lanchonete-dwiw.onrender.com`.
- API `master` historicamente dispara auto-deploy na Render segundo README/DEPLOY; confirmar configuração atual do serviço antes de planejar release.
- Frontend precisa build com `VITE_API_URL` correto e `firebase deploy --only hosting`.

## Variáveis

Configuração sensível/ambiente deve ser verificada em `backend/.env.example`, `backend/app/core/config.py` e `DEPLOY.md`:
- `FIREBASE_SERVICE_ACCOUNT_JSON` ou outra origem local/ADC descrita no core;
- `CORS_ORIGINS`;
- `VITE_API_URL` para API no bundle.

Este vault não armazena valores de segredo. Não copiar service-account JSON, token, senha, arquivo `.env` ou `token.txt` para Obsidian.

## Saúde

- `/health` responde liveness sem consultar Firestore.
- `/ready` testa uma leitura pequena e pode retornar 503 se Firestore não estiver acessível.
- README descreve Render Free dormindo após cerca de 15 min de inatividade e cold start de 30–60 s; validar esse comportamento/preço diretamente no painel porque plano e serviço podem mudar.

## Ordem de release segura

1. Atualizar teste que reproduz bug.
2. Rodar `pytest` completo.
3. Rodar `npx tsc --noEmit` e `npm run build`.
4. Rodar testes de rules no emulador e smoke da API.
5. Revisar `git diff`, confirmar branch e não incluir secrets/seed/dados reais.
6. PR para branch alvo; não fazer merge/deploy antes de validação.
7. Deploy frontend/backend conforme configuração real dos serviços.
8. Smoke: login, mesa/pedido, preparo, pagamento, caixa, estoque, despesas, relatório diário/mensal, mobile.
