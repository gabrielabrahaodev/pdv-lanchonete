# Documento de Requisitos — PDV Lanchonete v2

Versão 2.0 · Este documento consolida os requisitos **funcionais (RF)** e **não funcionais (RNF)** do sistema, extraídos do código implementado (`backend/app/routers`, `frontend/src/pages`) e das decisões de produto registradas em `AGENTS.md`.

Convenções de prioridade: **Essencial** (o sistema não opera sem), **Importante** (valor alto de negócio), **Desejável** (melhoria).

---

## 1. Requisitos Funcionais

### 1.1 Autenticação, usuários e onboarding

| ID | Requisito | Prioridade |
|---|---|---|
| RF-001 | O sistema deve autenticar usuários via Firebase Auth (e-mail/senha) e emitir ID token usado como `Bearer` em todas as chamadas da API. | Essencial |
| RF-002 | A API deve validar o ID token em toda requisição e extrair os custom claims `restaurantId` e `papel`; sem `restaurantId`, responder 403. | Essencial |
| RF-003 | Deve expor `GET /api/auth/me` com contexto completo (uid, e-mail, papel, restaurante, perfil, configurações) para alimentar a aplicação. | Essencial |
| RF-004 | Onboarding por convite: novo restaurante nasce EXCLUSIVAMENTE via `POST /api/restaurantes/primeiro` com **token de convite válido** do dono da plataforma (`{token, nome, quantidadeMesas(default 12)}`), criando numa única transação doc raiz, configurações, docs-pai das coleções, mesas numeradas e o próprio doc de usuário como `admin`. Sem/inválido/expirado/usado/revogado → 403 (exceto bootstrap do zero e donos da plataforma). | Essencial |
| RF-005 | Guard duplo + auto-cura: marcador transacional na coleção top-level `onboarding/{uid}`; retry com marcador completo e claim ausente reemite claims e devolve o MESMO restaurante; terceira tentativa (claim válido) → 409. | Essencial |
| RF-005a | Convites da plataforma: donos em `sistema/global.donoUids[]` geram (`POST /api/sistema/convites`), listam e revogam convites — coleção top-level `convites/{token}`, uso único, expira 7 dias; consumo transacional no onboarding; admin de tenant não gera convite (403). `/auth/me` responde `souDono`. Console `/plataforma` gera link copiável `…/select-restaurant?t=CÓDIGO`. | Essencial |
| RF-006 | CRUD de usuários do restaurante (`/api/usuarios`) restrito a `admin`/`gerente`: criação cria conta no Firebase Auth + claims + documento; apenas `admin` cria/altera/remove contas `admin`. | Importante |
| RF-007 | Preferências self-service: qualquer papel pode ler/alterar seu tema (`GET/PATCH /api/usuarios/me`, valores `claro|escuro`), persistido no doc do usuário. | Importante |
| RF-008 | Papéis suportados: `admin`, `gerente`, `caixa`, `garcom`, `cozinha`, com guards por endpoint (`require_roles`). | Essencial |

### 1.2 Cadastros (categorias, produtos)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-010 | CRUD de categorias com nome, ordem, ativo, ícone e cor. Escrita: admin/gerente/caixa. | Essencial |
| RF-011 | CRUD de produtos com nome, categoria, preço, variações (nome + preço adicional), ingredientes (receita: `itemId` + `qtd` por unidade), ativo e estoque mínimo. | Essencial |
| RF-011a | Foto do produto: `PUT/DELETE /api/produtos/{id}/imagem` (base64 ≤200k chars, jpeg/png/webp) gravada em coleção própria `imagens/items/{produtoId}` com flag `temImagem` no produto; cliente comprime antes de enviar; bytes servidos publicamente em `GET /api/publico/{rid}/imagens/{produto_id}`; exclusão do produto apaga a imagem (cascade). | Importante |
| RF-012 | Listagem de produtos filtrável por categoria e por "apenas ativos". | Essencial |

