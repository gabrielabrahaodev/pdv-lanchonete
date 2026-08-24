# Plano de Implantação — PDV Lanchonete v2

## 1. Estratégia

Implantação em **duas ondas**:

1. **Piloto local controlado** (operacional desde 2026-08-22): backend + frontend na estação da loja, Firebase em nuvem, dados reais do estabelecimento.
2. **Produção em nuvem** (✅ **EXECUTADA em 2026-08-23**): SPA no Firebase Hosting + API na Render free tier. URLs reais e detalhes de release no `DEPLOY.md` da raiz.

## 2. Pré-requisitos de implantação

### 2.1 Infraestrutura
- [ ] Conta Google com projeto `pdv-lanchonete-1fa79` ativo.
- [ ] Chave de service account disponível no servidor de aplicação (nunca no repo).
- [ ] **Publicar `firestore.rules`**: `firebase deploy --only firestore:rules` — habilita tempo real e protege acesso direto.
- [ ] HTTPS no host que servir o frontend (obrigatório p/ PWA e Web Bluetooth).
- [ ] Rede estável; recomenda-se fallback 4G do roteador.

### 2.2 Dados iniciais
- [ ] Executar `npm run init` (estrutura + admin) e `npm run seed` (usuários, insumos, caixa) OU realizar onboarding real pelo app (recomendado em produção: cria tenant próprio).
- [ ] Cadastrar categorias, produtos com receitas, mesas e usuários por papel.
- [ ] Trocar senha padrão do admin (`SenhaForte123!`).

### 2.3 Dispositivos
- [ ] Tablet/PC do caixa: Chrome/Edge atualizado; atalho para o app; instalar como PWA.
- [ ] Tablet/celular da cozinha: KDS fixo aberto (tema escuro).
- [ ] Impressora térmica Bluetooth pareada no dispositivo do balcão (teste via Configurações).

## 3. Passo a passo — Onda 1 (piloto local)

```powershell
# 1. Backend
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt     # inclui tzdata
copy .env.example .env                             # conferir PROJECT_ID/CORS
.venv\Scripts\python -m uvicorn app.main:app --port 8000

# 2. Frontend (produção local)
cd ..\frontend
npm install
npm run build
npm run preview      # serve dist com proxy /api → :8000

# 3. Regras
cd ..
firebase deploy --only firestore:rules
```

Validação de aceite: Roteiro R-01 completo + `/health` respondendo + login real.

## 4. Passo a passo — Onda 2 (nuvem) — ✅ EXECUTADA 2026-08-23

| Etapa | Ação | Resultado |
|---|---|---|
| 4.1 | Frontend no Firebase Hosting **SEM rewrite** (exigiria Blaze): `VITE_API_URL` embutido no build → `firebase deploy --only hosting` | ✅ https://pdv-lanchonete-1fa79.web.app |
| 4.2 | API na Render (free tier): `uvicorn app.main:app --host 0.0.0.0 --port $PORT`; envs `FIREBASE_SERVICE_ACCOUNT_JSON`, `CORS_ORIGINS=https://pdv-lanchonete-1fa79.web.app` | ✅ https://pdv-lanchonete-dwiw.onrender.com |
| 4.3 | Smoke + suíte E2E completa contra produção | ✅ 35/35 PASS |
| 4.4 | Backup programado do Firestore | ✅ GitHub Actions diário 03:30 (Brasília) commitando em `backups/` |
| 4.5 | QRs das mesas apontando para a URL pública definitiva | ⏳ homologação física na loja (celular real) |
| extra | UptimeRobot HEAD `/health` a cada 10 min (mitiga sleep do free tier) · Sentry opcional via env `SENTRY_DSN` | ✅ / ⏳ |

Rollback: redeploy da versão anterior no Hosting/PaaS (builds versionados por tag git `v2.x.y`).

## 5. Plano de comunicação/treinamento no go-live

| Momento | Atividade |
|---|---|
| D-7 | Treinamento caixa/garçom (documento-treinamento.md, módulos 1–3) |
| D-5 | Treinamento cozinha + teste de impressora no local |
| D-2 | Carga de cadastros final (produtos/receitas/preços) revisada pelo dono |
| D-0 | Operação assistida no primeiro turno (dev/QA presente) |
| D+7 | Revisão de fechamentos da semana + dúvidas |

## 6. Critérios de encerramento da implantação

- 7 dias consecutivos de operação sem defeito S1;
- Fechamentos de caixa com diferença explicável;
- Backup Firestore agendado e testado (restore em projeto separado);
- Documentação entregue (manual usuário/técnico) e equipe treinada.

## 7. Riscos de implantação e mitigação

| Risco | Mitigação |
|---|---|
| Internet cai durante serviço | PWA cacheia leituras; plano de contingência: comanda em papel + lançamento posterior |
| Quota Spark estourada | monitorar uso; upgrade Blaze com orçamento/alarme |
| Impressora incompatível | homologar modelo antes; usar fallback print |
| Senha padrão esquecida | admin pode resetar senhas pela tela Usuários (PATCH senha) |
