# Precificação de produtos

No cadastro e edição, a aba **Precificação** contém a receita, os custos e a sugestão para uma unidade do produto base.

- Custo de cada ingrediente = quantidade da receita × custo médio atual do estoque.
- A quantidade deve usar a unidade do estoque: 150 g de um item em kg = 0,15 kg.
- Preço sugerido = custo total × (1 + acréscimo percentual / 100), arredondado para cima em centavos.
- O percentual pedido é um acréscimo sobre o custo (markup). A margem sobre a venda é mostrada separadamente: (preço − custo) / preço × 100.
- O botão **Usar preço sugerido** copia a sugestão para o preço de venda. O preço pode ser ajustado manualmente; salvar confirma a alteração.
- `acrescimoLucroPercentual` persiste no produto. Produtos legados começam com 0%; edições parciais que omitem o campo preservam o valor existente.
- Receita vazia, item ausente, quantidade inválida ou custo não positivo impedem a sugestão. Produtos sem receita ainda podem ser salvos com preço manual.
- A sugestão usa os custos carregados do estoque e é recalculada ao alterar a receita ou o percentual. Não atualiza automaticamente os preços dos produtos já salvos.
- A estimativa não inclui taxas, impostos, despesas operacionais ou ingredientes extras de variações.

## Validação

- Frontend: `cd frontend && npm run test:precificacao && npm run build`.
- Backend: `cd backend && .venv/bin/python -m pytest tests/test_precificacao_produto.py -q` (Windows: `.venv\Scripts\python`).
- Manual: criar receita, informar 50%, aplicar sugestão, salvar e reabrir; conferir persistência. Exemplo: carne 0,15 kg × R$ 40/kg + pão 1 × R$ 2 = R$ 8; sugestão R$ 12; margem sobre venda 33,33%.
- Conferir também produto sem receita, custo ausente, edição manual do preço e layout em celular.
