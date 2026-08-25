# Documento de Regras de Negócio — PDV Lanchonete v2

Regras implementadas no backend (`app/services/`) e respeitadas pelo frontend. Cada regra indica onde está codificada.

## Bloco 1 — Acesso e papéis

### RN-01 — Isolamento por tenant
Todo dado pertence a um restaurante. O backend extrai `restaurantId` do custom claim do token; nenhuma rota autenticada aceita tenant informado pelo cliente. Regras do Firestore replicam o mesmo isolamento para acesso direto do app.
> Código: `core/security.py` (`require_restaurant`), `firestore.rules`.

### RN-02 — Autorização por papel
Papéis: `admin`, `gerente`, `caixa`, `garcom`, `cozinha`. Matriz de permissões por módulo:

| Módulo | admin | gerente | caixa | garcom | cozinha |
|---|---|---|---|---|---|
| Produtos/Categorias/Mesas (CRUD) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mesas — alterar status | ✅ | ✅ | ✅ | ✅ | ❌ |
| Pedidos (criar/itens) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Status de itens (KDS) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Pagamentos / Caixa | ✅ | ✅ | ✅ | ❌ | ❌ |
| Estoque / Usuários / Configurações | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delivery (criar) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Delivery (status) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Relatórios / Financeiro | ✅ | ✅ | ✅ | ❌ | ❌ |

Restrições adicionais: somente `admin` cria gerentes, altera ou remove contas `admin`.
> Código: guards em cada router; `usuarios_service.criar/atualizar/remover`.

### RN-03 — Onboarding único por convite
Novo restaurante nasce EXCLUSIVAMENTE com **convite válido** do dono da plataforma: coleção top-level `convites/{token}` (token = id do doc), uso único, expira em 7 dias, revogável; consumo (`usadoEm/usadoPorUid`) acontece na MESMA transação que cria o restaurante (reuso impossível nem em corrida). Exceções: bootstrap do zero (nenhum restaurante e nenhum dono) e donos da plataforma (`sistema/global.donoUids[]`), que criam sem convite. Guard de recuperação: marcador `onboarding/{uid}` completo + claim ausente → **auto-cura** reemite claims e devolve o MESMO restaurante; terceira tentativa (claim válido) → 409.
> Código: `restaurantes_service.criar_primeiro`, `convites_service`, `routers/sistema.py`.

## Bloco 2 — Mesas e pedidos

### RN-04 — Uma mesa, um pedido ativo
Mesa só aceita novo pedido quando não está `ocupada`. Ao abrir pedido, mesa passa a `ocupada` com `pedidoAtivoId` e `garcomId` na MESMA transação que cria o pedido (anti-corrida).
> Código: `pedidos_service.criar`.

### RN-05 — Número de mesa único
Não existem duas mesas com o mesmo número (409). Mesa ocupada não pode ser removida.
> Código: `mesas_service.criar/remover`.

### RN-06 — Ciclo de vida do item
Estados válidos: `pendente → preparo → pronto → entregue`, além de `cancelado`. Remoção de item permitida apenas enquanto `pendente`. Cancelamento de pedido apenas quando aberto e sem pagamentos.
> Código: `pedidos_service.atualizar_status_item/remover_item/cancelar`.

### RN-07 — Baixa automática de estoque por receita
Ao iniciar preparo (`pendente→preparo`), os ingredientes da receita do produto × quantidade são debitados, gerando movimentação `saida` com `pedidoId`. Executa dentro da mesma transação da atualização do pedido, preferencialmente via endpoint BULK da cozinha (`{itemIds[], novoStatus}`): consumo agregado dos ingredientes compartilhados entre produtos (`_consumo_produto` × qtd → `_aplicar_consumo`, uma leitura/escrita por ingrediente). Em transação Firestore a leitura é 100% antes da escrita 100% (`ReadAfterWriteError` — bug 10). Controlada pela configuração `baixaEstoqueAutomatica` (lida dentro da transação). Saldo pode ficar negativo — a operação NUNCA trava o preparo. Produto sem receita/ingrediente válido → sem baixa.

### RN-08 — Idempotência da baixa
A marcação `baixadoEm` no item garante que retries/reenvios não deduzam estoque duas vezes. Item cancelado após baixa NÃO estorna ingredientes (decisão de produto).
> Código: `pedidos_service._baixar_ingredientes`, `calculos.agregar_consumo_receita`.

### RN-09 — Preço resolvido no servidor
O preço unitário do item é calculado no backend a partir do cadastro do produto (+ preço adicional da variação). Preços enviados pelo cliente são ignorados. Produto/variação inativos não podem ser pedidos.
> Código: `pedidos_service._preco_item`, `delivery_service.criar`, `publico.py`.

### RN-10 — Total do pedido
Total = Σ (qtd × precoUnitario) dos itens **não cancelados**, arredondado a 2 casas.
> Código: `calculos.total_pedido`.

## Bloco 3 — Pagamento e caixa

### RN-11 — Pagamentos
- Tipos: `dinheiro`, `pix`, `credito`, `debito`; payload minimalista `{tipo, valor}` (id/timestamp no servidor).
- Valor não pode exceder saldo restante + tolerância de **R$ 0,01** (422 caso contrário).
- Quitação quando soma ≥ total − tolerância: pedido `pago` com `fechadoEm`.
- Só pagamentos em pedido `aberto`.
> Código: `caixa_service.registrar_pagamento`.

