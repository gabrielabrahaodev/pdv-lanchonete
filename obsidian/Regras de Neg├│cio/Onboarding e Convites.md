---
title: Onboarding e Convites
tags: [regras, onboarding, plataforma]
---

# Onboarding e Convites

## Regra de criação do restaurante

Fora das exceções controladas, um novo restaurante é criado com `POST /api/restaurantes/primeiro` e convite válido. Payload documentado: nome, quantidade de mesas (default 12; modelo aceita 0–50) e token do convite.

Convites vivem em coleção top-level `convites/{token}` e são:
- de uso único;
- válidos por 7 dias;
- revogáveis por dono da plataforma;
- consumidos na mesma transação que cria o restaurante.

Convite ausente, inválido, expirado, revogado ou usado deve falhar com 403, salvo bootstrap permitido/dono global.

## Transação de onboarding

Transação cria estrutura do tenant, configurações, documentos-pai, mesas numeradas, documento de usuário admin e marcador em `onboarding/{uid}`. O convite é marcado como usado nessa mesma transação. Isso previne reutilização concorrente.

## Auto-cura de retry

Se o marcador de onboarding estiver completo mas os custom claims não tiverem sido aplicados, o retry pode reemitir claims e devolver o mesmo restaurante. Com claim válido já presente, tentativa repetida retorna conflito (documentação descreve 409).

## Plataforma separada

- Lista de donos: `sistema/global.donoUids[]`.
- Só dono global pode criar/listar/revogar convite por `/api/sistema/convites`.
- Admin de um restaurante não se torna dono da plataforma.
- Console do frontend: `/plataforma`; link usa `/select-restaurant?t=CÓDIGO`.

## Exceções

- Bootstrap inicial de sistema sem restaurante/dono, conforme service de provisionamento.
- Dono global pode criar restaurante sem convite.

## Fonte e testes

`backend/app/services/restaurantes_service.py`, `convites_service.py`, `backend/app/routers/restaurantes.py`, `sistema.py`, `frontend/src/pages/SelectRestaurantPage.tsx`, `pages/plataforma/PlataformaPage.tsx`.

Cenários: uso único, expirado, revogado, concorrência do mesmo token, retry parcial e usuário já associado a tenant.
