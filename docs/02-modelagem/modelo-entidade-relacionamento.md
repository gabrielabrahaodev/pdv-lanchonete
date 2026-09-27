# Modelo Entidade-Relacionamento (MER) — PDV Lanchonete v2

Modelo conceitual do domínio. No Firestore não existem JOINs nem FKs físicas: as cardinalidades são garantidas pela camada de serviços e as referências são por `id`.

## Diagrama

```mermaid
erDiagram
    RESTAURANTE ||--|| CONFIGURACOES : "possui 1 doc único"
    RESTAURANTE ||--o{ USUARIO : "emprega"
    RESTAURANTE ||--o{ CATEGORIA : "organiza"
    RESTAURANTE ||--o{ PRODUTO : "vende"
    RESTAURANTE ||--o{ MESA : "possui"
    RESTAURANTE ||--o{ PEDIDO : "registra"
    RESTAURANTE ||--o{ ITEM_ESTOQUE : "controla"
    RESTAURANTE ||--o{ MOVIMENTACAO_ESTOQUE : "audita"
    RESTAURANTE ||--o{ SESSAO_CAIXA : "abre/fecha"
    RESTAURANTE ||--o{ DELIVERY : "recebe"
    RESTAURANTE ||--o{ FORNECEDOR : "cadastra"
    RESTAURANTE ||--o{ DESPESA : "lança"

    CATEGORIA ||--o{ PRODUTO : "agrupa"
    PRODUTO ||--o{ VARIACAO : "oferece"
    PRODUTO ||--o{ INGREDIENTE_RECEITA : "consome por 1 un."
    INGREDIENTE_RECEITA }o--|| ITEM_ESTOQUE : "referencia itemId"

    MESA ||--o| PEDIDO : "pedidoAtivoId"
    USUARIO |o--o{ PEDIDO : "usuarioId (quem abriu)"
    USUARIO |o--o{ MESA : "garcomId"
    PEDIDO ||--|{ ITEM_PEDIDO : "contém (array)"
    PRODUTO ||--o{ ITEM_PEDIDO : "produtoId"
    VARIACAO |o--o{ ITEM_PEDIDO : "variacaoId"
    PEDIDO ||--o{ PAGAMENTO : "quita (array)"

    SESSAO_CAIXA ||--o{ PAGAMENTO : "credita vendas quitadas"
    SESSAO_CAIXA ||--o{ LANCAMENTO_CAIXA : "suprimentos/sangrias (array)"
    ITEM_ESTOQUE ||--o{ MOVIMENTACAO_ESTOQUE : "itemId"
    PEDIDO |o--o{ MOVIMENTACAO_ESTOQUE : "baixa automática (pedidoId)"

    DELIVERY ||--|{ ITEM_DELIVERY : "itens (array)"
    PRODUTO ||--o{ ITEM_DELIVERY : "produtoId"
    FORNECEDOR |o--o{ DESPESA : "fornecedorId"
    USUARIO |o--o{ DESPESA : "usuarioId (folha)"

    PRODUTO ||--o| IMAGEM_PRODUTO : "temImagem (doc mesmo id)"
    CONVITE ||--o| RESTAURANTE : "provisiona (consumido no onboarding)"
    USUARIO |o--o{ CONVITE : "usadoPorUid / criadoPor"

    ONBOARDING {
        string uid PK
        string restaurantId
        datetime criadoEm
    }

    IMAGEM_PRODUTO {
        string produtoId PK
        string imagemBase64
        string mime
    }
```

## Dicionário de entidades (atributos principais)

