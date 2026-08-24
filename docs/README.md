# PDV Lanchonete v2 — Documentação do Projeto

Sistema de Ponto de Venda (PDV) para lanchonete: caixa, salão (mesas), cozinha (KDS), estoque com receitas, delivery, financeiro (fornecedores/despesas/DRE), relatórios, cardápio digital por QR Code e impressão térmica.

**Stack:** React 18 + TypeScript + Tailwind 4 + Vite (SPA/PWA) · FastAPI (Python) · Firebase Auth · Google Firestore.

| Pasta | Fase | Documentos |
|---|---|---|
| `01-planejamento/` | Planejamento e Análise | Termo de Abertura · Requisitos · Casos de Uso · Regras de Negócio · Levantamento de Requisitos · Matriz de Rastreabilidade |
| `02-modelagem/` | Modelagem e Design | Casos de Uso · Classes · Sequência · Atividades · Estados · Componentes · Implantação · MER · Esquema Lógico · Protótipos de Interface |
| `03-desenvolvimento/` | Desenvolvimento e Implementação | Arquitetura · Design Técnico · Estilo de Código · Integração de Sistemas · Configuração e Versionamento |
| `04-testes/` | Testes e Qualidade | Plano de Testes · Casos de Teste · Roteiros de Teste · Relatórios de Teste · Homologação |
| `05-implantacao/` | Implantação e Manutenção | Plano de Implantação · Manual do Usuário · Manual Técnico · Treinamento · Manutenção e Suporte |

## Visão rápida do sistema

- **Frontend** (`frontend/`) — SPA na porta **5173**, proxy `/api` → 8000. PWA instalável com cache offline de leitura.
- **Backend** (`backend/`) — API FastAPI na porta **8000**. Autenticação por ID token do Firebase; autorização por papéis (`admin`, `gerente`, `caixa`, `garcom`, `cozinha`).
- **Banco** — Firestore multi-tenant: `restaurantes/{restaurantId}/data/{colecao}/items/{id}` + doc único `data/configuracoes`.
- **Scripts** (`scripts/`) — TS Admin SDK para init/seed/limpeza do banco de demonstração.
- **Regras de segurança** — `firestore.rules` na raiz (isolamento por tenant para acesso direto do cliente).

## Produção (no ar desde 2026-08-23)

| Componente | Endereço |
|---|---|
| App (PWA) | https://pdv-lanchonete-1fa79.web.app |
| API | https://pdv-lanchonete-dwiw.onrender.com |
| Repositório | https://github.com/gabrielabrahaodev/pdv-lanchonete (privado) |

Push em `master` → CI (pytest/tsc/build) + auto-deploy da API na Render. Frontend exige rebuild com `VITE_API_URL` + `firebase deploy --only hosting`. Backup diário automático do Firestore commitado em `backups/` (GitHub Actions). Detalhes: `DEPLOY.md` na raiz e `05-implantacao/manual-tecnico.md`.

## Como rodar (desenvolvimento)

```powershell
# Backend
cd backend
.venv\Scripts\python -m uvicorn app.main:app --port 8000

# Frontend
cd frontend
npm run dev

# Login de teste
admin@restaurante.com / SenhaForte123!
```

> Diagrama de arquitetura geral em imagem: `docs/arquitetura-atual.png` (e `.svg`).
