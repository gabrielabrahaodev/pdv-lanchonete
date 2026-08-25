# Planos — PDV Lanchonete v2

Roadmap vivo do projeto. Atualizado em 2026-08-25.

> Regra de fluxo permanente: **validar sempre em localhost antes de qualquer deploy**
> (backend `.venv` porta 8000 → frontend 5173 com proxy `/api` → suíte E2E
> `-Base http://127.0.0.1:8000`). Push em `master` dispara auto-deploy da Render.

---

## ✅ P0.7 — Provisionamento por convite + Console da Plataforma (implementado e deployado)

Decisão de arquitetura com o usuário (2026-08-24): **dois planos separados**.
PLATAFORMA = operadores em `sistema/global.donoUids[]` (sem tenant, sem acesso a dados de
restaurantes). TENANT = admins de cada estabelecimento (N por tenant, papel=admin no doc).
Admin de restaurante NUNCA gera convite. A flag `onboardingAberto` foi APOSENTADA — novo
restaurante nasce EXCLUSIVAMENTE por convite válido (uso único, expira 7d, revogável).

| Item | Detalhe |
|---|---|
| Convite = ID do doc | Coleção top-level `convites/{token}` (token url-safe). Leitura direta na transação, sem query/índice |
| Consumo atômico | `criar_primeiro` marca `usadoEm/usadoPorUid` no MESMO commit do restaurante — reuso impossível nem em corrida |
| Bootstrap | Projeto do zero (nenhum restaurante E nenhum dono): cria livre e semeia o primeiro dono. Com restaurante existindo, convite é obrigatório (403 sem/inválido/expirado/usado/revogado) |
| Separação de auth | Endpoints `/api/sistema/*` usam `get_current_auth` puro + guard `donoUids`; rotas de tenant continuam exigindo claim restaurantId. `/auth/me` responde `souDono` |
| Console `/plataforma` | Rota própria fora do layout do tenant (guard RequireOwner): gerar convite → link copiável `…/select-restaurant?t=CÓDIGO`, lista com status (ativa/usada/expirada/revogada), revogar. Menu "Plataforma" só para `souDono`; owner loga e cai direto no console |
| Contas | Owner da plataforma: `gabriel@pdv.com` (senha temporária no Console para trocar; uid em donoUids ÚNICO). `admin@restaurante.com` REMOVIDO de donoUids — ficou admin puro do tenant de teste |
| CLI de donos | `npm run promover-dono -- listar \| adicionar --uid X [--exec] \| remover --uid Y [--exec]` |
| E2E seção 13 | owner gera convite · admin de tenant tenta gerar → 403 · signUp descartável: sem convite 403 → com convite 201 → auto-cura → souDono=false → 3º POST 409 → reuso 403 → revogado 403 · pulada com aviso se token-owner.txt ausente |

**Pendências:** ~~validar E2E local · commit/push · release Hosting~~ ✅ concluídas (commits `00ef1e6`→`ea70b8a`, deployado). Restam: teste manual do usuário (owner + tenant) e revalidar seção 13 contra produção com `token-owner.txt` VÁLIDO (na rodada local de 2026-08-25 os 6 FAIL foram só o token do owner expirado — base 52 passos PASS). Gestão visual de donos e lista de tenants → P3.
E-mail automático de convite → P3 (hoje o link é enviado manualmente pelo owner).

---

## ✅ P0.6 — Governança: donoUids (superado pelo P0.7)

Criou `sistema/global.donoUids[]` + guard no PUT da flag + seed do criador do 1º restaurante.
O toggle "Auto-cadastro aberto" foi removido da UI quando a flag morreu (P0.7); o conceito de
donoUids permanece como base do plano da plataforma.

---

## ✅ P0.5 — Onboarding à prova de falha (implementado e deployado)

Decisão da mesa PM/UX/Architect (2026-08-24): escopo = robustez do backend + presets de
mesa; verificação de e-mail NÃO exigida por enquanto (reabrir quando houver cobrança).

| Item | Detalhe |
|---|---|
| Transação única de criação | `criar_primeiro` gravava marcador `onboarding/{uid}` em txn separada ANTES do batch — batch falho deixava marcador órfão e o usuário travado em 409 eterno. Agora TUDO (raiz, config, 8 pais, mesas, user admin, marcador já com restaurantId) nasce numa única transação (leituras 100% antes das escritas — lição do bug 10) |
| Retry auto-cura | Falha de `set_custom_user_claims` pós-commit deixava restaurante existente + usuário sem acesso + 409 no retry. Agora marcador completo + token sem claim ⇒ reemite claims e devolve o MESMO restaurante |
| Marcador órfão recuperável | Marker sem restaurantId (resquício legado/crash antigo) é sobrescrito pela própria transação em vez de bloquear para sempre |
| Ordem dos guardas | Flag `onboardingAberto` agora é avaliada DEPOIS do estado do marcador — quem se recupera não leva 403 indevido |
| Presets de mesa (UX) | Form de onboarding troca input numérico cru por chips `Sem salão · 6 · 12 · 24 · Outro` (Outro revela o input) |
| Suíte E2E | Nova seção 13: signUp via Identity Toolkit REST → 201 → re-POST token velho = auto-cura → refresh token traz claim → 3º POST = 409. Cleanup: `npm run limpar-onboarding-qa` (dry-run padrão, `--exec` apaga restaurantes "QA Onboard*", markers e contas descartáveis) |

**Pendências:** ~~validar E2E local · commit/push · revalidar produção~~ ✅ concluídas junto com o P0.7.

---

## ✅ P0 — Proteger o que existe (CONCLUÍDO e deployado)