| Entidade | Atributos-chave | Observações |
|---|---|---|
| **RESTAURANTE** | id, nome, criadorUid, criadoEm | Raiz do tenant (`restaurantes/{id}`) |
| **CONFIGURACOES** | nome, moeda, timezone, impressoraTipo/Endereco, baixaEstoqueAutomatica, cardapioDigitalAtivo | Doc único `data/configuracoes` |
| **USUARIO** | id(=uid Auth), nome, email, papel, ativo, tema | Papel ∈ {admin, gerente, caixa, garcom, cozinha}; claims espelham papel |
| **CATEGORIA** | id, nome, ordem, ativo, icone, cor | Ordenação do cardápio |
| **PRODUTO** | id, nome, categoriaId, preco, precisaPreparar(default true), temImagem, imagemUrl?, ativo, estoqueMinimo | Preço-fonte da verdade; foto vive em IMAGEM_PRODUTO |
| **IMAGEM_PRODUTO** | produtoId(=id do doc), imagemBase64 ≤200k chars, mime(jpeg/png/webp), criadoEm | Coleção `imagens/items/{produtoId}` — fora do doc p/ não pesar listagens |
| **VARIACAO** | id, nome, precoAdicional, ativo | Embutida em PRODUTO |
| **INGREDIENTE_RECEITA** | itemId, qtd | Embutida; qtd por 1 unidade do produto |
| **MESA** | id, numero, status, pedidoAtivoId?, garcomId? | status ∈ {livre, ocupada, reservada, inativa} |
| **PEDIDO** | id, mesaId, tipo(local/delivery/balcao), status(aberto/pago/cancelado), total, fechadoEm?, usuarioId? | Agregado raiz |
| **ITEM_PEDIDO** | id, produtoId, variacaoId?, qtd, precoUnitario, observacoes?, status, baixadoEm? | Embutido em PEDIDO; preço congelado no lançamento |
| **PAGAMENTO** | id, tipo(dinheiro/pix/credito/debito), valor, troco?, referencia?, criadoEm | Embutido em PEDIDO; também agregado na sessão |
| **SESSAO_CAIXA** | id, usuarioId, abertoEm, valorInicial, totalVendas, totalRecebido, sangrias, suprimentos, status, resumoFechamento? | Uma aberta por tenant |
| **LANCAMENTO_CAIXA** | id, tipo(suprimento/sangria), valor, observacao?, usuarioId, criadoEm | Embutido na sessão |
| **ITEM_ESTOQUE** | id, nome, unidade, quantidadeAtual, minimo, custoMedio | Saldo pode ser negativo |
| **MOVIMENTACAO_ESTOQUE** | id, tipo(entrada/saida/ajuste), itemId, qtd, saldoApos, pedidoId?, usuarioId | Trilha de auditoria |
| **DELIVERY** | id, externalId, platform, cliente*, itens[], total, status, confirmadoEm/prontoEm/entregueEm | Máquina de estados RN-16 |
| **FORNECEDOR / DESPESA** | ver dicionário do esquema lógico | Despesa tem competência `data` |
| **CONVITE** | token(PK = id do doc), criadoPor, criadoEm, expiraEm(+7d), ativo, usadoEm?, usadoPorUid? | Coleção top-level `convites/{token}`; consumo transacional no onboarding (RN-03/25) |

## Regras de cardinalidade relevantes

1. **RESTAURANTE 1—1 CONFIGURACOES**: documento único por tenant.
2. **MESA 0..1—PEDIDO**: apenas um pedido ativo por mesa; enforced transacionalmente.
3. **PEDIDO 1—* ITEM/PAGAMENTO**: arrays embutidos (padrão agregado); leitura atômica do pedido.
4. **ITEM_ESTOQUE *—MOVIMENTACAO**: histórico imutável com `saldoApos` para reconstrução.
5. **PRODUTO *—ITEM_ESTOQUE** (via receita): N:N resolvida por array embutido de `{itemId, qtd}`.
6. **ONBOARDING (coleção top-level)**: 1 usuário → no máx. 1 restaurante; guard transacional.
7. **PRODUTO 1—0..1 IMAGEM_PRODUTO**: doc de mesmo id em coleção própria; cascade delete.
8. **CONVITE 0..1—RESTAURANTE**: cada convite provisiona no máx. 1 restaurante (uso único transacional).
