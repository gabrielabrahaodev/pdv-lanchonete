# Padrão visual do PDV

A PR #30 evoluiu do piloto Estoque para a interface do sistema. Mantém React, Vite, TypeScript e Tailwind, sem biblioteca nova ou mudança nas regras de negócio.

- Ações: botão arredondado, primário laranja com contraste; secundário com borda discreta. `ButtonLink` usa uma única âncora com aparência de botão para navegação, sem aninhar botão em link.
- Densidade: altura mínima de 44px no celular para controles compartilhados; 36px nos botões/campos a partir de 1024px. Cabeçalhos, bordas, formulários e mensagens seguem o mesmo tema.
- Cores de status: fundos sutis com texto legível nos temas claro/escuro. Nenhum significado operacional depende apenas da cor.
- Listas: `.pdv-table` padroniza espaçamento. Categorias, sessões de caixa, histórico de delivery e convites usam `.pdv-records` e `data-label` para apresentar registros rotulados abaixo de 1024px. Produtos, Estoque, Fornecedores e rankings mantêm suas listas móveis específicas.
- Novo pedido: preserva adição direta, personalização, comanda lateral no desktop e barra fixa/gaveta no celular. Mudanças locais limitadas à aparência do catálogo, filtros e navegação.
- Cozinha: passa a respeitar tema do operador e cabeçalho padrão. Mantém fila, estados, tempo e ações de preparo.
- Financeiro e Relatórios mantêm fórmulas, períodos, cobertura, abas e consultas existentes. Não convertem custo desconhecido em zero.
- Login/seleção e Plataforma recebem ajustes de densidade e controles; cardápio público conserva composição própria e isolamento de autenticação, com ajuste pontual de contraste.

Componentes em `frontend/src/components/ui/index.tsx`, estilos opt-in em `frontend/src/index.css`. Componentes específicos do estoque permanecem para estados próprios do módulo. Evitar regras globais sobre `button`, `table` ou links, para não interferir na comanda, nos gráficos ou no cardápio público.

Validação: `docs/04-testes/visual-sistema.md`. Reversão da aparência por troca de branch não desfaz movimentos confirmados no banco. Sem merge/deploy nesta entrega.
