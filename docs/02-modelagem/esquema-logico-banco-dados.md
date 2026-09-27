# Esquema Lógico de Banco de Dados — Firestore (PDV Lanchonete v2)

## 1. Estrutura geral (multi-tenant)

```
restaurantes/{restaurantId}                     ← doc raiz {nome, criadorUid, criadoEm}
└── data/
    ├── configuracoes                           ← DOCUMENTO ÚNICO
    ├── categorias/items/{id}
    ├── produtos/items/{id}
    ├── imagens/items/{produtoId}               ← imagem base64 (mesmo id do produto)
    ├── mesas/items/{mesaId}
    ├── pedidos/items/{pedidoId}
    ├── estoque/items/{itemId}
    ├── movimentacoes_estoque/items/{id}
    ├── usuarios/items/{uid}                    ← id = uid do Firebase Auth
    ├── sessoes_caixa/items/{sessaoId}
    ├── delivery_orders/items/{deliveryId}
    ├── fornecedores/items/{id}
    └── despesas/items/{id}
    ├── agregados_diarios/items/{YYYY-MM-DD}   ← pré-computado (vendas+despesas do dia)
    └── agregados_mensais/items/{YYYY-MM}      ← pré-computado (vendas+despesas do mês)

onboarding/{uid}                                ← coleção top-level (guard transacional)
sistema/global                                  ← doc top-level {donoUids[]} — donos da plataforma
convites/{token}                                ← coleção top-level (token = id do doc)
```

- Documentos-pai (`data/produtos` etc.) existem apenas para "ancorar" as subcoleções.
- Escrita **sempre** via API (Admin SDK); leitura em tempo real opcional pelo cliente sob `firestore.rules`.
- `sistema/` e `convites/` são deny-by-default para clientes (regras cobrem só `onboarding` e o tenant) — acesso exclusivo do Admin SDK.

## 2. Dicionário lógico por coleção

Campos em camelCase (como gravados). `criadoEm/atualizadoEm` são normalizados na leitura a partir de `createdAt/updatedAt` (ou dos nomes antigos em `usuarios`).

### configuracoes (doc único)
| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| nome | string | — | Nome exibido |
| moeda | string | BRL | ISO 4217 |
| timezone | string | America/Sao_Paulo | Fuso dos relatórios |
| impressoraTipo / impressoraEndereco | string | bluetooth / "" | Impressão |
| baixaEstoqueAutomatica | bool | true | RN-07 |
| cardapioDigitalAtivo | bool | true | RN-20 |

### categorias/items/{id}
id · restaurantId · nome · ordem:int · ativo:bool · icone? · cor?

### produtos/items/{id}
id · restaurantId · nome · categoriaId · preco:float · precisaPreparar:bool (default true; false = item nasce `entregue`, fora da fila do KDS) · variacoes:[{id, nome, precoAdicional, ativo}] · ingredientes:[{itemId, qtd}] · temImagem:bool · imagemUrl? (externa, fallback) · ativo · estoqueMinimo:int

### imagens/items/{produtoId}
id(=produtoId) · restaurantId? · imagemBase64:string (≤200k chars) · mime: jpeg|png|webp · criadoEm. Servida publicamente por `GET /api/publico/{rid}/imagens/{produtoId}`; apagada junto com o produto.

### mesas/items/{mesaId}
id · restaurantId · numero:int (único) · status: livre|ocupada|reservada|inativa · pedidoAtivoId? (removido com DELETE_FIELD ao liberar) · garcomId?

### pedidos/items/{pedidoId}
id · restaurantId · mesaId · tipo: local|delivery|balcao · status: aberto|pago|cancelado · total:float · usuarioId? · fechadoEm?
**itens[]:** { id, produtoId, variacaoId?, qtd:int, precoUnitario, observacoes?, status: pendente|preparo|pronto|entregue|cancelado, baixadoEm? }
**pagamentos[]:** { id(pag_*), tipo: dinheiro|pix|credito|debito, valor, troco?, referencia?, criadoEm }

### sessoes_caixa/items/{id}
id · restaurantId · usuarioId · abertoEm · valorInicial · totalVendas · totalRecebido · sangrias · suprimentos · status: aberto|fechado · vendasPorFormaPagamento:{tipo:valor} · quantidadePorProduto:{produtoId:int} · movimentacoesCaixa:[{id, tipo, valor, observacao?, usuarioId, criadoEm}] · resumoFechamento?{esperadoEmCaixa, valorContado, diferenca} · fechadoEm?

### estoque/items/{itemId}
id · restaurantId · nome · unidade (kg, un, L…) · quantidadeAtual:float (pode ser negativo) · minimo:float · custoMedio:float

