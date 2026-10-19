---
title: Plataforma e Administração Global
tags: [regras, plataforma, saas]
---

# Plataforma e Administração Global

## Papel global distinto

- Donos da plataforma estão em `sistema/global.donoUids[]`.
- Não precisam de `restaurantId` para operar rotas de sistema; `exigir_dono_plataforma` verifica UID global usando auth.
- Ser admin de um tenant não implica poder de dono global.

## Convites

- Criar/listar/revogar por rotas `POST/GET /api/sistema/convites` e `DELETE /api/sistema/convites/{token}`.
- Convite de uso único, expira em 7 dias, revogável.
- Consumo é transacional no onboarding.
- CLI indicada em docs: `npm run promover-dono -- listar|adicionar --uid X --exec|remover --uid Y --exec` (confirmar `scripts/package.json` e ajuda do CLI antes de executar em produção).

## Segurança operacional

- O documento global e a coleção de convites são administrados via Firebase Admin SDK; regras Firestore cliente não liberam estes caminhos.
- Não conceder dono por campo enviado pelo frontend; só a lista global é autoridade.
- Mudanças em donos/convides devem ser revisadas como operações privilegiadas, com log/backup antes de executar scripts.
