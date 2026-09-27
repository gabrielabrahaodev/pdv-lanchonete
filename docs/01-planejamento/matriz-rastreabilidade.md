# Matriz de Rastreabilidade de Requisitos — PDV Lanchonete v2

Rastreia cada requisito até sua origem (caso de uso/regra de negócio), implementação (artefatos de código) e verificação (testes).

Legenda:
- **UC** = Caso de Uso (`especificacao-casos-de-uso.md`) · **RN** = Regra de Negócio (`documento-regras-negocio.md`)
- **Impl.** = arquivos principais no repositório
- **Teste** = `pytest` (backend/tests), `E2E-API` (suíte api_test.ps1 — 80 passos base + 13 onboarding condicionais), `MAN` (teste manual/homologação)

## 1. Requisitos Funcionais

| ID | Requisito (resumo) | Origem | Impl. (frontend / backend) | Teste |
|---|---|---|---|---|
| RF-001 | Login Firebase + Bearer token | UC-01 | `LoginPage.tsx`, `AuthContext.tsx` / `core/security.py` | E2E-API §auth; MAN |
| RF-002 | Validação de token + claims | UC-01, RN-01 | `lib/api.ts` / `security.py:get_current_auth` | E2E-API §auth (401/403) |
| RF-003 | GET /auth/me contexto | UC-01 | `AuthContext.tsx` / `routers/auth.py`, `auth_service.py` | E2E-API §auth |
| RF-004 | Onboarding por convite cria restaurante completo | UC-02, RN-03 | `SelectRestaurantPage.tsx`, `PlataformaPage.tsx` / `restaurantes_service.py`, `convites_service.py` | E2E-API §13 (onboarding); MAN |
| RF-005 | Guard + auto-cura onboarding (claim+marcador+convite) | RN-03 | `restaurantes_service.criar_primeiro` | E2E-API §13; MAN |
| RF-005a | Convites da plataforma (gerar/listar/revogar) | UC-16, RN-25 | `PlataformaPage.tsx` / `routers/sistema.py`, `convites_service` | E2E-API §13; MAN |
| RF-006 | CRUD usuários + papéis restritos | UC-15, RN-02 | `ConfiguracoesPage.tsx` / `usuarios_service.py` | E2E-API; MAN |
| RF-007 | Tema self-service PATCH /usuarios/me | RN-24 | `ThemeContext.tsx`, `ConfiguracoesPage.tsx` / `usuarios_service` | MAN |
| RF-008 | Papéis e guards require_roles | RN-02 | menus por papel / guards nos routers | E2E-API (403) |
| RF-010 | CRUD categorias | UC-09 | `ProdutosPage/ProdutoFormPage` / `categorias_service` | E2E-API §categorias |
| RF-011 | CRUD produtos (variações+receita) | UC-09, RN-10 | `ProdutoFormPage.tsx` / `produtos_service` | E2E-API §produtos |
| RF-011a | Foto do produto (upload comprimido, bytes públicos) | UC-09/13, RN-26 | `ProdutoFormPage.tsx`, `lib/imagem.ts` / `produtos_service`, `routers/publico` | E2E-API §imagem |
| RF-012 | Filtros de produtos | UC-09/UC-13 | `NovoPedidoPage.tsx` / `produtos.listar` | E2E-API |
| RF-020..022 | Mesas: CRUD, estados, limpeza pedidoAtivoId | UC-03/09, RN-04/05 | `MesasPage.tsx` / `mesas_service` (DELETE_FIELD) | E2E-API §mesas |
| RF-023 | QR Code do cardápio por mesa | UC-09/13 | `MesasPage.tsx` (qrcode PNG) | MAN |
| RF-030..032 | Criar pedido/mesa ocupada; itens; total | UC-03/04, RN-04/06/09/10 | `CaixaOverviewPage`, `MesaDetailPage`, `NovoPedidoPage` / `pedidos_service` | E2E-API §pedidos |
| RF-033 | Status do item pendente→entregue (bulk KDS) | UC-05, RN-06/07 | `CozinhaPage.tsx` / `cozinha router BULK` + `pedidos/cozinha routers` | E2E-API fluxo cozinha + baixa agregada |
| RF-034 | Baixa automática de estoque na transação | UC-05, RN-07/08 | `CozinhaPage` / `pedidos_service._baixar_ingredientes` | pytest (agregar_consumo); E2E fluxo |
| RF-035 | Cancelamento com restrições | RN-06 | `MesaDetailPage` / `pedidos_service.cancelar` | E2E-API |
| RF-040/041 | Pagamento minimalista, parcial, tolerância | UC-06, RN-11 | `PagamentoPage.tsx` / `caixa_service.registrar_pagamento` | E2E-API; MAN B1/M4 (201) |
| RF-042 | Crédito no caixa + libera mesa na quitação | UC-07, RN-12 | `PagamentoPage` navegação / `_credit_sessao`, `mesas.liberar` | E2E fluxo completo |
| RF-043 | Sessões de caixa (abrir/supr./sangria/fechar) | UC-08, RN-13 | `FechamentoCaixaPage.tsx` / `caixa_service` | E2E-API §caixa |
| RF-050/051 | KDS fila + status item | UC-05 | `CozinhaPage.tsx` / `cozinha_service`, `routers/cozinha` | E2E-API §cozinha |
| RF-060..062 | Estoque itens/movimentações/alertas | UC-10, RN-14/15 | `EstoquePage.tsx`, badge via `useEstoque` / `estoque_service` | E2E-API §estoque |
| RF-070/071 | Delivery criar + máquina de estados | UC-14, RN-16 | `DeliveryPage.tsx` / `delivery_service.TRANSICOES` | E2E-API §delivery; MAN M4 (uber→422) |
| RF-080..082 | Fornecedores/despesas/pagar-reabrir | UC-11, RN-17/19 | `FinanceiroPage.tsx` / `despesas_service`, `fornecedores_service` | E2E-API §financeiro |
| RF-090 | Relatório resumo vendas | UC-12, RN-22 | `RelatoriosPage.tsx` / `relatorios_service.resumo` | E2E-API §relatórios |
| RF-091 | Bloco financeiro/DRE no resumo | UC-12, RN-18 | `RelatoriosPage` / `calculos.resumo_financeiro` | pytest (DRE ×4); E2E |
| RF-092 | Configurações GET/PUT + flags | UC-15, RN-07/20 | `ConfiguracoesPage.tsx` / `routers/configuracoes` | E2E-API §config |
| RF-100..102 | Cardápio digital público + rate limit | UC-13, RN-20/21 | `CardapioPage.tsx`, `apiPublico.ts` / `routers/publico.py` | MAN (QR + pedido); E2E público |
| RF-110 | SPA áreas completas | todos | `App.tsx`, `AppLayout.tsx`, `pages/*` | MAN homologação |
| RF-111 | Tema escuro por usuário (classe dark) | RN-24 | `ThemeContext.tsx`, `index.css` (@custom-variant) | MAN |
| RF-112 | Realtime onSnapshot como fonte | RNF-007 | `useFirestore.ts` (13 hooks) | MAN (banner sem rules) |
| RF-113 | Impressão ESC/POS BT + fallback | UC-05/06/15 | `impressora.ts`, KDS/Pagamento/Configurações | MAN (comanda/recibo/teste) |
| RF-114 | Exportação CSV pt-BR | UC-10/11/12 | `csv.ts` + botões nas páginas | MAN |
| RF-115 | PWA + cache NetworkFirst /api GET | RNF-011 | `vite.config.ts` (VitePWA), `public/icons` | MAN build+preview |

