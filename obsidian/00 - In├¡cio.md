---
title: PDV Lanchonete — Base de Conhecimento
aliases: [Início, Home, MOC]
tags: [pdv, mapa-de-conteudo, negocio]
status: mantido
---

# PDV Lanchonete — Base de Conhecimento

> [!abstract] Finalidade
> Este vault é a base de continuidade técnica e de negócio do **PDV Lanchonete**. Consolida regras, fluxos, modelo Firestore, API, papéis, implantação, testes e riscos, com ligações para o código que efetivamente implementa cada comportamento.

## Comece por aqui

- [[01 - Visão do Produto]] — objetivos, limites e módulos.
- [[02 - Arquitetura]] — componentes e responsabilidades.
- [[03 - Mapa do Código]] — onde alterar cada regra.
- [[04 - Matriz de Permissões]] — autorização por papel.
- [[05 - Mapa da API]] — rotas REST e controles de acesso.
- [[Regras de Negócio/Índice de Regras]] — índice RN-01…RN-26.
- [[Modelo de Dados/Firestore - Estrutura]] — caminhos, coleções e tenancy.
- [[Auditoria/Discrepâncias e Riscos]] — problemas confirmados e divergências entre docs e código.
- [[Operação/Desenvolvimento Local]] — iniciar backend/frontend e executar testes.
- [[Testes/Plano e CI]] — cobertura, CI e cenários de regressão.
- [[Agentes/Guia para IA e Desenvolvedores]] — como usar o vault sem inventar comportamento.

## Domínios de negócio

| Domínio | Documento principal |
|---|---|
| Login, tenant, papéis e convites | [[Regras de Negócio/Acesso, Tenancy e Papéis]]; [[Regras de Negócio/Onboarding e Convites]] |
| Produtos e categorias | [[Regras de Negócio/Produtos e Categorias]] |
| Mesas, pedidos, itens e cozinha | [[Regras de Negócio/Mesas, Pedidos e Cozinha]] |
| Receitas, estoque e movimentos | [[Regras de Negócio/Estoque e Baixa Automática]] |
| Pagamentos e sessão de caixa | [[Regras de Negócio/Pagamentos e Caixa]] |
| Despesas, fornecedores, CMV e resultado | [[Regras de Negócio/Financeiro, CMV e Resultado]] |
| Delivery | [[Regras de Negócio/Delivery]] |
| Agregados e relatórios | [[Regras de Negócio/Relatórios e Agregados]] |
| QR, cardápio e imagens | [[Regras de Negócio/Cardápio Digital, QR e Imagens]] |
| Configurações, preferências e plataforma | [[Regras de Negócio/Usuários e Configurações]]; [[Regras de Negócio/Plataforma e Administração Global]] |

## Flows operacionais

- [[Fluxos/FL-01 — Criar restaurante por convite]]
- [[Fluxos/FL-02 — Abrir mesa, lançar pedido e preparar]]
- [[Fluxos/FL-03 — Receber pagamento e quitar pedido]]
- [[Fluxos/FL-04 — Entradas e saídas de estoque]]
- [[Fluxos/FL-05 — Registrar e alterar despesa]]
- [[Fluxos/FL-06 — Ciclo de vida de delivery]]
- [[Fluxos/FL-07 — Relatórios e agregados]]

## Estado e confiabilidade da documentação

> [!warning] Snapshot analisado
> A análise de código deste vault usa a branch remota `fix/financial-reports-integrity`, commit `65fe9ac74ae6b47931581b50c72e4ee437ecf7dd`. O `master` consultado estava em `3a16ae59f2d3173e1dddc223791f364760c4603f`. Alguns arquivos locais exibidos na conversa possuem alterações mobile que ainda não estão nesse snapshot remoto. Antes de tomar o vault como descrição do código local final, compare com `git status` e `git diff`.

- **Confirmado no código:** o que é apontado a arquivos e funções da branch acima.
- **Documentado:** intenção/requisito encontrado em `docs/`; pode divergir do código.
- **Risco/pendência:** inconsistência observável ou lacuna que exige teste/decisão.

Consulte [[Auditoria/Fontes e Rastreabilidade]] para a lista das fontes e [[Auditoria/Discrepâncias e Riscos]] antes de modificar pagamentos, estoque, regras do Firestore ou relatórios.