Implementado, validado e publicado em 2026-08-24 (commit `00ef1e6`).

| Item | Detalhe |
|---|---|
| Guard backend de categoria | `categorias_service.remover` retorna **409** se houver produtos vinculados (antes apagava sem checar; bloqueio existia só no frontend) |
| Flag global `onboarding_aberto` | Doc top-level `sistema/global`, campo `onboardingAberto` (ausente = aberto). Gate no `criar_primeiro` → 403 quando fechado |
| Endpoints do sistema | `GET/PUT /api/sistema/onboarding-aberto` (PUT só admin) |
| Frontend | Toggle "Auto-cadastro aberto" na ConfiguracoesPage, visível só para admin |
| Backup diário | Task Scheduler **12:00** ("PDV-Backup-Firestore") → `scripts\backup-diario.ps1` → `npm run backup`; retenção dos 14 mais recentes; log em `backups\agendamento.log`; dumps dentro do OneDrive (cópia fora da máquina grátis) |
| Restore | `scripts/restaurar-backup.ts` (`npm run restaurar`) — dry-run é o padrão, `--exec` grava, pula coleção `onboarding` sem `--com-onboarding` |

**Validação:** pytest 23/23 · E2E local 50 PASS / 0 FAIL (52 definidos, 2 condicionais de
caixa pulados por já haver sessão aberta — por design) · tsc limpo.

### Pendências para publicar o P0
- [x] Teste manual no localhost pelo usuário
- [x] Commit único do P0 (`00ef1e6`)
- [x] Push ⚠️ dispara Render (mexe backend) + release Hosting (`VITE_API_URL` no build)
- [x] Revalidar suíte E2E contra produção

---

## 📋 P1 — Dinheiro na mesa (próxima trilha)

Impacto imediato na operação diária do caixa.

### 1. Pagamento parcial / divisão de conta (~1–2 dias)
- **API JÁ SUPORTA pagamentos parciais**: `POST /pagamentos/{pedido}` aceita N chamadas `{tipo, valor}`,
  valida `valor ≤ restante + tolerância` e só quita (`status=pago`, libera mesa) quando
  `soma(pagamentos) >= total − tolerância`.
- O que falta é a **UX**: pagar por item ou por valor parcial na tela.
- Pontos de contato:
  - Backend: expor `totalPago/restante` no GET do pedido (hoje dá para calcular do array `pagamentos`).
  - Frontend: `PagamentoPage` — fluxo "pagar parte", lista de pagamentos da conta,
    estado visual do restante.
- Cuidado: transação Firestore (leitura 100% antes de escrita 100% — lição do bug 10)
  e idempotência de retry.

### 2. Desconto/acréscimo + taxa de serviço (~½ dia)
- Campos no pedido: `descontoValor`/`descontoPct` e/ou `taxaServicoPct` (10% clássico).
- Total resolvido NO SERVIDOR (`calculos.total_pedido` — já centralizado, estender
  pytest lá), nunca confiar no preço vindo do cliente.
- Frontend: aplicar no resumo da mesa/pagamento; refletir no relatório.

---

## 📋 P2 — Fluxo de salão

### 3. Modo garçom (~2 dias)
- Celular/tablet do garçom lança o pedido direto na mesa (hoje o PDV é caixa-centrado;
  o QR atende o cliente, mas quem anota é o garçom).
- Aproveitar infraestrutura existente: modal de customização compartilhado,
  papel novo `garcom` (já existe na suíte de papéis), rota autenticada reutilizando
  `POST /pedidos/{id}/itens`.
- Tela nova leve: escolher mesa → carrinho → enviar. Sem acesso a caixa/relatórios.

### 4. Impressão automática da comanda (~½ dia)
- Hoje a impressão no KDS é botão manual por cartão.
- Ao transicionar item → `preparo` (bulk endpoint), disparar impressão da comanda
  automaticamente no dispositivo que tem a impressora pareada.
- Decisão de produto: quem imprime (KDS aberto no tablet da cozinha) e fallback
  quando Bluetooth não responder (banner de erro, não silenciar).

---

## 🔮 P3 — Escala (sem data)

- **Fila offline do PWA**: escritas enfileiradas quando a internet cai (dívida
  consciente registrada desde o PWA básico). Internet caiu = PDV parado hoje.
- **Gestão de equipe**: criar/desativar funcionários e resetar senha sem abrir o
  Console do Firebase.
- **Integração iFood** ou pedido via WhatsApp (link direto do cardápio).

---

## Decisões de produto já registradas (não reabrir sem necessidade)

- Sangria ≠ despesa: despesas NÃO mexem na sessão de caixa.
- Saldo de estoque pode ficar negativo (não trava preparo).
- Item cancelado após baixa não estorna ingredientes.
- Preços sempre resolvidos no servidor.
- ~~Auto-cadastro controlável via flag global~~ → substituído pelo modelo de convites (P0.7):
  novo restaurante nasce EXCLUSIVAMENTE por convite válido; donos da plataforma em
  `sistema/global.donoUids[]`.

## Registro de correções recentes

- **2026-08-25** — fix caixa "Invalid Date": `abrir()` agora grava `abertoEm` na sessão
  (`caixa_service.py`); frontend usa fallback `abertoEm ?? criadoEm`. Commit `a047dec`,
  validado localmente (abrir→sessao-atual→fechar) e em produção.

## Ferramentas de sessão (fora do projeto, criadas nesta máquina)

- `scripts\limpar-sessoes-opencode.ps1` / `scripts\mesclar-sessoes-opencode.ps1`
- `opencode -c` recupera a última sessão após qualquer queda (dados em `opencode.db`,
  sem expiração)
