# Estoque — piloto visual

Branch `feat/estoque-visual-piloto`, baseada na master `3fed252`.
Experimento visual para avaliação do usuário, sem merge ou deploy automático.

## Escopo

A rota continua `/estoque`. Tela reorganizada: cabeçalho e ações, resumo compacto
(ativos/alertas/arquivados), busca/filtros/CSV numa barra, tabela no desktop e lista no
celular. Alertas mantêm cores leves; saldo zero/negativo em alerta recebe rótulo Sem saldo.
Os totais consideram o estoque carregado, não apenas o filtro. Últimas movimentações
fica em seção expansível abaixo da lista, com os mesmos movimentos já carregados.

Componentes em `pages/estoque/EstoqueVisual.tsx` são locais ao piloto. CSS global,
componentes compartilhados, sidebar e demais telas permanecem com o visual anterior.
Não adiciona bibliotecas, listeners, consultas ou endpoints. Modais de cadastro e
movimentação, validação comercial, chaves de idempotência e permissão continuam existentes.
A consulta histórica por item continua sob demanda. CSV continua exportando a lista filtrada.

## Reversibilidade

Trocar de volta para `master` e reiniciar o frontend restaura o visual anterior.
Sem migração, mudança de schema ou flag persistida. Se realizar cadastro/movimentação
durante o teste, isso é uma operação normal: mudar de branch não desfaz dados gravados.
Os testes automatizados usam dados/API/Auth simulados e não acessam produção.

## Validação e decisão

`frontend/tests/estoque-piloto-ui.cjs` exercita responsividade, temas, filtro, CSV,
histórico lazy e contratos dos formulários. Roteiro em
`docs/04-testes/estoque-piloto-visual.md`. Avaliar visualmente antes de estender a outras telas.
