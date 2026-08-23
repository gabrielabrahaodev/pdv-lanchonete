# Termo de Abertura do Projeto (TAP) — PDV Lanchonete v2

| Campo | Valor |
|---|---|
| **Nome do projeto** | PDV Lanchonete v2 — Sistema de Ponto de Venda para Lanchonete |
| **Código** | pdv-restaurante/python |
| **Data de início** | Agosto/2026 (reimplementação da versão Flutter) |
| **Status** | Em desenvolvimento funcional (módulos core entregues e testados) |
| **Gerente do projeto / Patrocinador** | Proprietário da lanchonete |

---

## 1. Justificativa

A operação de lanchonetes de pequeno porte é frequentemente gerida com caderno, planilhas e caixa manual, o que gera erros de fechamento, perda de controle de estoque, ausência de histórico financeiro e lentidão no atendimento. Este projeto entrega um PDV web multi-dispositivo que digitaliza o ciclo completo **venda → cozinha → pagamento → caixa → relatório**, com baixa automática de insumos por receita e visão gerencial (DRE simplificada).

A v2 substitui um protótipo Flutter por uma arquitetura web (React + FastAPI + Firebase), mantendo os mesmos modelos de dados, para permitir uso em qualquer navegador/tablet, sem instalação.

## 2. Objetivos

### 2.1 Objetivo geral
Fornecer um sistema de ponto de venda completo, leve e acessível por navegador, para gestão de vendas em salão, balcão e delivery de uma lanchonete.

### 2.2 Objetivos específicos (SMART)
1. Registrar pedidos por mesa/balcão com itens, variações e observações em menos de 30 segundos por lançamento.
2. Encaminhar itens automaticamente ao KDS da cozinha e controlar status `pendente → preparo → pronto → entregue`.
3. Quitar pedidos por dinheiro/PIX/crédito/débito, creditar na sessão de caixa aberta e liberar a mesa.
4. Baixar ingredientes do estoque automaticamente ao iniciar preparo, conforme receita cadastrada no produto.
5. Consolidar relatório de vendas por período (hora, forma de pagamento, top produtos/categorias) e resultado gerencial (despesas × faturamento).
6. Oferecer cardápio digital público via QR Code na mesa, com pedido direto do cliente.
7. Operar custo zero de infraestrutura na fase inicial (plano Spark do Firebase).

## 3. Escopo

### 3.1 Dentro do escopo
- Módulos: Login/onboarding, Caixa (mesas/pedidos/pagamentos), Cozinha KDS, Produtos e Categorias, Estoque (itens, movimentações, receitas), Delivery, Relatórios, Financeiro (fornecedores, despesas), Configurações, Usuários/papéis, Cardápio digital público, Impressão térmica ESC/POS via Web Bluetooth, PWA offline-read.
- Backend REST FastAPI com Firestore como persistência multi-tenant.
- Testes: pytest de lógica pura + suíte E2E de API (34 casos) + fluxo ponta a ponta validado contra o Firestore real.

### 3.2 Fora do escopo (nesta fase)
- Integração automática com APIs do iFood/Goomer (delivery hoje registra pedidos manualmente).
- Pagamento online (gateway/PIX cobrança automática).
- Fiscal/emissão de NFC-e/CFe.
- Fila de escrita offline completa do PWA (apenas leitura funciona offline).
- App nativo (Android/iOS).

## 4. Entregas principais

| # | Entrega | Critério de aceitação resumido |
|---|---|---|
| E1 | API FastAPI completa (17 routers) | Suíte E2E 34/34 PASS |
| E2 | SPA React (9 áreas + cardápio público + PWA) | Fluxo mesa→pedido→pagamento→caixa sem erro; build PWA ok |
| E3 | Baixa automática de estoque por receita | Movimentação `saida` gravada na mesma transação do item, idempotente |
| E4 | Financeiro + DRE | `/relatorios/resumo` retorna bloco `financeiro` consistente |
| E5 | Segurança multi-tenant | Claims `restaurantId`/`papel` + `firestore.rules` publicadas |
| E6 | Documentação | Esta biblioteca de documentos |

## 5. Stakeholders

| Papel | Interesse |
|---|---|
| Dono/administrador | Resultado gerencial, fechamento de caixa correto, controles |
| Gerente | Cadastros, estoque, usuários, configurações |
| Operador de caixa | Rapidez no registro de pedidos e pagamentos |
| Garçom | Lançamento rápido por mesa |
| Cozinha | Fila clara de preparo (KDS) |
| Cliente final | Cardápio digital simples pelo celular |

## 6. Equipe e papéis

| Função | Responsabilidade |
|---|---|
| Desenvolvedor full-stack | Frontend React, backend FastAPI, scripts Firestore |
| Analista de requisitos/QA | Levantamento, casos de uso, testes E2E e homologação |
| Infra/DevOps (parcial) | Firebase, deploy das regras, plano de produção |

## 7. Premissas
- O estabelecimento opera com até ~50 mesas e volume compatível com plano Spark do Firestore.
- Usuários possuem conta Google/Firebase Auth por e-mail/senha; papéis definidos via custom claims.
- Impressora térmica Bluetooth ESC/POS disponível quando houver impressão física.
- Preços são sempre resolvidos no servidor a partir do cadastro de produtos.

## 8. Restrições
- Orçamento de infraestrutura ≈ R$ 0 na fase inicial.
- Backend exige Python 3.12 + `tzdata` (fuso America/Sao_Paulo).
- Custom claims só valem no próximo ID token (impacta UX de onboarding/perfil).
- Acesso direto do cliente ao Firestore depende da publicação das `firestore.rules`.

## 9. Riscos iniciais

| Risco | Impacto | Mitigação |
|---|---|---|
| Corrida/concorrência (2 pedidos na mesma mesa, 2 aberturas de caixa) | Dados inconsistentes | Transações Firestore (`@transactional`) nos pontos críticos |
| Token antigo após mudança de claims | 403 confuso ao usuário | Refresh forçado de token + guard duplo transacional no onboarding |
| Custo/quota do Firestore acima do esperado | Bloqueio do plano Spark | Leitura em memória (coleções pequenas), cache PWA 24h |
| Perda da chave `service-account.json` vazada | Acesso total ao projeto | Arquivo fora do git (`.gitignore`); rotação imediata se exposto |
| Falta de internet no salão | Operação parada | PWA com cache NetworkFirst de leitura; fila de escrita planejada |

## 10. Marcos

| Marco | Situação |
|---|---|
| M1 — MVP API + telas core (login, caixa, produtos, mesas) | ✅ Concluído |
| M2 — Plano de correções B1–B5/M1–M4 (transações, pagamento minimalista) | ✅ Concluído |
| M3 — Tema por usuário + onboarding self-service + receita/baixa automática | ✅ Concluído |
| M4 — Financeiro + DRE + quick wins + impressão + cardápio digital + PWA | ✅ Concluído |
| M5 — Publicação das regras + deploy produção (Render + Firebase Hosting) | ⏳ Planejado |
| M6 — Go-live no cliente piloto | ⏳ Planejado |

## 11. Autorização

Projeto autorizado a iniciar/continuar conforme escopo acima, com marcos M5/M6 pendentes de aprovação de infraestrutura de produção.
