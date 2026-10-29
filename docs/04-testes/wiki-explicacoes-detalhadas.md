# Wiki — explicações detalhadas

Escopo: 47 artigos, 49 exemplos hipotéticos, 206 campos descritos. Não altera operações, fórmulas financeiras, autenticação ou permissões. Campos calculados recebem fórmula, exemplo e condições de disponibilidade quando aplicável. Campos de texto recebem orientações de preenchimento/efeito, sem fórmula artificial.

## Conferência manual

1. Abrir Como usar esta tela? em Financeiro e navegar para Lucratividade por produto.
2. Em Campos da tela, conferir custos direto e teórico, médias por unidade, margens, diferença em pontos percentuais e cobertura. No detalhe do produto, cobertura usa quantidade; no resumo financeiro, usa receita.
3. Em Exemplos práticos, conferir venda de R$ 14,50 sem custo, mesma venda com custo R$ 5 e exemplo de cobertura parcial. Exemplos são explicitamente fictícios; nada é gravado.
4. Conferir FAQ: diagnóstico do custo ausente, diferença para precificação atual e limites de reconstrução histórica.
5. Em Resultados e Relatórios, conferir as fórmulas distintas: BI subtrai CMV e operacionais; legado subtrai despesas por competência. A compra de insumos não deve ser deduzida novamente junto ao CMV no BI.
6. Em Produzir, conferir a diferença entre rendimento previsto e realmente aproveitado; em Recebimento, unidade e valor total da linha; em Pagamento, valor aplicado, recebido e troco.
7. Abrir exemplos de outros módulos, usar busca e links do sumário. Alternar tema claro/escuro e celular/computador; campos e textos não devem cortar nem exigir rolagem horizontal.
8. Conferir que fechar a ajuda mantém rascunhos na tela original e que perfis não autorizados continuam sem acesso a artigos restritos.

## Automatização

- `npm run test:wiki`: estrutura/tipos de campos e exemplos, títulos únicos de campos, fontes/rotas, links, busca e acesso.
- `npm run test:wiki:explicacoes`: renderiza os 47 artigos em componentes reais com Auth/API simuladas e rede externa bloqueada; verifica fórmulas/exemplos/limites renderizados, âncora de exemplos e nenhuma consulta operacional ao ler. Testa os artigos mais longos em 320/360/390/430/768/1440px nos dois temas.
- `npm run test:wiki:ui`: ajuda em nova aba, navegação, rascunhos e responsividade existentes.
- `npm run build`, `npm run test:wiki:bundle` e `npm run test:wiki:pwa`: TypeScript/PWA, artigos lazy fora do precache e acesso offline do artigo visitado.

Os testes de navegador reutilizam o Playwright temporário dos testes Wiki; não adicionam dependência ao aplicativo. Não fazem operações em dados reais. A revisão editorial confrontou os exemplos com os serviços de BI, lucratividade, pedidos, produção e caixa e as regras documentadas de cada módulo.

Resultados locais: 8 testes Wiki aprovados; TypeScript e build PWA aprovados; 47 chunks de artigos fora do precache; renderização dos 47 artigos e seis larguras nos dois temas aprovadas; Wiki UI existente e cache PWA aprovados. A navegação para uma seção já selecionada também foi verificada e corrigida para repetir o salto, e o título respeita o botão fixo do menu no celular.
