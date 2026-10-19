---
title: Matriz de Permissões
tags: [seguranca, autorizacao]
---

# Matriz de Permissões

Papéis de tenant são custom claims Firebase: `admin`, `gerente`, `caixa`, `garcom`, `cozinha`. Para rotas de leitura, vários routers exigem apenas `require_restaurant`: o token deve ter `restaurantId`.

| Módulo/ação | admin | gerente | caixa | garçom | cozinha |
|---|:---:|:---:|:---:|:---:|:---:|
| Produtos/categorias — CRUD | ✓ | ✓ | ✓ | — | — |
| Mesas — CRUD | ✓ | ✓ | ✓ | — | — |
| Mesas — mudar status | ✓ | ✓ | ✓ | ✓ | — |
| Pedidos — criar/adicionar/remover item | ✓ | ✓ | ✓ | ✓ | — |
| Pedido — cancelar | ✓ | ✓ | ✓ | — | — |
| Itens/KDS — transição de status | ✓ | ✓ | ✓ | — | ✓ |
| Pagamentos e sessão de caixa | ✓ | ✓ | ✓ | — | — |
| Estoque e movimentações | ✓ | ✓ | — | — | — |
| Fornecedores e despesas | ✓ | ✓ | ✓ | — | — |
| Delivery — criar | ✓ | ✓ | ✓ | ✓ | — |
| Delivery — status | ✓ | ✓ | ✓ | ✓ | ✓ |
| Relatórios/financeiro | ✓ | ✓ | ✓ | — | — |
| Configurações | ✓ | ✓ | — | — | — |
| Gestão de usuários | ✓ | ✓ | — | — | — |
| Tema do próprio usuário | ✓ | ✓ | ✓ | ✓ | ✓ |

## Restrições específicas

- Apenas `admin` pode criar, alterar ou remover contas com papel `admin`; a política de gestão de usuários impede gerente de promover/remover admin.
- `admin`/`gerente` são exigidos para estoque, configurações e gestão de usuários.
- Donos de plataforma não são papel de tenant: são UIDs do documento top-level `sistema/global.donoUids[]`. Um admin de restaurante não ganha permissão da plataforma por ser admin do tenant.
- Firebase ID token ausente/inválido: 401. Token sem `restaurantId`: 403. Papel não autorizado: 403.
- O frontend pode ocultar botões, mas isso não substitui o guard backend.

Fontes: `backend/app/core/security.py`, `backend/app/routers/*.py`, `backend/app/services/usuarios_service.py`, `docs/01-planejamento/documento-regras-negocio.md`.
