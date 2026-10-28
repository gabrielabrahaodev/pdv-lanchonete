# Reposição de insumos — recebimento retroativo e débito automático

## Regra implementada (PR para homologação)

Na tela **Reposição → Pedidos gerados → Reabastecer estoque**, o usuário escolhe **Data efetiva do recebimento** (padrão: hoje, no navegador). É possível selecionar uma data passada para lançamento retroativo; datas futuras são rejeitadas no frontend e no backend.

Ao confirmar, a mesma transação Firestore:
1. Confere que o pedido está no estado `gerado` e que não existe a despesa determinística daquela reposição.
2. Valida os insumos e lê saldos/custos atuais.
3. Recalcula o saldo atual e o custo médio ponderado; grava uma movimentação de entrada por insumo com a data efetiva (`dataMovimentacao`).
4. Gera **uma despesa financeira** em `despesas/items/reposicao_{pedidoId}`, com `categoria: insumo`, `status: pendente`, fornecedor, `pedidoReposicaoId`, descrição e valor total real da compra. O campo `data` representa a competência escolhida.
5. Atualiza **agregados diários/mensais do Financeiro** na competência selecionada, pelo mecanismo idempotente existente.
6. Marca pedido como `recebido`, vinculando `despesaId`, `valorTotalRecebido`, `dataRecebimento`, `dataRecebimentoLocal` e `recebidoEm` (momento real da operação).

Os campos financeiros e movimentos usam datas com fuso configurado no backend (padrão `America/Sao_Paulo`); o dia selecionado é representado pelo **meio-dia local** para evitar deslocamentos de data na conversão UTC.

## Diferença entre débito e pagamento

O recebimento **gera despesa pendente de pagamento**, mas **não movimenta sessão de caixa nem afirma que o fornecedor foi pago**. No Financeiro, o operador poderá marcá-la como paga quando ocorrer o pagamento real. As despesas integram o resultado gerencial por competência independentemente do status, conforme regra atual.

Os dados de valor, competência, fornecedor e descrição de despesas geradas por reposição não podem ser editados livremente nem excluídos do Financeiro, para não descolar o débito da entrada física. A ação de marcar paga/reabrir continua disponível.

## Compatibilidade e idempotência

- Pedidos antigos ainda no estado `gerado` podem ser recebidos com a nova interface, fornecendo a data.
- Pedidos anteriormente `recebido` não sofrem criação retroativa de débitos (não há migração automática).
- Uma reposição cria uma única despesa. Repetir POST de recebimento retorna conflito e não duplica estoque, movimentações, despesa ou agregado.
- O registro retroativo **não recalcula consumos históricos, preços de venda ou custos já realizados**. O estoque atual é ajustado na data da operação técnica, mantendo a data civil de referência para auditoria. A competência financeira retroativa é somada no dia/mês selecionado.
- Se todas as linhas tiverem custo zero, o recebimento é rejeitado para não criar débito fictício de R$ 0.
- Documentos e referências continuam segregados por `restaurantId`.
- Nenhuma integração automática com cobrança, cartão, banco, contas a pagar externas ou API fiscal.

## Testes de homologação

- [ ] Selecionar hoje e data de mês anterior; confirmar a competência da despesa e seus agregados.
- [ ] Confirmar que data futura/inválida é recusada.
- [ ] Receber itens com quantidades/custos alterados; conferir valor total e cálculo da média ponderada.
- [ ] Ver despesa com fornecedor e vínculo ao pedido, inicialmente `pendente`.
- [ ] Marcar a despesa como paga, depois reabrir.
- [ ] Verificar que edição/exclusão da despesa vinculada é bloqueada.
- [ ] Tentar reabrir/repetir recebimento do mesmo pedido, inclusive após erro de rede.
- [ ] Conferir isolamento entre restaurantes e ausência de alterações em sessões de caixa.
- [ ] Testar no celular e desktop, especialmente datas e valores com vírgula decimal.

## Consulta histórica separada
Pedidos recebidos ficam exclusivamente em `/reposicao/recebidos`; cancelados em `/reposicao/cancelados`. A lista não consulta despesas por cartão. Ao abrir detalhes, o operador pode consultar o único débito vinculado; só então ocorre GET da despesa, com tenant/papel na chave de cache. Datas de criação, recebimento efetivo e registro são mostradas separadamente. Histórico antigo sem determinados campos mostra “Não registrado”, sem inferir valor zero.

Novo recebimento também guarda nome do responsável quando disponível no perfil autenticado, sem consulta extra; UID histórico permanece como fallback. Quantidade comercial, quantidade de controle, total por linha e total da compra vêm dos snapshots existentes. Não há edição ou novo recebimento na tela histórica. A transação original de saldo/custo/despesa/evento continua preservada.
