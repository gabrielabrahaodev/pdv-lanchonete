---
title: Estoque e Baixa Automática
tags: [regras, estoque, receita]
---

# Estoque e Baixa Automática

## Item de estoque

Campos: `nome`, `unidade`, `quantidadeAtual`, `minimo`, `custoMedio`. Unidades são texto (por exemplo `kg`, `g`, `un`, `L`, `ml`); o código de consumo soma quantidades numericamente, portanto a unidade usada na ficha técnica precisa ser coerente com a unidade do item. Não presumir conversão universal automática entre g/kg ou ml/L.

## Movimentação manual

- `entrada`: novo saldo = saldo atual + quantidade.
- `saida`: novo saldo = saldo atual − quantidade.
- `ajuste`: quantidade informada representa o novo saldo (não é incremento).
- O service registra tipo, `itemId`, quantidade, `saldoApos`, observação/usuário e timestamp na mesma transação que altera saldo.
- Quantidade da requisição deve ser maior que zero; no ajuste, a quantidade positiva é interpretada como saldo alvo.
- Alerta quando `quantidadeAtual <= minimo`.

## Baixa automática por receita

- Receita do produto: lista de ingredientes; cada ingrediente inclui `itemId` e `qtd` consumida por unidade vendida.
- Consumo agregado por ingrediente = soma da quantidade na receita × quantidade do item no pedido; arredondamento de quantidade em 3 casas.
- Configuração `baixaEstoqueAutomatica` controla a baixa.
- Ao mover item de `pendente` para `preparo`, baixa ingredientes do produto, marca `baixadoEm` e cria movimentos com `pedidoId`.
- Produto `precisaPreparar=false` nasce `entregue`; com receita, baixa ocorre durante criação/adicionamento.
- Receita vazia, ingrediente sem ID ou quantidade ≤ 0 não gera consumo para esse ingrediente.
- Ingrediente de estoque inexistente é tratado permissivamente (não deve travar preparo); a documentação permite que saldo resultante seja negativo para não bloquear a operação.
- Cancelamento posterior à baixa não reverte automaticamente o estoque.

## Custo médio e CMV

O custo médio é armazenado no item. O relatório atual estima CMV multiplicando saídas ligadas a pedido pelo custo médio **atual**, não por custo histórico imutável. Mudanças de custo médio podem alterar a estimativa histórica, então o CMV é apenas informativo.

## Riscos práticos

> [!warning] Unidades
> Se um item está em kg e a receita grava `150` pensando em gramas, o sistema não corrige isso automaticamente. Registrar `150` consumidos de batata por produto gera saldo e CMV absurdos. Validar a ficha técnica e a unidade antes de popular dados de demonstração.

> [!warning] Movimentações de demonstração
> Scripts de seed devem registrar consumo dentro da unidade correta, vincular saída ao pedido e ter lote/ID identificável para limpeza. Não restaurar saldo manualmente sem comparar movimentos posteriores reais.

Fontes: `backend/app/services/estoque_service.py`, `pedidos_service.py`, `calculos.py`, `agregados_service.py`, modelo Pydantic `InventoryItem`/`ProductIngredient`.
