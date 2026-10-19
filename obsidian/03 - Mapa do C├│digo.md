---
title: Mapa do Código
aliases: [Code Map]
tags: [desenvolvimento, codigo]
---

# Mapa do Código

## Backend

| Arquivo/área | Responsabilidade |
|---|---|
| `backend/app/main.py` | Montagem FastAPI, CORS, middleware de erro, `/health` e `/ready`. |
| `backend/app/core/security.py` | Verificação de ID token e guards de tenant/papel. |
| `backend/app/core/firebase.py` | Inicialização Firebase Admin e cliente Firestore. |
| `backend/app/core/config.py` | Configuração de ambiente, CORS e fuso. |
| `backend/app/models/models.py` | Modelos Pydantic e validação de payload. |
| `backend/app/routers/*.py` | Contratos HTTP e dependências de autorização. |
| `backend/app/services/base.py` | Helpers de path, listagens, janela temporal, paginação, IDs e timestamps. |
| `services/pedidos_service.py` | Pedido, item, preço server-side, cancelamento, consumo de receita. |
| `services/caixa_service.py` | Sessão, suprimento/sangria, pagamento e quitação. |
| `services/estoque_service.py` | CRUD do estoque e movimentos transacionais. |
| `services/agregados_service.py` | Incrementos diários/mensais e idempotência de eventos agregados. |
| `services/backfill_service.py` | Reconstrução de agregados a partir de histórico, dry-run por padrão. |
| `services/calculos.py` | Decimais, total do pedido, consumo da receita e resumo financeiro. |
| `services/despesas_service.py` | CRUD e eventos de agregação de despesas. |
| `services/relatorios_service.py` | Escolha entre agregados e histórico; consolidação dos relatórios. |
| `services/delivery_service.py` | Criar delivery e transições de estado. |
| `services/restaurantes_service.py` / `convites_service.py` | Onboarding e convite. |
| `services/usuarios_service.py` | Usuários, papéis e preferências. |

## Frontend

| Arquivo/área | Responsabilidade |
|---|---|
| `frontend/src/App.tsx` | Rotas e divisão de páginas. |
| `context/AuthContext.tsx` | Estado de autenticação e contexto atual. |
| `context/ThemeContext.tsx` | Preferência de tema por usuário. |
| `components/layout/AppLayout.tsx` | Menu, layout e `PageHeader`. |
| `components/ui/index.tsx` | Botão, inputs, cards, badges, modais, loading/erro. |
| `hooks/useFirestore.ts` | Listeners em tempo real. |
| `lib/api.ts` | Cliente REST e headers de autenticação. |
| `pages/caixa/*` | Tela inicial do caixa, novo pedido, mesa e pagamento. |
| `pages/mesas/MesasPage.tsx` | Mesas e QR por mesa. |
| `pages/cozinha/CozinhaPage.tsx` | KDS. |
| `pages/estoque/EstoquePage.tsx` | Inventário e movimentações. |
| `pages/produtos/*` | Produtos, formulário, categorias. |
| `pages/financeiro/FinanceiroPage.tsx` | Fornecedores, despesas e resultado do mês. |
| `pages/relatorios/*` | Relatórios e fechamento do caixa. |
| `pages/delivery/DeliveryPage.tsx` | Pedidos e status de delivery. |
| `pages/cardapio/CardapioPage.tsx` | Cardápio público. |
| `pages/configuracoes/ConfiguracoesPage.tsx` | Preferências, dados do restaurante, papéis e parâmetros. |
| `pages/plataforma/PlataformaPage.tsx` | Convites para novos tenants. |

## Testes

- Backend: `backend/tests/*.py` e `backend/tests/fs_stub.py`.
- Regras Firestore: `frontend/tests/firestore_rules.test.mjs` executado pelo emulador no workflow CI.
- E2E da API: `scripts/e2e/api_test.ps1`.
- E2E cliente: `scripts/e2e/e2e_test.js`.
- Seeds e manutenção: `scripts/init-firestore.ts`, `scripts/seed-data.ts`, `scripts/reconstruir_agregados.py`.

## Regra de manutenção

A regra deve ficar no backend (`services/`) e ser validada com teste de regressão; frontend deve tratar estado, mostrar erros e não ser a autoridade do preço, saldo ou permissão. Consulte [[Agentes/Guia para IA e Desenvolvedores]].
