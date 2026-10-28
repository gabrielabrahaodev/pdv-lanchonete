# Financeiro — navegação e indicadores

## Base e alterações
Base master `d888359`, com PRs #17–#21 já incorporadas. Branch dedicada `feat/financeiro-bi-usabilidade`. Sem merge/deploy e sem dados produtivos.

- Visão geral: resumo executivo, seis indicadores no máximo (contas sob solicitação), alertas explicáveis e receita versus operacionais.
- Resultados: demonstrativo receita/CMV/lucro bruto/operacionais/resultado, compras separadas, percentuais, cobertura, comparação anterior e gráficos próprios. Valores calculados no Python.
- Receitas: somente indicadores e gráficos de vendas; compras por fornecedor e despesas ficaram em Resultados.
- Despesas: CRUD preservado, período aplicado à API paginada por `data_inicio` e `data_fim` civis. Backend traduz ao início/fim do dia no fuso configurado, usando índice simples existente `data`. Parâmetros legados inicio/fim permanecem aceitos.
- Contas: compromissos por vencimento, fora do período de vendas; competência/pagamento apresentados separadamente.
- Lucratividade: tabela desktop/lista mobile, detalhes extensos só após selecionar um produto; rankings/filtros/snapshots preservados.
- Previsibilidade: cenários existentes e resumo de compromissos conhecidos, com acesso à seção Contas, sem repetir a lista.

## Backend e cache
`GET /bi/visao-geral` acrescenta `indicadores` a partir dos agregados já lidos: lucro bruto, margem integral/coberta, CMV/receita, operacionais/receita, variação das despesas e cobertura. Não cria endpoint por KPI. `GET /bi/contas-a-pagar` acrescenta resumo calculado no mesmo bloco já consultado, com limite/aviso de parcialidade.

Após commit econômico de despesas/recebimento, invalida cache Python apenas do restaurante. React invalida chaves afetadas por tenant. Pagar/reabrir não recalcula resultado por competência, apenas despesas/contas. Sem leituras de pedidos ou ingredientes para apresentar os novos indicadores.

Visão geral ↔ Resultados: 0 consultas adicionais por troca (mesma query montada). Ranking de 62 produtos usa o mesmo payload. Resumo de contas opt-in: só acrescenta a consulta de até 201 documentos quando solicitado ou ao entrar em Contas/Previsibilidade; já existia nessas seções. Resumo estatístico novo: 0 leituras extras. Estimativas de requisições/limites, não medição de quota produtiva. Cache de fontes e TTL30s preservados.

## Validação
- 275 pytest aprovados; inclui fórmulas sem dupla compra, custo desconhecido, invalidação isolada por tenant e competência próxima à meia-noite de São Paulo.
- 36 testes frontend existentes, TypeScript/build PWA e regressão visual com API simulada em 320/390/768/1024/1440px, claro/escuro, incluindo ranking com62 produtos, abas diferentes, uma chamada compartilhada do painel e filtros de datas na requisição de despesas.
- Rules e scripts existentes produção/balcão/evolução/BI/paginação passaram no emulador local; cenário novo confirma período civil filtrado pelo SDK real e cache do BI atualizado após commit.
- Cenário novo de usabilidade integrado ao script `bi_emulator.py`, já executado pelo CI. GitHub Actions precisa ser conferido por execução; testes locais não equivalem a CI nem login real.

## Homologação
1. Abrir `/financeiro`: comparar Visão geral e Resultados, explicações e indisponibilidade de custo.
2. Conferir receita100/CMV20/operacionais10/compras40: resultado70, não30; comparar com a API.
3. Aplicar um dia em Despesas e validar no Network os parâmetros civis e cursor. Criar/editar/excluir e conferir atualização dos indicadores; pagar/reabrir não muda resultado.
4. Ranking62 produtos: ordenar por receita/volume/lucro/margem coberta e selecionar detalhe/variação. Zero não deve substituir custo ausente.
5. Previsibilidade não deve mostrar lista inteira; conferir resumo/vencimentos/hipóteses, com e sem histórico suficiente.
6. Conferir autorização admin/gerente/caixa; garçom/cozinha bloqueados; outro restaurante sem vazamento. Testar teclado, foco, PWA e temas.

Sem novos índices nesta PR. Backend e frontend devem ser disponibilizados de forma coordenada após homologação para o novo payload de indicadores. Histórico sem snapshots mantém suas limitações e resultado não é lucro líquido contábil. Ver notas Financeiro-* no Obsidian.