### 1.3 Mesas

| ID | Requisito | Prioridade |
|---|---|---|
| RF-020 | Listar/obter mesas; criar mesa com número único (409 se duplicado); remover apenas mesa livre. | Essencial |
| RF-021 | Estados da mesa: `livre`, `ocupada`, `reservada`, `inativa`. Garçom pode alterar status; ocupação automática ocorre ao abrir pedido. | Essencial |
| RF-022 | Mesa guarda referência do pedido ativo (`pedidoAtivoId`) e do garçom; ao liberar, campos são removidos com `DELETE_FIELD` (sem órfãos). | Essencial |
| RF-023 | Gerar QR Code do cardápio digital por mesa (download PNG) apontando para `/m/{restaurantId}/{mesaId}`. | Importante |

### 1.4 Pedidos e itens

| ID | Requisito | Prioridade |
|---|---|---|
| RF-030 | Criar pedido em mesa livre com 1+ itens (`POST /api/pedidos?mesa_id=...&tipo=local|delivery|balcao`); preço unitário resolvido no servidor (produto + variação); itens nascem `pendente`. | Essencial |
| RF-031 | Transação anti-corrida: dois pedidos simultâneos na mesma mesa — apenas um vence; o outro recebe 409. | Essencial |
| RF-032 | Adicionar item a pedido aberto; remover apenas item `pendente`; recalcular total (soma `qtd × precoUnitario` dos itens não cancelados). | Essencial |
| RF-033 | Status do item: `pendente → preparo → pronto → entregue` (+ `cancelado`); atualização via KDS ou endpoint de pedidos. | Essencial |
| RF-034 | Baixa automática de estoque: ao mover item para `preparo` (a partir de `pendente`, sem `baixadoEm`), debitar ingredientes da receita na MESMA transação, gravar movimentação `saida` com `pedidoId` e marcar `baixadoEm` no item (idempotente). Respeita flag `baixaEstoqueAutomatica`; saldo pode ficar negativo; cancelamento posterior NÃO estorna. | Essencial |
| RF-035 | Cancelar pedido aberto sem pagamentos (status → `cancelado`, liberar mesa). Com pagamentos registrados, exigir estorno antes (409). | Essencial |
| RF-036 | Listar pedidos com filtros `status` e `mesa_id`. | Essencial |

### 1.5 Pagamentos e caixa

| ID | Requisito | Prioridade |
|---|---|---|
| RF-040 | Registrar pagamento em pedido aberto: payload minimalista `{tipo, valor}` (+ `troco?`, `referencia?`); tipos `dinheiro|pix|credito|debito`; id/timestamp gerados no servidor (201). | Essencial |
| RF-041 | Pagamentos parciais: acumular até cobrir o total (tolerância R$ 0,01); ao quitar, pedido → `pago` com `fechadoEm`. Valor acima do saldo → 422. | Essencial |
| RF-042 | Ao quitar: creditar venda na sessão de caixa ABERTA (transacional: totais, recebido, vendas por forma de pagamento, quantidade por produto) e liberar a mesa automaticamente. | Essencial |
| RF-043 | Sessões de caixa: abrir (uma única aberta por vez — transacional, 409 em duplicidade), suprimento, sangria e fechar com resumo (`esperadoEmCaixa = inicial + recebido + suprimentos − sangrias`, `valorContado`, `diferenca`). | Essencial |

### 1.6 Cozinha (KDS)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-050 | Fila da cozinha (`GET /api/cozinha/fila`) retornando pedidos abertos com itens pendentes/em preparo/prontos. | Essencial |
| RF-051 | Atualizar status dos itens por papel `admin|gerente|caixa|cozinha`: endpoint BULK preferencial `PATCH /api/cozinha/pedidos/{pedido}/itens/status` `{itemIds[], novoStatus}` (transição completa numa única transação, baixa agregada de ingredientes compartilhados); a rota antiga por item delega ao bulk. | Essencial |

