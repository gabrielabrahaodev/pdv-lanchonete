# Relatórios de Teste — PDV Lanchonete v2

Consolidação das execuções de teste realizadas. Fontes: saída do pytest, suíte E2E de API e testes manuais registrados na sessão de correções (2026-08-22).

---

## 1. Resumo executivo

| Suíte | Data | Resultado | Status |
|---|---|---|---|
| pytest (unitária) | 2026-08-22 · 2026-08-23/24 | **23/23 PASS** (local e CI) | ✅ Aprovada |
| E2E API (`api_test.ps1`) | 2026-08-22 | **34/34 PASS** (com cleanup automático) | ✅ Aprovada |
| **E2E API 35 casos — PRODUÇÃO (Render)** | 2026-08-24 | **35/35 PASS** (relatório com asserção de venda) | ✅ Aprovada |
| Manuais B1–B5 / M1–M4 (`manual_b1_m4.ps1`) | 2026-08-22 | **TODOS PASS** | ✅ Aprovados |
| Fluxo ponta a ponta Firestore real (`e2e_test.js`) | 2026-08-22 · 2026-08-23 | login, leituras, pedido+mesa em batch, cleanup OK | ✅ Aprovado |
| Cardápio digital + onboarding + tema (manual) | sessão parte 3 | comportamentos validados | ✅ Aprovados |
| CI GitHub Actions (pytest + tsc + build) | desde 2026-08-24 | verde em todo push/PR | ✅ Ativa |


**Conclusão:** sistema em produção validado de ponta a ponta. Suíte E2E agora **versionada em `scripts/e2e/`** (antes vivia em pasta temporária).

## 2. Detalhamento — Unitária (pytest)

Arquivos: `tests/test_calculos.py` (12), `tests/test_modelos`→`test_models.py` (11).
Comando: `.venv\Scripts\python -m pytest tests -q`

| Grupo | Casos cobertos | Resultado |
|---|---|---|
| `total_pedido` | soma não cancelados; ignora cancelados; lista vazia; arredondamento 2 casas | 4/4 ✅ |
| `agregar_consumo_receita` | multiplicação por qtd; agrupamento de item repetido; inválidos ignorados; qtd fracionária | 4/4 ✅ |
| `resumo_financeiro` (DRE) | DRE completo; categoria desconhecida→outra; custo médio ausente=0; vazio | 4/4 ✅ |
| Modelos | DespesaCreate (categoria/valor/descrição); PaymentCreate minimalista; alias camelCase; RestaurantCreate (mesas 0–50, nome mín.); PreferenciasUpdate (tema válido/inválido) | 11/11 ✅ |

## 3. Detalhamento — Suíte E2E de API (35 casos, `scripts/e2e/`)

Pré-requisitos: token fresco via `node get-token.js` (expira 1h). Alvo padrão: **produção** (`-Base http://127.0.0.1:8000` para local).

Incrementos da versão 35 casos (2026-08-24):
- pagamento usa o contrato **minimalista B1** `{tipo, valor}` → 201 com id do servidor;
- delivery plataforma inválida → **422** (M4) como caso permanente;
- relatório resumo com **asserção real**: a venda criada no teste DEVE aparecer
  (janela de datas construída com `(Get-Date).Date.ToUniversalTime()` — histórico:
  data local rotulada como UTC zerava o resultado às noites do Brasil; o sistema sempre esteve correto).

Grupos e verificação:

| Grupo | Exemplos de asserção | Resultado |
|---|---|---|
| Health/Auth | `/health` ok; `/auth/me` com claims; 401 sem token; 403 sem tenant | ✅ |
| Categorias/Produtos/Mesas CRUD | criação QA prefixada, leitura, patch, delete 204 | ✅ |
| Pedido→Mesa | mesa fica `ocupada`; segundo pedido na mesma mesa → 409; itens adicionados/removidos; total correto | ✅ |
| Cozinha | fila contém itens; transição pendente→preparo→pronto→entregue | ✅ |
| Estoque | entrada/saída/ajuste com saldoApos; alertas quando ≤ mínimo | ✅ |
| Pagamento/Caixa | pagamento parcial; quitação → status pago; caixa credita totais por forma; abrir duplicado 409; fechar com resumo | ✅ |
| Delivery | criar (plataforma válida); transição inválida 409; plataforma inválida 422 | ✅ |
| Financeiro | fornecedor+despesa; pagar/reabrir | ✅ |
| Relatórios | resumo reflete vendas do período (bloco financeiro presente) | ✅ |
| Configurações/Usuários | PUT configurações; CRUD usuário papel válido; self-service tema | ✅ |