### movimentacoes_estoque/items/{id}
id · restaurantId · tipo: entrada|saida|ajuste · itemId · qtd:float · saldoApos:float · observacao? · pedidoId? (baixa automática) · usuarioId

### usuarios/items/{uid}
id(=uid) · restaurantId · nome · email? · papel · ativo · tema: claro|escuro

### delivery_orders/items/{id}
id · restaurantId · externalId(ext_*) · platform: ifood|goomer|whatsapp|proprio · clienteNome · clienteTelefone? · clienteEndereco? · itens:[{id(dit_*), produtoId, nome, qtd, precoUnitario, observacoes?}] · total · status: pending|confirmed|preparing|ready|delivered|cancelled · confirmadoEm? · prontoEm? · entregueEm? · metadata?

### fornecedores/items/{id}
id · restaurantId · nome · documento? · telefone? · email? · observacoes? · ativo

### despesas/items/{id}
id · restaurantId · categoria: insumo|folha|conta_fixa|outra · descricao · valor>0 · data (competência) · vencimento? · fornecedorId? · usuarioId? · formaPagamento? · observacoes? · pagoEm? (removido com DELETE_FIELD na reabertura)

### agregados_diarios/items/{YYYY-MM-DD} e agregados_mensais/items/{YYYY-MM}
faturamento · totalPedidos · vendasPorHora:{HH:valor} · vendasPorFormaPagamento:{tipo:valor} · topProdutos:{produtoId:qtd} · saidasPorItem:{itemId:qtd} · despesasPorCategoria:{cat:valor} · totalDespesas · restaurantId. Somados via `Increment` atômico na quitação/baixa/despesa (sem backfill); leitura em `GET /relatorios/agregado`.

### sistema/global (doc top-level)
donoUids: string[] — uids dos donos da plataforma (guard de `/api/sistema/*`; sem tenant).

### convites/{token}
id(=token url-safe) · criadoPor(uid) · criadoEm · expiraEm(+7 dias) · ativo:bool · usadoEm? · usadoPorUid?. Consumido transacionalmente pelo onboarding (`criar_primeiro`); revogável via `/api/sistema/convites/{token}`.

## 3. Consultas e índices

O sistema evita índices compostos deliberadamente:

| Operação | Estratégia |
|---|---|
| Listagens pequenas (mesas, produtos, estoque) | Stream da subcoleção + ordenação/filtro em memória, ou snapshot filtrado no client |
| Telas quentes (KDS, detalhe, delivery) | Filtro server-side de campo único (`status==aberto`, `in [...]`, janelas de data, `limit`) ou listener equivalente — nunca scan de histórico |
| Relatórios/DRE | Janela `inicio/fim` na query + agregados dia/mês pré-computados (`GET /relatorios/agregado`) |
| Sessão de caixa aberta | `where("status","==" ,"aberto")` dentro de transação (índice automático de campo único) |
| Filtros de pedidos/despesas | Janela server-side; filtros adicionais pós-leitura no serviço |

## 4. Regras de acesso (resumo das firestore.rules)

```js
match /onboarding/{uid}      { allow read: request.auth.uid == uid; }   // escrita só Admin SDK
match /restaurantes/{rid}/{document=**} {
  allow read, write: request.auth != null
                  && request.auth.token.restaurantId == rid;
}
// sistema/, convites/ e todo o resto: deny all (acesso exclusivo Admin SDK)
```

## 5. Ciclo de vida dos registros

| Evento | Efeito nos dados |
|---|---|
| Onboarding por convite | transação única: valida+consome convite, cria raiz + configurações + docs-pai + mesas + doc admin + marcador; claims no Auth (auto-cura no retry) |
| Abrir pedido | set pedido(aberto) + update mesa(ocupada) na MESMA transação |
| Preparo de item | movimentação saida(pedidoId) + saldo do item + item.baixadoEm na mesma transação (bulk agrega ingredientes) |
| Quitação | update pedido(pago, pagamentos[]) + transação na sessão + agregados dia/mês + mesa liberada (DELETE_FIELDs) |
| Cancelar pedido | status=cancelado + mesa liberada; sem estorno de estoque |
| Remover usuário | Auth disabled=true + delete do doc (histórico de vendas preserva ids) |
| Excluir produto | delete do produto + da imagem em `imagens/items/{produtoId}` (cascade) |

## 6. Migrações/versionamento de schema

Sem schema rígido: evolução é aditiva com defaults defensivos na leitura (`get(campo, default)`). Exemplos já aplicados: normalização `createdAt→criadoEm`, campos novos de configurações tratados como `!== false`.
