---
title: Dicionário de Dados
tags: [dados, schema, firestore]
---

# Dicionário de Dados

A tabela é um resumo lógico dos campos usados no código/documentação; modelos Pydantic são a referência para validação de payload. Firestore aceita evolução aditiva, portanto campos opcionais podem não existir em documentos históricos.

| Documento | Campos principais |
|---|---|
| `configuracoes` | `nome`, `moeda`, `timezone`, impressora, `baixaEstoqueAutomatica`, `cardapioDigitalAtivo` |
| categoria | `id`, `restaurantId`, `nome`, `ordem`, `ativo`, `icone`, `cor` |
| produto | `id`, `nome`, `categoriaId`, `preco`, `precisaPreparar`, `variacoes[]`, `ingredientes[]`, `temImagem`, `ativo`, `estoqueMinimo` |
| ingrediente | `itemId`, `qtd` por uma unidade do produto |
| mesa | `numero`, `status`, `pedidoAtivoId?`, `garcomId?` |
| pedido | `mesaId`, `tipo`, `status`, `itens[]`, `total`, `pagamentos[]`, `criadoEm`, `fechadoEm?`, `usuarioId?` |
| item do pedido | `id`, `produtoId`, `variacaoId?`, `qtd`, `precoUnitario`, `observacoes?`, `status`, `baixadoEm?` |
| pagamento | `id`, `tipo`, `valor`, `troco?`, `referencia?`, `criadoEm` |
| sessão caixa | `usuarioId`, `abertoEm`, `fechadoEm?`, `valorInicial`, `totalVendas`, `totalRecebido`, `sangrias`, `suprimentos`, `status`, resumos por forma/produto e `resumoFechamento?` |
| estoque | `nome`, `unidade`, `quantidadeAtual`, `minimo`, `custoMedio` |
| movimento estoque | `tipo`, `itemId`, `qtd`, `saldoApos`, `observacao?`, `pedidoId?`, `usuarioId`, timestamp |
| usuário | `uid/id`, `restaurantId`, `nome`, `email?`, `papel`, `ativo`, `tema` |
| delivery | `externalId`, `platform`, dados de cliente, itens, total, `status`, timestamps por estado |
| fornecedor | `nome`, `documento?`, `telefone?`, `email?`, `observacoes?`, `ativo` |
| despesa | `categoria`, `descricao`, `valor`, `data`, `vencimento?`, `status`, `pagoEm?`, fornecedor/usuário/forma/observações opcionais |
| agregado diário/mensal | faturamento, pedido count, vendas por hora/forma, top produtos, saída por item, despesa por categoria e total |
| marcador agregado | `agregadoDesde`, `geradoEm` |
| evento agregado | `eventoId`, `tipo`, `restaurantId`, timestamps |
| convite | id/token, `criadoPor`, `criadoEm`, `expiraEm`, `ativo`, `usadoEm?`, `usadoPorUid?` |

## Compatibilidade de timestamp

A normalização de `createdAt` e `updatedAt` para formato de API é centralizada em `services/base.py`. Dados antigos podem ter `criadoEm/atualizadoEm`, especialmente usuários. Ao criar uma consulta temporal, verificar o campo realmente usado no Firestore, o campo normalizado e o fuso.

## Regras de números

- Monetários: cálculo por `Decimal(str(value))` e HALF_UP em `calculos.py`; fronteira JSON devolve float.
- Quantidade de estoque: float, com arredondamento de movimentação/receita geralmente a três casas.
- Quantidade de itens de pedido: inteiro positivo.
- Não misturar gramas com quilogramas nem centavos inteiros com unidades de moeda.
