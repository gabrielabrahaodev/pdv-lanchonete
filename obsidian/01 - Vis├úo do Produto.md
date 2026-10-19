---
title: Visão do Produto
aliases: [Escopo, Produto]
tags: [pdv, produto, negocio]
---

# Visão do Produto

## Objetivo

Aplicação web para operar uma lanchonete: cadastrar catálogo e mesas, lançar pedidos, encaminhar itens para preparo, cobrar pedidos, controlar estoque, registrar despesas e acompanhar relatórios gerenciais.

## Stack confirmada

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query.
- **Backend:** Python/FastAPI, Pydantic e `firebase-admin`.
- **Identidade:** Firebase Authentication; o frontend obtém ID token e o envia como `Authorization: Bearer ...`.
- **Persistência:** Cloud Firestore, organizada por restaurante.
- **Deploy descrito no README:** Firebase Hosting para frontend/PWA e Render para a API.
- **Tempo real:** listeners Firestore via `useFirestore`; mutations e telas frias usam API/React Query.

## Módulos da aplicação

1. Login e seleção/onboarding de restaurante.
2. Caixa e abertura/fechamento de sessão.
3. Mesas, pedidos e pagamentos parciais.
4. Catálogo: produtos, variações, categorias e imagem.
5. KDS/cozinha (status dos itens).
6. Estoque e receita por produto.
7. Delivery como registro operacional com máquina de estados interna.
8. Fornecedores, despesas e resultado gerencial.
9. Relatórios de venda, horários, pagamentos, top produtos/categorias e agregado diário/mensal.
10. Cardápio público por QR Code, hoje essencialmente leitura; endpoint público de pedido responde 410.
11. Configurações, preferências de tema, usuários e console da plataforma.

## Fora do que está demonstrado no código analisado

- Não foi identificada integração operacional de cobrança de assinatura SaaS.
- Não foi identificada emissão fiscal eletrônica.
- Delivery tem fluxo de status próprio, mas a documentação técnica indica que integrações externas com iFood/Goomer não fazem parte dos testes automatizados e dependem de integração/manual.
- Não há neste snapshot um BI Python separado nem um banco Supabase; o dado persistente é Firestore.
- Não assumir que o endpoint do cardápio QR cria pedido: a rota de envio público está desativada com 410 no código atual.

## Objetos centrais

- Restaurante/tenant
- Usuário e papel
- Categoria e produto
- Mesa
- Pedido e itens
- Pagamento
- Sessão de caixa
- Item de estoque e movimentação
- Fornecedor e despesa
- Pedido de delivery
- Agregados de vendas/despesas
- Convite de onboarding e dono da plataforma

Ver [[02 - Arquitetura]], [[Modelo de Dados/Firestore - Estrutura]] e [[Regras de Negócio/Índice de Regras]].
