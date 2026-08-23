# Esquema Lógico de Banco de Dados — Firestore (PDV Lanchonete v2)

## 1. Estrutura geral (multi-tenant)

```
restaurantes/{restaurantId}                     ← doc raiz {nome, criadorUid, criadoEm}
└── data/
    ├── configuracoes                           ← DOCUMENTO ÚNICO
    ├── categorias/items/{id}
    ├── produtos/items/{id}
    ├── mesas/items/{mesaId}
    ├── pedidos/items/{pedidoId}
    ├── estoque/items/{itemId}
    ├── movimentacoes_estoque/items/{id}
    ├── usuarios/items/{uid}                    ← id = uid do Firebase Auth
    ├── sessoes_caixa/items/{sessaoId}
    ├── delivery_orders/items/{deliveryId}
    ├── fornecedores/items/{id}
    └── despesas/items/{id}

onboarding/{uid}                                ← coleção top-level (guard transacional)
```

- Documentos-pai (`data/produtos` etc.) existem apenas para "ancorar" as subcoleções.
- Escrita **sempre** via API (Admin SDK); leitura em tempo real opcional pelo cliente sob `firestore.rules`.

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
id · restaurantId · nome · categoriaId · preco:float · variacoes:[{id, nome, precoAdicional, ativo}] · ingredientes:[{itemId, qtd}] · imagemUrl? · ativo · estoqueMinimo:int

### mesas/items/{mesaId}
id · restaurantId · numero:int (único) · status: livre|ocupada|reservada|inativa · pedidoAtivoId? (removido com DELETE_FIELD ao liberar) · garcomId?

### pedidos/items/{pedidoId}
id · restaurantId · mesaId · tipo: local|delivery|balcao · status: aberto|pago|cancelado · total:float · usuarioId? · fechadoEm?
**itens[]:** { id, produtoId, variacaoId?, qtd:int, precoUnitario, observacoes?, status: pendente|preparo|pronto|entregue|cancelado, baixadoEm? }
**pagamentos[]:** { id(pag_*), tipo: dinheiro|pix|credito|debito, valor, troco?, referencia?, criadoEm }

### sessoes_caixa/items/{id}
id · restaurantId · usuarioId · valorInicial · totalVendas · totalRecebido · sangrias · suprimentos · status: aberto|fechado · vendasPorFormaPagamento:{tipo:valor} · quantidadePorProduto:{produtoId:int} · movimentacoesCaixa:[{id, tipo, valor, observacao?, usuarioId, criadoEm}] · resumoFechamento?{esperadoEmCaixa, valorContado, diferenca}

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

## 3. Consultas e índices

O sistema evita índices compostos deliberadamente:

| Operação | Estratégia |
|---|---|
| Listagens (`list_items`) | Stream da subcoleção inteira + ordenação/filtro em memória (coleções pequenas no escopo do PDV) |
| Sessão de caixa aberta | `where("status","==" ,"aberto")` dentro de transação (índice automático de campo único) |
| Filtros de pedidos/despesas | Feitos pós-leitura no serviço; filtros adicionais podem ser passados como query params |

## 4. Regras de acesso (resumo das firestore.rules)

```js
match /onboarding/{uid}      { allow read: request.auth.uid == uid; }   // escrita só Admin SDK
match /restaurantes/{rid}/{document=**} {
  allow read, write: request.auth != null
                  && request.auth.token.restaurantId == rid;
}
// todo o resto: deny all
```

## 5. Ciclo de vida dos registros

| Evento | Efeito nos dados |
|---|---|
| Onboarding | Batch cria raiz + configurações + docs-pai + mesas + doc admin; claims no Auth |
| Abrir pedido | set pedido(aberto) + update mesa(ocupada) na MESMA transação |
| Preparo de item | movimentação saida(pedidoId) + saldo do item + item.baixadoEm na mesma transação |
| Quitação | update pedido(pago, pagamentos[]) + transação na sessão + mesa liberada (DELETE_FIELDs) |
| Cancelar pedido | status=cancelado + mesa liberada; sem estorno de estoque |
| Remover usuário | Auth disabled=true + delete do doc (histórico de vendas preserva ids) |

## 6. Migrações/versionamento de schema

Sem schema rígido: evolução é aditiva com defaults defensivos na leitura (`get(campo, default)`). Exemplos já aplicados: normalização `createdAt→criadoEm`, campos novos de configurações tratados como `!== false`.
