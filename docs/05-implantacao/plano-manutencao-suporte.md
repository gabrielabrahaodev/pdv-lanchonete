# Plano de Manutenção e Suporte — PDV Lanchonete v2

## 1. Objetivos e escopo

Manter o sistema operacional, seguro e evoluindo: correção de defeitos, atualização de dependências, ajustes de regras de negócio e pequenas evoluções contínuas.

## 2. Tipos de manutenção

| Tipo | Exemplos neste sistema |
|---|---|
| **Corretiva** | bug em quitação de pagamento; mesa travada ocupada; 404 após deploy |
| **Adaptativa** | mudança de versão do SDK firebase-admin/Firestore; nova política do Firebase; mudança de fuso/legislação |
| **Perfectiva** | novos filtros no relatório; impressão de cupom não fiscal; paginação de coleções grandes |
| **Preventiva** | backup/restauro testado; rotação da service account; revisão de quotas Spark; limpeza de pedidos antigos |

## 3. Níveis de suporte e SLA

| Nível | Atendente | Escopo | SLA (horário comercial) |
|---|---|---|---|
| N1 | Equipe da loja treinada | dúvidas de uso, senha esquecida, operação diária | imediato |
| N2 | Suporte técnico/designado | reiniciar backend, verificar logs, reemparelhar impressora, seeds | 4h úteis |
| N3 | Desenvolvedor | código, banco, Firebase, releases | 1 dia útil (defeito S2) / imediato (S1) |

Severidades (herdadas do plano de testes): **S1** operação parada/perda financeira → ação imediata · **S2** função errada com contorno → 1–2 dias · **S3** cosmético → próximo release.

## 4. Rotinas preventivas

| Rotina | Frequência | Procedimento |
|---|---|---|
| Verificação `/health` + login | diária (abertura) | checklist de abertura da loja |
| Backup Firestore (export) | semanal (automatizar) | export para bucket; restaurar em projeto de teste a cada mês |
| Revisão de fechamentos | semanal | diferenças de caixa explicadas; relatório × caixa |
| Atualização de dependências | mensal | `pip list --outdated`, `npm outdated`; aplicar patches com regressão R-01 |
| Rotação de segredos | trimestral ou sob suspeita | nova service account no GCP → atualizar `.env`/PaaS → revogar antiga |
| Limpeza/arquivamento de pedidos > 90 dias | mensal (quando volume crescer) | script Admin dedicado (a criar) |
| Revisão de quotas/custos Firebase | mensal | console GCP → alertas |

## 5. Procedimentos operacionais padrão (POP)

### POP-01 — Sistema fora do ar
1. Checar backend: `GET /health` (porta 8000).
2. Se morto: iniciar uvicorn (ver manual-tecnico §2); conferir logs `srv.err.log`.
3. Se erro de Firebase/quota: aguardar/ajustar plano; registrar incidente.
4. Contingência enquanto offline: anotar comandas em papel; ao voltar, lançar pedidos com hora real.

### POP-02 — Impressora não imprime
1. Testar em Configurações → Teste de impressora.
2. Reemparelhar Bluetooth; repetir.
3. Usar fallback (impressão pela janela) até resolver.

### POP-03 — Mesa travada como ocupada
1. Verificar pedido ativo: se quitado/cancelado, a mesa deveria ter liberado → reportar (bug S2) e liberar via Mesas (status livre).

### POP-04 — Resetar senha de usuário
Admin/Gerente → Configurações → Usuários → editar usuário → nova senha (ou remover/recriar conta).

## 6. Gestão de releases

- Cadência: releases pequenas conforme demanda (trunk-based).
- Checklist de release: pytest ✅ · build TS ✅ · suíte API (se fluxo core) ✅ · changelog na PR/tag · deploy com janela fora do pico · smoke pós-deploy (`/health` + R-01 resumido) · rollback pronto (redeploy tag anterior).

## 7. Monitoramento e indicadores

| Indicador | Meta |
|---|---|
| Disponibilidade do backend (horário de funcionamento) | ≥ 99,5% |
| Erros 5xx por dia | 0 (investigar qualquer ocorrência) |
| Diferenças de caixa inexplicadas | 0 por semana |
| Tempo de resposta das telas principais | < 1s percebido (cache/polling) |
| Defeitos S1/S2 abertos | 0 / ≤ 2 |

Ferramentas atuais: logs locais do uvicorn; planejado: uptime externo apontando para `/health` + alertas de quota Firebase.

## 8. Evolução prevista (roadmap de manutenção)

1. Publicação das rules + onSnapshot ativo (verificar ausência de warnings).
2. Deploy produção (Render + Firebase Hosting) com TLS.
3. CI (GitHub Actions): pytest + build a cada push.
4. Webhook iFood/Goomer (delivery automático).
5. Fila offline de escritas do PWA (background sync).
6. Paginação/índices quando coleções passarem de ~5 mil docs.

## 9. Responsabilidades

| Papel | Manutenção |
|---|---|
| Dono/Gerente | N1, validar regras de negócio novas, aprovar evoluções |
| Suporte designado | N2, POPs, backups |
| Desenvolvedor | N3, releases, segurança, roadmap |
