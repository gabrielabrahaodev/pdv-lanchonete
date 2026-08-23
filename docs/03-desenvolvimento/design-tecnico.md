# Documento de Design Técnico — PDV Lanchonete v2

Especificação técnica de implementação por módulo: contratos de API, algoritmos e detalhes que orientam manutenção e evolução. Referência rápida de endpoints ao final.

---

## 1. Convenções transversais da API

- **Prefixo** `/api` (todos os routers); health em `/health`.
- **JSON camelCase** — `CamelModel` gera aliases a partir dos campos snake_case; payloads aceitam ambos (`populate_by_name`).
- **Auth**: header `Authorization: Bearer <id-token>`; sem token → 401; sem claim `restaurantId` → 403.
- **Códigos**: 200 leitura/alteração · 201 criação · 204 exclusão · 400/401/403/404/409 conflito de estado · 422 validação · 429 rate limit público.
- **Timestamps**: gravados como `createdAt/updatedAt` UTC; expostos como `criadoEm/atualizadoEm` (normalização em `base.doc_to_dict`).
- **IDs**: `new_id(prefixo)` = prefixo + 16 hex (ex.: `item_`, `pag_`, `mv_`, `dit_`, `ext_`, `rest_`).

## 2. Módulo Pedidos (`pedidos_service.py`)

### 2.1 Criação com resolução de preço
```
_preco_item(rid, produtoId, variacaoId):
    produto = obter(produtoId)            # 404 se não existe
    se not ativo → 409
    preco = produto.preco
    se variacaoId: procura variação → não achada = 404; inativa = 409; soma precoAdicional
    return round(preco, 2)
```
Pedido é criado dentro de `@transactional`: lê mesa, bloqueia se `ocupada` (409), seta pedido e atualiza mesa atomicamente. Tipo normalizado para {local, delivery, balcao} (default local).

### 2.2 Mutação de itens
`adicionar_item` e `remover_item` rodam via `_run_txn` (txn + re-leitura pós-commit). Regras: pedido aberto; remoção só de `pendente`; total recalculado com `calculos.total_pedido`.

### 2.3 Baixa automática (`atualizar_status_item`)
Condições: `novo_status == "preparo"` ∧ item estava `pendente` ∧ `not baixadoEm`. Lê `configuracoes.baixaEstoqueAutomatica` **dentro da txn**. Consumo = `agregar_consumo_receita(receita, qtd)` agrupado por itemId. Para cada ingrediente existente no estoque: cria movimentação `saida` (com `saldoApos`, `pedidoId`) e decrementa saldo (pode ficar negativo). Marca `baixadoEm`. Falhas permissivas: produto removido ou ingrediente inexistente → segue sem travar.

### 2.4 Cancelamento
Só pedido aberto e sem pagamentos; grava `cancelado+fechadoEm`; chama `mesas_service.liberar`.

## 3. Módulo Caixa (`caixa_service.py`)

- **abrir**: transação com query `where(status == aberto)` — aborta automaticamente se outra sessão surgir entre leitura e commit (409).
- **movimentacao_caixa**: suprimento/sangria acumulam no campo correspondente e fazem append em `movimentacoesCaixa` (id `mv_*`).
- **fechar**: calcula `esperado = inicial + recebido + suprimentos − sangrias`; persiste `resumoFechamento {esperadoEmCaixa, valorContado?, diferenca?}`; status fechado.
- **registrar_pagamento**: valida tipo ∈ {dinheiro,pix,credito,debito}; pedido aberto; `valor ≤ restante + TOLERANCIA(0.009)` senão 422 com restante formatado. Quitação (≥ total − tolerância) dispara `_credit_sessao` (txn sobre sessão aberta: totalVendas, totalRecebido, vendasPorFormaPagamento por tipo, quantidadePorProduto ignorando itens cancelados) e `mesas_service.liberar`.

Payload aceito (minimalista, decisão M4):
```json
POST /api/pagamentos/{pedido_id}
{ "tipo": "pix", "valor": 42.9 }        // id/criadoEm gerados no servidor → 201
```

## 4. Módulo Mesas (`mesas_service.py`)

- criar: valida número único (409).
- liberar: usa `DELETE_FIELD` explícito para `pedidoAtivoId` e `garcomId` (stamp_update descarta None — armadilha conhecida).
- remover: proibida com mesa ocupada (409).

## 5. Módulo Estoque (`estoque_service.py`)

Movimentação transacional:
```
entrada: novo = round(atual + qtd, 3)
saida:   novo = round(atual − qtd, 3)
ajuste:  novo = round(qtd, 3)
grava movimentação com saldoApos + atualiza saldo (mesma txn)
```
Alertas: filtro `quantidadeAtual ≤ minimo`; frontend agrega contagem no menu.

## 6. Onboarding (`restaurantes_service.py`)

Sequência exata (ver diagrama de sequência 6): guard de claim → transação reserva `onboarding/{uid}` → batch cria raiz/configurações/docs-pai/mesas (`mesa_01…N`)/doc admin → marcador finalizado com restaurantId → claims Admin SDK. Falha nos claims → 500 com mensagem clara ("restaurante criado, mas falha ao vincular"). Frontend deve forçar `getIdToken(true)` após 201.

