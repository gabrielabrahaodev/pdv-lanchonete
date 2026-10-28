# Financeiro — lucratividade por produto

Seção em `/financeiro`, com períodos 7/30/90 ou intervalo civil personalizado, produto, categoria histórica e variação observada. Consolidado/ranking vem do mesmo payload; evolução do produto só é carregada ao selecionar. Sem baixar vendas individuais. Categorias/fornecedores auxiliares são lazy.

KPIs: unidades, receita atribuída, preço médio, custo direto conhecido, custo teórico snapshot, custo médio unitário, margem teórica, margem realizada da receita coberta, diferença p.p., lucro bruto coberto e cobertura. Campos desconhecidos aparecem indisponíveis. Alerta determinístico de custo incompleto e margem abaixo da meta. Não inferir aumento de custo de ingrediente ou preço abaixo do cadastro sem referência compatível. Ranking por receita/volume/lucro bruto coberto/margem coberta usa rótulos distintos.

Metadados históricos não asseguram nomes/categorias imutáveis em cada venda dentro do mesmo agregado: último nome/categoria pode prevalecer. Valor monetário não depende do cadastro atual. Compras por fornecedor começam a ser capturadas nos eventos de despesa desta versão; histórico sem esse mapa fica incompleto. Margens não abrangem impostos, taxas e indiretos não alocados.

## Ranking e detalhe
A listagem inicial agora é tabela no desktop e lista compacta no celular, com produto, quantidade, receita, custo conhecido, lucro/margem cobertos e cobertura. As métricas extensas e evolução são mostradas apenas para o produto selecionado pelo botão/controle. Filtros e ordenações reutilizam os dados já carregados; selecionar detalhe preserva snapshots e o cache de fontes. Cenário de 62 produtos é coberto pelo runner UI, sem criar 62 consultas de produto/receita.
