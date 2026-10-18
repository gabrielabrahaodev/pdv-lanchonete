# Plano de Testes — PDV Lanchonete v2

## 1. Objetivo

Definir escopo, estratégia, níveis, critérios e responsabilidades de teste do sistema, garantindo que as regras de negócio críticas (transações, pagamentos, baixa de estoque) operem corretamente sob uso real e concorrente.

## 2. Escopo

**In:** backend (API + regras), frontend (fluxos de UI), integrações (Firebase Auth/Firestore, cardápio público), impressão (Bluetooth/fallback), PWA.
**Fora:** testes de carga em larga escala, pentest formal, testes das plataformas iFood/Goomer (integração manual).

## 3. Estratégia por nível

| Nível | Ferramenta | O que cobre | Onde |
|---|---|---|---|
| **Unitário** | pytest | Lógica pura: `total_pedido`, `agregar_consumo_receita`, `resumo_financeiro` (DRE) e validação dos modelos Pydantic | `backend/tests/` (23 casos) |
| **Integração/E2E de API** | PowerShell (`Invoke-RestMethod`) contra projeto Firebase real | Ciclo completo: auth → CRUDs → pedido → cozinha → pagamento → caixa → relatórios; delivery; estoque; configurações; cenários negativos (401/403/409/422) | suíte temporária `api_test.ps1` (34 casos) |
| **E2E de dados** | Node + Firebase client (`e2e_test.js`) | Replica o fluxo do app direto no Firestore: login, leituras, `whereIn status`, batch pedido+mesa, cleanup | scripts E2E |
| **Sistema/UI manual** | Navegador (desktop/mobile) | Fluxos de tela, tema, CSV, QR, impressão, PWA offline | roteiros desta pasta |
| **Regressão** | repetição da suíte API + smoke manual após cada release | proteção contra reintrodução de bugs conhecidos (lista §8) | — |

## 4. Ambiente de teste

| Item | Configuração |
|---|---|
| Backend | `.venv` Python 3.12 + requirements.txt (tzdata obrigatório); uvicorn :8000 |
| Frontend | `npm run dev` :5173 (proxy /api); PWA validado com `npm run build && npm run preview` |
| Banco | Projeto real `pdv-lanchonete-1fa79`, tenant de teste `restaurante_001`; seeds via `scripts/` |
| Credenciais | usuário de teste local via env no seed (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`) + usuários por papel criados no seed |
| Token | `get-token.js` grava `token.txt` (~1h de validade) |
| Impressora | térmica ESC/POS Bluetooth (service 18f0); fallback janela print sem hardware |

## 5. Critérios

- **Entrada**: build verde, migrations/flags revisadas, ambiente com seed.
- **Saída**: 100% da suíte unitária passando; suíte API 34/34; zero defeitos bloqueadores/maiores abertos; smoke manual aprovado.
- **Suspensão**: ambiente Firebase indisponível ou quota esgotada → suspender e reprogramar.

## 6. Cobertura priorizada (matriz risco × uso)

| Prioridade | Área | Risco associado |
|---|---|---|
| P1 | Pagamento/quitação + crédito caixa + liberação mesa | Dinheiro |
| P1 | Concorrência mesa/caixa/estoque (409 esperados) | Integridade |
| P1 | Baixa automática de estoque (flag on/off, idempotência) | Patrimônio |
| P2 | Papéis/guards (403), isolamento tenant | Segurança |
| P2 | KDS fila/status, cancelamentos com restrições | Operação |
| P3 | Delivery (máquina de estados), despesas/pagar | Gestão |
| P3 | Relatórios/DRE (fuso, competência) | Decisão gerencial |
| P4 | Tema, CSV, QR, PWA, impressão | UX |

## 7. Dados de teste

Seeds determinísticos (`init-firestore.ts` + `seed-data.ts`): 20 mesas livres, 4 categorias, 5 produtos com variações/receitas, 12 insumos com custo médio, usuários por papel, caixa inicial R$200. Suítes criam recursos com prefixo `qa_`/`QA` e fazem cleanup ao final.

## 8. Bugs históricos que viraram casos de regressão

1. `criar()` chamava função inexistente → 500 pós-gravação (usar `obter()`).
2. `_run_txn` com API Node (`db.run_transaction`) — usar decorator Python.
3. `Transaction.get` generator (não snapshot único).
4. Mesa liberada com `pedidoAtivoId` órfão — exigir `DELETE_FIELD`.
5. Duas instâncias FastAPI derrubavam `/api/*`.
6. Pagamento aceitando payload completo antigo — contrato minimalista `{tipo, valor}` deve responder 201.
7. Delivery aceitando plataforma inválida — `uber` deve dar 422.

## 9. Gerenciamento de defeitos

Severidades: **S1** bloqueia operação (perda de venda/dinheiro) · **S2** funcionalidade errada com contorno · **S3** menor/cosmético.
Fluxo: registrar (passo a passo + evidência + ambiente) → triagem → correção → caso de regressão na suíte correspondente → reteste.

## 10. Responsabilidades

| Papel | Atribuição |
|---|---|
| Dev | testes unitários + suíte API verde antes do merge |
| QA/Analista | roteiros manuais, homologação com o dono, evidências |
| Dono | aceite funcional (homologação) |
