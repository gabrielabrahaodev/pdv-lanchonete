# Relatórios de Teste — PDV Lanchonete v2

Consolidação das execuções de teste realizadas. Fontes: saída do pytest, suíte E2E de API e testes manuais registrados na sessão de correções (2026-08-22).

---

## 1. Resumo executivo

| Suíte | Data | Resultado | Status |
|---|---|---|---|
| pytest (unitária) | 2026-08-22 | **23/23 PASS** | ✅ Aprovada |
| E2E API (`api_test.ps1`) | 2026-08-22 | **34/34 PASS** (com cleanup automático) | ✅ Aprovada |
| Manuais B1–B5 / M1–M4 (`manual_b1_m4.ps1`) | 2026-08-22 | **TODOS PASS** | ✅ Aprovados |
| Fluxo ponta a ponta Firestore real (`e2e_test.js`) | 2026-08-22 | login, leituras, pedido+mesa em batch, cleanup OK | ✅ Aprovado |
| Cardápio digital + onboarding + tema (manual) | sessão parte 3 | comportamentos validados | ✅ Aprovados |

**Conclusão:** sistema apto para homologação funcional; pendências restritas a itens planejados (publicação de rules, deploy produção).

## 2. Detalhamento — Unitária (pytest)

Arquivos: `tests/test_calculos.py` (12), `tests/test_modelos`→`test_models.py` (11).
Comando: `.venv\Scripts\python -m pytest tests -q`

| Grupo | Casos cobertos | Resultado |
|---|---|---|
| `total_pedido` | soma não cancelados; ignora cancelados; lista vazia; arredondamento 2 casas | 4/4 ✅ |
| `agregar_consumo_receita` | multiplicação por qtd; agrupamento de item repetido; inválidos ignorados; qtd fracionária | 4/4 ✅ |
| `resumo_financeiro` (DRE) | DRE completo; categoria desconhecida→outra; custo médio ausente=0; vazio | 4/4 ✅ |
| Modelos | DespesaCreate (categoria/valor/descrição); PaymentCreate minimalista; alias camelCase; RestaurantCreate (mesas 0–50, nome mín.); PreferenciasUpdate (tema válido/inválido) | 11/11 ✅ |

## 3. Detalhamento — Suíte E2E de API (34 casos)

Pré-requisitos executados: token fresco via `get-token.js`; backend no :8000; seeds presentes.

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

Nenhum defeito aberto conhecido no escopo entregue.

## 6. Cobertura x lacunas

Cobertos: fluxo monetário crítico, concorrência, papéis, CRUDs, integrações Firebase.
Lacunas aceitas (planejadas): automação de UI (E2E browser), carga/performance, teste formal das rules do Firestore em emulador, CI agendado.

## 7. Próxima janela de teste sugerida

Após publicar rules + deploy produção: reexecutar R-01..R-04 no ambiente publicado + validar onSnapshot ativo (sem warnings no console) e rate limit público sob rede real.