### RN-12 — Crédito no caixa e liberação da mesa
Ao quitar: crédito transacional na sessão de caixa aberta (se houver): `totalVendas`, `totalRecebido`, `vendasPorFormaPagamento`, `quantidadePorProduto` (itens não cancelados); mesa liberada com limpeza explícita dos campos (`DELETE_FIELD`). Sem caixa aberto, a venda é quitada mas não credita sessão.
> Código: `caixa_service._credit_sessao`, `mesas_service.liberar`.

### RN-13 — Sessão de caixa única e fechamento
Só existe UMA sessão aberta por vez (verificação transacional). Fechamento calcula `esperadoEmCaixa = inicial + recebido + suprimentos − sangrias` e registra valor contado e diferença. Suprimentos/sangrias exigem valor > 0. Despesas do financeiro NÃO movimentam a sessão de caixa (decisão de produto).
> Código: `caixa_service.abrir/movimentacao_caixa/fechar`.

## Bloco 4 — Estoque

### RN-14 — Movimentações transacionais
Entrada soma, saída subtrai, ajuste substitui o saldo; cada movimento grava `saldoApos` para auditoria. Concorrência protegida por transação.
> Código: `estoque_service.registrar_movimentacao`.

### RN-15 — Alertas de mínimo
Item entra em alerta quando `quantidadeAtual ≤ minimo` (badge no menu Estoque e filtro `apenas_alertas`).

## Bloco 5 — Delivery

### RN-16 — Máquina de estados do delivery
Transições válidas:
```
pending   → confirmed | cancelled
confirmed → preparing | cancelled
preparing → ready     | cancelled
ready     → delivered | cancelled
delivered/cancelled → (terminal)
```
Transição fora do mapa → 409. Timestamps automáticos: `confirmadoEm`, `prontoEm`, `entregueEm`. Plataformas restritas a `ifood|goomer|whatsapp|proprio`.
> Código: `delivery_service.TRANSICOES/atualizar_status`.

## Bloco 6 — Financeiro

### RN-17 — Despesas por competência
Relatórios agregam despesas pela competência (`data`), independentemente do status de pagamento. Categorias fixas: `insumo`, `folha`, `conta_fixa`, `outra` (desconhecidas caem em "outra").

### RN-18 — DRE gerencial
`resultadoGerencial = faturamento − totalDespesas`. `cmvEstimado` = Σ (saídas automáticas com `pedidoId` no período × custo médio atual do item) — **informativo**, para não dupla-contar compras lançadas como despesa de insumo.
> Código: `calculos.resumo_financeiro`, `relatorios_service.resumo`.

### RN-19 — Pagamento/reabertura de despesa
`POST /{id}/pagar` marca pago agora (`pagoEm`); reabertura via `PATCH ativoPago:false` remove `pagoEm` explicitamente (`DELETE_FIELD`).

## Bloco 7 — Cardápio digital

### RN-20 — Gate e rate limit
Endpoints públicos exigem configuração `cardapioDigitalAtivo=true` (senão 403) e respeitam limite de **12 requisições/minuto por IP** (429 acima disso).

### RN-21 — Pedido do cliente na mesa
Mesa livre → cria pedido (usuário registrado como `cardapio_digital`); mesa ocupada com pedido ativo → adiciona itens ao pedido existente (`adicionadoA=true`); mesa inativa → 409. Entre 1 e 30 itens por envio; observações limitadas a 200 caracteres. Preços sempre do servidor.
> Código: `routers/publico.py`.

## Bloco 8 — Relatórios

### RN-22 — Base de vendas
Relatório considera apenas pedidos `pago`, datados por `fechadoEm` (fallback `criadoEm`) dentro do período. Vendas por hora convertidas para o fuso configurável (default America/Sao_Paulo). Top produtos/categorias limitados a 10, nomes resolvidos a partir dos cadastros.
> Código: `relatorios_service.resumo`.

### RN-23 — Fuso horário configurável
Fuso de exibição vem de `settings.timezone` (backend, default America/Sao_Paulo) e pode ser alterado via `PUT /api/configuracoes` (`timezone`). Exige pacote `tzdata` instalado.

## Bloco 9 — Preferências

### RN-24 — Tema por usuário
Tema (`claro|escuro`) é preferência individual persistida no doc do usuário; qualquer papel altera o próprio via `PATCH /usuarios/me`. Frontend aplica cache local instantâneo (localStorage por uid) e confirma no servidor.
> Código: `usuarios_service.obter/atualizar_preferencias`, `ThemeContext.tsx`.

## Bloco 10 — Plataforma e imagens

### RN-25 — Separação PLATAFORMA × TENANT
Donos da plataforma vivem em `sistema/global.donoUids[]` e NÃO têm tenant: os endpoints `/api/sistema/*` usam autenticação pura + guard próprio (admin de tenant que tenta gerar convite → 403). Convite: uso único, expira 7 dias, revogável pelo dono; consumo transacional no onboarding (ver RN-03). Gestão de donos via CLI `npm run promover-dono`.
> Código: `routers/sistema.py`, `convites_service.py`.

### RN-26 — Imagem do produto
Uma imagem por produto, guardada fora do doc (coleção `imagens/items/{produtoId}`) para não pesar listagens; produto carrega só a flag `temImagem`. Payload ≤200k chars base64, mime jpeg/png/webp. Bytes servidos publicamente (`GET /api/publico/{rid}/imagens/{produto_id}`, cache 1h, fora do rate limit/gate do cardápio de propósito — `<img>` não envia Authorization). Excluir produto apaga a imagem.
> Código: `produtos_service`, `routers/publico.py`.
