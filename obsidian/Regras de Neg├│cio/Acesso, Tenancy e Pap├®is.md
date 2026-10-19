---
title: Acesso, Tenancy e Papéis
tags: [regras, seguranca, multi-tenant]
---

# Acesso, Tenancy e Papéis

## Autenticação

- O frontend autentica via Firebase Auth (e-mail/senha).
- API espera `Authorization: Bearer <ID token>`.
- `get_current_auth` usa `firebase_admin.auth.verify_id_token`.
- Token ausente/malformado ou inválido/expirado → 401.
- `require_restaurant` exige custom claim `restaurantId`; ausência → 403.
- `require_roles(...)` valida claim `papel`; papel não autorizado → 403.

## Tenancy

- Caminho de dados começa em `restaurantes/{restaurantId}`.
- O backend usa o tenant extraído do token, não um tenant arbitrário do body.
- Firestore rules permitem leitura direta apenas se `request.auth.token.restaurantId == restaurantId` e negam todas as escritas diretas do cliente.
- `sistema/`, `convites/` e outros caminhos sem regra explícita ficam negados ao SDK cliente; backend Admin SDK opera fora das regras.

## Papéis de tenant

Consulte [[04 - Matriz de Permissões]]. As guards principais estão nos routers; o frontend esconder botão não conta como autorização.

## Restrições na gestão de usuários

- Administrador e gerente podem gerenciar usuários, conforme restrições do service.
- Somente `admin` pode criar/alterar/remover contas com papel `admin`.
- Tema do próprio usuário pode ser alterado por qualquer papel com tenant.
- Após emissão/troca de custom claims, o token do frontend precisa ser atualizado; o fluxo de onboarding força refresh.

## Auditoria para mudanças de segurança

- Testar 401, 403 por papel e isolamento entre dois tenants.
- Testar regras Firestore no emulador (`frontend/tests/firestore_rules.test.mjs`).
- Não usar `firebase-admin` para justificar teste de rules: Admin SDK contorna regras.
- Confirmar se todos os novos caminhos do Firestore estão cobertos por rules; qualquer caminho sem regra deve ser negado ao cliente.

Fontes: `backend/app/core/security.py`, `backend/app/routers/*.py`, `firestore.rules`, `backend/app/services/usuarios_service.py`.