### 1.7 Estoque

| ID | Requisito | Prioridade |
|---|---|---|
| RF-060 | CRUD de itens de inventário (nome, unidade, quantidadeAtual, mínimo, custo médio). Gestão: admin/gerente. | Essencial |
| RF-061 | Movimentações `entrada|saida|ajuste` transacionais sobre o saldo, gravando `saldoApos`; listagem com filtro por item e limite. | Essencial |
| RF-062 | Alertas: filtro `apenas_alertas=true` retorna itens com `quantidadeAtual ≤ minimo`; frontend exibe badge no menu. | Importante |

### 1.8 Delivery

| ID | Requisito | Prioridade |
|---|---|---|
| RF-070 | Criar pedido de delivery de plataformas `ifood|goomer|whatsapp|proprio` com cliente e itens (preços resolvidos no servidor). Outras plataformas → 422. | Importante |
| RF-071 | Máquina de estados do delivery: `pending→confirmed→preparing→ready→delivered`, cancelável até `delivered`; transições inválidas → 409; timestamps automáticos (`confirmadoEm`, `prontoEm`, `entregueEm`). | Importante |

### 1.9 Financeiro (fornecedores e despesas)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-080 | CRUD de fornecedores (nome, documento, telefone, e-mail, observações, ativo). | Importante |
| RF-081 | CRUD de despesas com categoria `insumo|folha|conta_fixa|outra`, competência (`data`), vencimento opcional, fornecedor/usuário/forma de pagamento; filtros por período/status/categoria/fornecedor/usuário. | Importante |
| RF-082 | Marcar despesa como paga (`POST /{id}/pagar`) e reabrir (`PATCH ativoPago:false` removendo `pagoEm` com `DELETE_FIELD`). Despesas NÃO movimentam a sessão de caixa (decisão de produto). | Importante |

### 1.10 Relatórios e configurações

| ID | Requisito | Prioridade |
|---|---|---|
| RF-090 | `GET /api/relatorios/resumo?inicio&fim`: total de pedidos pagos, faturamento bruto/líquido, ticket médio, vendas por hora (no fuso configurável, default America/Sao_Paulo), vendas por forma de pagamento, top produtos/categorias (nomes resolvidos, top 10). | Essencial |
| RF-091 | Bloco financeiro no resumo: despesas por categoria (por COMPETÊNCIA), total de despesas, CMV estimado (saídas automáticas × custo médio — informativo) e resultado gerencial = faturamento − despesas. | Importante |
| RF-092 | Configurações do restaurante (doc único): nome, moeda, timezone, impressora (tipo/endereço), `baixaEstoqueAutomatica`, `cardapioDigitalAtivo`; leitura para todos, escrita admin/gerente. | Essencial |

### 1.11 Cardápio digital público

| ID | Requisito | Prioridade |
|---|---|---|
| RF-100 | Endpoints PÚBLICOS sem token: `GET /api/publico/{rid}/cardapio` (categorias + produtos ativos, formato enxuto) e `POST /api/publico/{rid}/mesas/{mesa}/pedido`. | Essencial |
| RF-101 | Gate `cardapioDigitalAtivo` nas configurações (403 quando off) e rate limit por IP de 12 req/min (429 quando excedido). | Essencial |
| RF-102 | Mesa livre → cria novo pedido (usuário `cardapio_digital`); mesa ocupada com pedido ativo → adiciona itens ao pedido existente; mesa inativa → 409; limite de 1–30 itens e observações ≤ 200 chars. | Essencial |

### 1.12 Experiência de uso (frontend)