## 7. Cardápio digital (`routers/publico.py`)

Rate limit in-memory por IP (deque monotônico): 12 req / 60s → 429. Gate: `cardapioDigitalAtivo !== false`. Validação dura do body: 1..30 itens; `produtoId` string; `qtd` int; obs ≤ 200 chars → 422. Mesa livre cria pedido com `usuario_id="cardapio_digital"`; ocupada adiciona itens ao `pedidoAtivoId` retornando `{adicionadoA:true}`; mesa inativa 409.

## 8. Delivery (`delivery_service.py`)

Mapa `TRANSICOES` define estados-alvo válidos por estado atual (ver RN-16); timestamps setados nas transições confirmadas/pronto/entregue. Itens recebem nome resolvido (+ variação) e preço servidor-side; total arredondado por item.

## 9. Relatórios (`relatorios_service.py`)

Base: pedidos `pago` com `fechadoEm||criadoEm ∈ [inicio,fim]`. Hora de venda convertida com `ZoneInfo(settings.timezone)` (exige tzdata). Top produtos/categorias: nomes resolvidos, top 10. Financeiro via `calculos.resumo_financeiro`: despesas por competência `data` (qualquer status), CMV = saídas com pedidoId × custoMedio atual (informativo), resultado = faturamento − despesas.

## 10. Usuários e preferências (`usuarios_service.py`)

Criar: papel restrito a {gerente, caixa, garcom, cozinha}; só admin cria gerente; cria Auth user + claims + doc. Atualizar: senha opcional; troca de papel reescreve claims preservando restaurantId; apenas admin toca em contas admin. Remover: disable no Auth + delete do doc. Preferências (`/usuarios/me`): GET/PATCH do tema; PATCH cria doc se inexistente (self-service qualquer papel).

## 11. Frontend — decisões técnicas

| Tema | Decisão |
|---|---|
| Chamadas | wrapper único `api()` injeta `Bearer getIdToken()`, lança `ApiError{status,message}` |
| Dados servidor | TanStack Query; invalidação cruzada após mutações (pedidos↔mesas↔caixa) |
| Tempo real | `useRealtime` mapeia coleção→query keys e invalida; erro só loga warning |
| Tema | classe `dark` no `<html>`; cache `pdv:tema:{uid}`; PATCH confirma no servidor |
| CSV | `baixarCsv` com `;` + BOM `\uFEFF` e escape RFC |
| Impressão | payload ESC/POS (init, align, bold, double-strike/grande, corte), chunks 180B; fallback janela print |
| PWA | autoUpdate; precache do app shell; runtime cache NetworkFirst `/api/*` GET |

## 12. Referência rápida de endpoints

| Router | Endpoints principais | Papéis (escrita) |
|---|---|---|
| auth | GET /auth/me | qualquer autenticado |
| restaurantes | POST /restaurantes/primeiro | sem claim tenant |
| categorias | GET/POST/PATCH/DELETE | admin, gerente, caixa |
| produtos | GET/POST/PATCH/DELETE (+filtros categoria/apenas_ativos) | admin, gerente, caixa |
| mesas | GET, POST, PATCH status, DELETE | CRUD: adm/ger/caixa; status: +garçom |
| pedidos | GET (?status&mesa_id), POST ?mesa_id&tipo, POST itens, DELETE itens/{id}, PATCH itens/{id}/status, POST cancelar | escrita: adm/ger/caixa/garçom; status: +cozinha; cancelar: adm/ger/caixa |
| pagamentos | POST /{pedido_id} (201) | adm/ger/caixa |
| cozinha | GET /fila; PATCH /pedidos/{p}/itens/{i}/status?novo_status= | adm/ger/caixa/cozinha |
| estoque | itens CRUD; POST movimentacoes; GET movimentacoes (?item_id&limit) | adm/ger |
| fornecedores | CRUD | adm/ger/caixa |
| despesas | CRUD + POST /{id}/pagar | adm/ger/caixa |
| caixa | GET sessoes/sessao-atual; POST abrir/suprimento/sangria/fechar | adm/ger/caixa |
| delivery | GET/POST pedidos; PATCH status | criar: adm/ger/caixa/garçom; status: +cozinha |
| publico | GET /{rid}/cardapio; POST /{rid}/mesas/{mesa}/pedido | sem auth (rate-limited) |
| relatorios | GET /resumo?inicio&fim | adm/ger/caixa |
| configuracoes | GET ""; PUT "" | PUT: adm/ger |
| usuarios | GET/PATCH /me; CRUD lista | CRUD: adm/ger (restrições RN-02) |

## 13. Armadilhas registradas (não reintroduzir)

1. Uma única instância FastAPI (lifespan+routers juntos) — duplicar a instância derruba `/api/*`.
2. `transactional` do SDK Python (`google.cloud.firestore`), não `run_transaction` (Node).
3. `Transaction.get` retorna generator → `next(iter(t.get(ref)), None)`.
4. Limpeza de campo = `DELETE_FIELD` explícito.
5. `_run_txn` retorna `obter(...)` pós-commit.
6. Claims valem só no próximo token → refresh forçado após onboarding/troca de papel.
7. `tzdata` instalado obrigatório (zoneinfo no Windows).
