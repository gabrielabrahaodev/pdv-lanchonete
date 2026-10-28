# Custos de insumos por unidade comercial

> Proposta em revisão — validar antes do merge. Não migrar automaticamente unidades ou dados históricos.

## Decisão
O operador informa o **valor TOTAL da compra** e a quantidade/unidade compradas. O sistema converte a quantidade para a unidade de controle e calcula o custo médio ponderado, sem exigir que a pessoa digite R$ 0,008/g.

Exemplo: estoque de farinha em `g`, compra de 2 `kg` por **R$ 16,00**.
- Quantidade recebida no controle: **2.000 g**
- Custo da entrada calculado internamente: **R$ 0,008/g**
- Exibição para o responsável: **R$ 8,00/kg**
- Receita de 150 g: **R$ 1,20**, sem arredondar o custo por grama primeiro.

## Implementação
- `backend/app/services/unidades.py`: conversão existente preservada e função `custo_medio_entrada` usando `Decimal` para ponderar por **valor total da linha**, mantendo oito casas no custo interno. Valida preços monetários com centavos.
- `backend/app/services/estoque_service.py`: `Movimentar → Entrada / compra` usa a mesma função para a média ponderada.
- `backend/app/services/reposicao_service.py`: recebimento aceita o contrato novo `quantidadeCompra`, `unidadeCompra`, `valorTotalCompra`, e continua aceitando o contrato antigo `quantidade`, `custoUnitario` para clientes legados; misturas incompletas são rejeitadas.
- O pedido de reposição faz snapshot da unidade comercial e fator na data de emissão. Se ela for `cx` ou `pct`, usa o fator por insumo para converter a quantidade. A mesma transação ainda registra débito financeiro pendente, data de competência, movimentos e saldo.
- `frontend/src/lib/custosInsumos.ts`: lógica compartilhada de apresentação e prévia de compra, reutilizando `converterQuantidade`.
- Cadastro/edição de insumos: campo de **preço de referência**, como R$/kg, R$/L, R$/cx, R$/pct; custo médio interno é convertido no envio.
- Movimentar: continua usando quantidade em unidade escolhida e valor total; prévia com custo por unidade de referência em vez de valor minúsculo por grama.
- Reposição: usuário seleciona quantidade comercial, unidade e valor total por insumo; valor é utilizado para débito financeiro sem arredondar o custo por grama primeiro. Mantém data retroativa e proteção contra duplicidade.
- Precificação: continua calculando custo proporcional pela receita, mas apresenta o custo de referência por kg/L/embalagem.

## Compatibilidade e limites
- Insumos já existentes mantêm exatamente a unidade de controle, saldo, receitas, consumo e custo médio armazenados; **não há migração ou troca silenciosa de unidade**.
- O usuário pode continuar definindo g/ml nas receitas. O estoque armazena precisão de 3 decimais por unidade de controle; custo médio com até 8 casas decimais.
- Para embalagens, `fatorCompra` significa **quantas unidades de controle há em uma caixa/pacote**. Não inferir peso de caixa automaticamente.
- A estimativa visual no frontend não substitui as validações no backend.
- A edição de preço de referência no cadastro ainda representa correção administrativa de custo e é registrada no histórico, não constitui lançamento de compra ou débito.
- Entradas manuais em `Movimentar` continuam sem gerar despesa financeira automaticamente (regra separada do fluxo de Reposição).
- Reposição gera despesa pendente pela soma dos valores totais reais recebidos, em centavos, em operação atômica.
- A API mantém compatibilidade temporária para clientes PWA antigos; descontinuar entrada legada apenas com plano de versão.
- Custos históricos de vendas/produções não são recalculados retroativamente.

## Testes recomendados
1. Ingrediente em g comprado em kg; 150 g de receita.
2. Leite em ml comprado em L; preço por litro.
3. Pacote de 500 g e caixa de 12 unidades, com fator específico por insumo.
4. Média ponderada com saldo positivo, zero e negativo.
5. Preço total de R$ 16,00 preservado no débito; sem preço unitário arredondado a centavos.
6. Proteção contra unidade incompatível, custo inválido, centavos excedidos e recebimento em duplicidade.
7. Pedidos gerados antes da mudança e produto com valor unitário abaixo de um centavo.
8. Responsividade, tema escuro, edição de insumo existente e alterações de embalagem.