## 2. Requisitos Não Funcionais

| ID | Requisito | Implementação/verificação | Teste |
|---|---|---|---|
| RNF-001 | Segurança multi-tenant | `security.py`; `firestore.rules`; testes 403 sem claim | E2E-API; MAN |
| RNF-002 | Preço só do servidor | `_preco_item`, `publico.py`, `delivery_service` | E2E (pedido com preço alterado ignora payload) |
| RNF-003 | Segredos fora do git | `.gitignore` (`service-account.json`, `.env*`) | Revisão |
| RNF-004 | Transações em pontos críticos | `@transactional` em pedidos/caixa/estoque/onboarding | E2E (409 corrida mesa/caixa) |
| RNF-005 | Idempotência da baixa (`baixadoEm`) | `pedidos_service.atualizar_status_item` | MAN retry |
| RNF-006 | UI responsiva/padrões de estado | `components/ui/index.tsx`, Tailwind | MAN |
| RNF-007 | Performance quota/leituras | Snapshot filtrado por tela como fonte, zero polling; pago/fechado só em sessão e relatórios | E2E-API; MAN |
| RNF-008 | Portabilidade | FastAPI + build estático Vite | Build/preview |
| RNF-009 | Localização BRL/pt-BR/fuso | `format.ts`, `settings.timezone`, tzdata | pytest indireto; E2E |
| RNF-010 | Testabilidade (lógica pura) | `services/calculos.py` + `tests/` | **pytest 23/23** |
| RNF-011 | Custo zero inicial | Firestore Spark; cache PWA | Monitoramento |
| RNF-012 | Observabilidade `/health` + logs | `main.py:health` | E2E smoke |
| RNF-013 | Camadas router→service→base | estrutura `app/` | Revisão de código |
| RNF-014 | Normalização criadoEm/atualizadoEm | `base.doc_to_dict` | E2E leitura |

## 3. Cobertura cruzada rápida

| Área de teste da suíte E2E (52 base + 13 cond.) | Requisitos cobertos |
|---|---|
| Auth/me, 401/403 | RF-001..003, RF-008, RNF-001 |
| Categorias/produtos CRUD | RF-010..012 |
| Imagem do produto (PUT + bytes públicos) | RF-011a, RN-26 |
| Mesas CRUD + estados | RF-020..022 |
| Pedido → mesa ocupada → itens → KDS bulk → pagamento → caixa → relatório | RF-030..043, RF-033/051, RF-090 |
| Baixa agregada de estoque (2 produtos × 1 ingrediente) | RF-034, RN-07/08 |
| Estoque itens + movimentação transacional | RF-060..061, RNF-004 |
| Delivery CRUD + transições inválidas | RF-070..071 |
| Financeiro fornecedores/despesas/pagar | RF-080..082 |
| Configurações PUT | RF-092 |
| Onboarding por convite (seção 13, condicional ao token-owner) | RF-004/005/005a, RN-03/25 |

Verificação contínua: CI `.github/workflows/ci.yml` (pytest+tsc+build a cada push/PR).
