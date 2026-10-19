---
title: Usuários e Configurações
tags: [regras, usuarios, configuracao]
---

# Usuários e Configurações

## Preferências individuais

- `GET/PATCH /api/usuarios/me` opera sobre o usuário autenticado.
- Tema aceito: `claro` ou `escuro`.
- Qualquer papel pode atualizar seu próprio tema; não significa que pode alterar preferências de outro usuário.
- Frontend aplica atualização imediata usando cache/localStorage por UID e confirma via API.

## Gestão de usuários

- Papéis: admin, gerente, caixa, garcom, cozinha.
- Criar usuário requer Firebase Auth, custom claims e documento Firestore no tenant.
- Gestão exige admin/gerente, com regra extra para contas admin.
- Remoção documentada desativa conta no Auth e exclui documento de perfil; histórico de venda preserva os IDs históricos.

## Configurações do restaurante

Campos documentados:
- `nome`, `moeda` (default BRL), `timezone` (default `America/Sao_Paulo`),
- `impressoraTipo`, `impressoraEndereco`,
- `baixaEstoqueAutomatica` (default verdadeiro, salvo valor explicitamente false),
- `cardapioDigitalAtivo` (default true).

PUT de configurações exige admin ou gerente. Fuso afeta relatórios no backend; pacote `tzdata` é requisito operacional para `zoneinfo`.

## Impressão e PWA

- Impressão ESC/POS Bluetooth tem fallback de impressão por janela do navegador, conforme docs técnicos.
- PWA tem update automático e cache; desenvolvimento local não registra service worker.

Fontes: `usuarios_service.py`, `configuracoes` router/service, `ThemeContext.tsx`, `ConfiguracoesPage.tsx`, `lib/impressora.ts`.
