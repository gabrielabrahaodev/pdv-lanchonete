---
title: Produtos e Categorias
tags: [regras, catalogo]
---

# Produtos e Categorias

## Categoria

Campos principais: `nome`, `ordem`, `ativo`, `icone`, `cor`. CRUD de escrita para admin/gerente/caixa. Categoria associada a produto não pode ser removida; backend deve retornar conflito (409).

## Produto

Campos principais: `nome`, `categoriaId`, `preco`, `precisaPreparar`, `variacoes[]`, `ingredientes[]`, `ativo`, `estoqueMinimo`, `temImagem`.
- `preco` deve ser maior que zero no modelo de criação.
- Variação traz ID, nome, preço adicional e flag ativa.
- Receita/ingredientes registra `itemId` e `qtd` por unidade do produto.
- Produto ou variação inativa não pode ser incluído em pedido (409).
- Preço efetivo é sempre calculado no backend: preço base + preço adicional da variação selecionada. Preço enviado pelo cliente não é autoridade.
- Tipo de produto que não exige preparo (`precisaPreparar=false`, por exemplo bebida) nasce com item `entregue`, fora da fila KDS.
- Mesmo sem KDS, se o produto sem preparo tiver receita, consumo de estoque ocorre na criação do pedido.

## Quantidade e dinheiro

- Quantidade do item do pedido é inteira e maior que zero (`OrderItemAdd`).
- Total do pedido é calculado no servidor com itens não cancelados.
- Política monetária em `calculos.py`: converter para `Decimal(str(valor))`, arredondar HALF_UP a centavos e só devolver float na borda da API.

## Imagem

- Imagem é armazenada separada do documento de produto para não pesar as listagens.
- Payload base64 até 200.000 caracteres; MIME permitido: jpeg, png, webp.
- Frontend comprime imagem antes de enviar, segundo docs técnicos.
- Produto mantém `temImagem` e, opcionalmente, `imagemUrl` externa.
- A API fornece bytes por endpoint público específico, com cache de 1 h segundo a documentação; excluir produto deve excluir documento da imagem.

## Fonte

`backend/app/services/produtos_service.py`, `pedidos_service.py`, `models/models.py`, routers `produtos.py` e `categorias.py`; frontend `pages/produtos/*`.