Estado final: **34/34 PASS**, ambiente limpo (cleanup automático dos recursos `QA`).

## 4. Detalhamento — Testes manuais do plano de correções

| ID | Cenário | Esperado | Obtido |
|---|---|---|---|
| B1/M1 | POST pagamento minimalista `{tipo:"pix", valor:10}` | **201** com id gerado servidor | 201 ✅ |
| M4 | POST delivery com `platform:"uber"` | **422** (Literal rejeita) | 422 ✅ |
| B2..B5/M2,M3 | reinício do servidor após mudanças; routers na instância correta; mesa liberada sem órfãos; transações nos pontos críticos | comportamento conforme design-tecnico §13 | ✅ |

## 5. Defeitos encontrados e resolução

| # | Defeito | Severidade | Correção | Regressão |
|---|---|---|---|---|
| D-1 | Duas instâncias FastAPI → `/api/*` 404 | S1 | unificar instância (lifespan+routers) | CT smoke /health + 1 endpoint autenticado |
| D-2 | Mesa liberada mantinha `pedidoAtivoId` órfão | S2 | `DELETE_FIELD` explícito em `liberar()` | CT-022/R-01 passo 8 |
| D-3 | Pagamento exigia payload completo (id/criadoEm do cliente) | S2 | contrato minimalista PaymentCreate (201) | CT-005 |
| D-4 | Corridas em mesa/caixa/estoque | S2 | `@transactional` nos services | CT-001/002 |
| D-5 | Baixa de estoque poderia duplicar em retry | S2 | idempotência `baixadoEm` | CT-007 |
| D-6 | Campo pydantic `service_account_json` nunca lia a env `FIREBASE_SERVICE_ACCOUNT_JSON` → em produção caía no ADC sem projeto: **401 em toda rota autenticada + 500 nos públicos**, com `/health` ok | **S1** (produção) | campo renomeado para `firebase_service_account_json` (`config.py`) | suíte E2E 35/35 contra a Render |
| D-7 | `/health` só aceitava GET → monitor fazia HEAD e recebia 405 ("serviço fora" com tudo saudável) | S3 | `@app.api_route("/health", methods=["GET","HEAD"])` | `curl -I /health` → 200 |
| D-8 | Pagamento/produto aceitava valor/preço zero/negativo → pagamento negativo corrompia o total do pedido | S2 | `Field(gt=0)` em `PaymentCreate.valor` e `ProductCreate/Update.preco` | `test_validacao_valores.py` (8 testes) + probes 422 na API |
| D-9 | Agregados gravados com `set(merge)` e chaves pontilhadas criavam campos literais `"a.b"`; leitura achava mapas vazios | S2 | caminhos com ponto SÓ em `update()` (+ base zerada idempotente no `NotFound`) | §11b self-check (delta exato + estorno) |
| D-10 | Agregado atualizado DENTRO da transação do pedido → `ReadAfterWriteError` (500) | S1 | agregado pós-commit, fora da transação (bugs.py: só dinheiro na txn) | §6b/§6c (baixa agregada + sem-preparo) |

Nenhum defeito aberto conhecido no escopo entregue.

## 6. Cobertura x lacunas

Cobertos: fluxo monetário crítico, concorrência, papéis, CRUDs, integrações Firebase.
Lacunas aceitas (planejadas): automação de UI (E2E browser), carga/performance, teste formal das rules do Firestore em emulador.

## 7. Execução em produção (2026-08-23/24) — fechamento

A janela sugerida foi executada: rules publicadas · deploy Render + Hosting concluídos ·
suíte 35/35 contra a API de produção · onSnapshot ativo sem warnings
validado ponta a ponta. Pendência restante: homologação física na loja (impressora Bluetooth,
QR de mesa escaneado de celular real, instalação do PWA).