| ID | Requisito | Prioridade |
|---|---|---|
| RF-110 | SPA com áreas: Caixa, Mesas, Produtos, Categorias (tela própria), Estoque (badge de alertas), Cozinha KDS (cartão por mesa), Delivery, Relatórios, Fechamento de caixa, Financeiro, Configurações, Seleção de restaurante/onboarding e console Plataforma (dono). | Essencial |
| RF-111 | Tema claro/escuro POR USUÁRIO: classe `dark` no `<html>`, cache localStorage por uid + persistência via API. | Importante |
| RF-112 | Tempo real: `onSnapshot` do Firestore nas coleções quentes invalida caches do react-query; sem regras publicadas/offline, cai para polling (8–30s). | Importante |
| RF-113 | Impressão térmica ESC/POS via Web Bluetooth (service `18f0`, char `2af1`, chunks de 180 bytes) com fallback janela `print()`: comanda no KDS, recibo na quitação, teste em Configurações. | Importante |
| RF-114 | Exportação CSV (Excel pt-BR: `;` + BOM) em Relatórios, Financeiro e Estoque. | Desejável |
| RF-115 | PWA instalável (manifest, ícones, autoUpdate) com cache NetworkFirst para GETs `/api/*` (timeout 4s, validade 24h, 200 entradas). | Importante |

## 2. Requisitos Não Funcionais

| ID | Categoria | Requisito | Prioridade |
|---|---|---|---|
| RNF-001 | Segurança | Autenticação obrigatória exceto rotas públicas; isolamento multi-tenant por claim `restaurantId` no backend e nas `firestore.rules` (acesso client direto). | Essencial |
| RNF-002 | Segurança | Preços SEMPRE resolvidos no servidor; nunca confiar em preço enviado pelo cliente. | Essencial |
| RNF-003 | Segurança | Chave de service account fora do controle de versão; segredos apenas em `.env`/arquivo local ignorado pelo git. | Essencial |
| RNF-004 | Confiabilidade | Operações concorridas críticas (abrir pedido em mesa, abrir caixa, movimentação de estoque, crédito no caixa, reserva de onboarding) executam em transações Firestore. | Essencial |
| RNF-005 | Integridade | Idempotência da baixa de estoque via campo `baixadoEm` (retry não deduplica em dobro). | Essencial |
| RNF-006 | Usabilidade | Interface responsiva (desktop/tablet/celular), menu colapsável, drawer mobile, feedback de carregamento/erro/vazio padronizado. | Essencial |
| RNF-007 | Performance | Listagens lêm coleção inteira em memória (coleções pequenas) ordenadas sem índices compostos; polling entre 8s e 30s conforme tela. | Importante |
| RNF-008 | Portabilidade | Backend Python 3.12 + FastAPI; frontend build estático servível em qualquer host; PWA em Chrome/Edge (Web Bluetooth requer Chromium). | Importante |
| RNF-009 | Localização | Moeda BRL, datas/horas pt-BR, fuso configurável (default `America/Sao_Paulo`), CSV compatível com Excel pt-BR. | Essencial |
| RNF-010 | Testabilidade | Regras de cálculo puras isoladas em `calculos.py` cobertas por pytest (23 testes); suíte E2E de API reproduz fluxo completo. | Essencial |
| RNF-011 | Custo | Infraestrutura inicial custo zero (Firebase Spark); leituras minimizadas por cache/staleTime. | Importante |
| RNF-012 | Observabilidade | `/health` para verificação (aceita GET **e HEAD**; é estático — smoke real deve ler Firestore); logs de acesso uvicorn; erros HTTP com mensagens claras em português; Sentry opcional (`SENTRY_DSN`); backup diário automático (`backup.yml`). | Importante |
| RNF-013 | Manutenibilidade | Camadas router → service → base(Firestore); modelos Pydantic espelham os contratos camelCase; documentação viva nesta pasta. | Essencial |
| RNF-014 | Compatibilidade de dados | Documentos antigos com `createdAt/updatedAt` são normalizados para `criadoEm/atualizadoEm` na leitura. | Essencial |
