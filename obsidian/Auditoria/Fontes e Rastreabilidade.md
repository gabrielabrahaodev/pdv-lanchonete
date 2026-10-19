---
title: Fontes e Rastreabilidade
tags: [auditoria, fontes, rastreabilidade]
---

# Fontes e Rastreabilidade

## Snapshot de código

- Repositório: `gabrielabrahaodev/pdv-lanchonete`.
- Branch analisada: `fix/financial-reports-integrity`.
- HEAD branch: `65fe9ac74ae6b47931581b50c72e4ee437ecf7dd`.
- `master` consultado: `3a16ae59f2d3173e1dddc223791f364760c4603f`.
- Data de geração do vault: 2026-10-18.
- Os hashes indicam os objetos consultados no GitHub; alterações locais posteriores podem não estar incluídas.

## Documentos de negócio existentes consultados

- `README.md`
- `docs/01-planejamento/documento-regras-negocio.md`
- `docs/01-planejamento/documento-requisitos.md`
- `docs/01-planejamento/especificacao-casos-de-uso.md`
- `docs/01-planejamento/matriz-rastreabilidade.md`
- `docs/02-modelagem/esquema-logico-banco-dados.md`
- `docs/02-modelagem/modelo-entidade-relacionamento.md`
- `docs/02-modelagem/diagrama-estados.md`
- `docs/02-modelagem/diagrama-sequencia.md`
- `docs/02-modelagem/diagrama-componentes.md`
- `docs/03-desenvolvimento/arquitetura-software.md`
- `docs/03-desenvolvimento/design-tecnico.md`
- `docs/04-testes/plano-testes.md`
- `docs/04-testes/casos-teste.md`
- `docs/05-implantacao/manual-usuario.md`
- `docs/05-implantacao/manual-tecnico.md`
- `DEPLOY.md`

## Código inspecionado

### API / domínio

`backend/app/main.py`, `core/security.py`, `core/config.py`, `core/firebase.py`, `models/models.py` e os routers `auth`, `restaurantes`, `categorias`, `produtos`, `mesas`, `pedidos`, `pagamentos`, `cozinha`, `estoque`, `fornecedores`, `despesas`, `caixa`, `delivery`, `publico`, `relatorios`, `configuracoes`, `usuarios`, `sistema`.

### Services

`base.py`, `pedidos_service.py`, `caixa_service.py`, `mesas_service.py`, `estoque_service.py`, `agregados_service.py`, `backfill_service.py`, `calculos.py`, `despesas_service.py`, `delivery_service.py`, `produtos_service.py`, `usuarios_service.py`, `restaurantes_service.py`, `convites_service.py`.

### Frontend / infra / testes

`frontend/src/App.tsx`, `AuthContext.tsx`, `ThemeContext.tsx`, `hooks/useFirestore.ts`, `components/layout/AppLayout.tsx`, `components/ui/index.tsx`, páginas por módulo, `firestore.rules`, `.github/workflows/ci.yml`, suite backend, testes de rules no emulador e scripts E2E/seed/reconstrução.

## Como interpretar afirmações

- “Implementado” significa que foi localizado no código consultado.
- “Documentado” significa que aparece nos documentos do repo, mas pode estar desatualizado.
- “Recomendação” é proposta de engenharia, não uma regra existente.
- Riscos/diferenças importantes estão em [[Auditoria/Discrepâncias e Riscos]].

## Limitações desta análise

Acesso usado foi ao snapshot do branch remoto e documentos do repositório; não executei o sistema, não consultei dados do Firestore de produção e não rodei CI durante esta tarefa. O conteúdo não prova que o ambiente Render/Firebase está no mesmo commit. Recomenda-se comparar a cópia local e atualizar esta página após resolver mudanças não commitadas.
