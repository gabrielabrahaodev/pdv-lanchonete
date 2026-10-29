# Wiki e central de ajuda

Manual operacional em português, baseado na master `5cbe450` (28/10/2026).
Revisadas as PRs recentes #17–#24 e a #25 aberta (limpeza, fora desta implementação).
A Wiki não executa migração, limpeza, deploy ou alteração de regras operacionais.

## Arquitetura e inventário

- `frontend/src/wiki/manifesto.json`: manifesto interno, 27 telas documentáveis existentes,
  componentes, artigos, categorias, fontes Obsidian, palavras-chave, classificação por perfil e relacionados.
- `conteudo/<categoria>/wiki-artigo-<id>.json`: 47 artigos em oito categorias.
  A edição do manual não exige alterar JSX. Campos estruturados incluem finalidade,
  quando usar, passos, campos/requisitos, ações/efeitos, consequências, atenção, dúvidas e relacionados.
- `navegacao/mapa.json`: projeção compacta gerada, usada para mapear rota/perfil/aba.
  Evita importar todas as fontes técnicas e conteúdo no aplicativo inicial.
- `indice/busca.json`: índice textual estático gerado dos títulos, palavras-chave e conteúdos.
- `WikiPage.tsx`: home, categorias, pesquisa, sumário, artigo e relacionados.
- `componentes/AjudaContextual.tsx`: único controle de ajuda, com artigo/âncora opcionais.
- `WikiOverlay.tsx`: ajuda sobre a tela anterior preservada, em portal com isolamento de foco.

`/wiki` e `/wiki/:artigoId` têm autenticação existente. O layout da loja é reutilizado
quando há restaurante; onboarding/dono sem tenant usam shell autenticado sem listeners da loja.
Menu Wiki imediatamente acima de Configurações. Não há endpoint/coleção novos.

As 25 telas privadas existentes têm ajuda. As duas públicas (login e cardápio QR)
têm artigos disponíveis após autenticação, mas não botão para entrar em documentação privada.
O QR continua sem AuthProvider nem dependência da Wiki. A própria Wiki usa seu sumário/busca,
não abre outra ajuda contextual sobre si. Redirects e wrappers não são telas documentáveis.
`FinanceiroPage.tsx` é componente compartilhado/legado; `/financeiro` monta `FinanceiroBI.tsx`.

## Contexto, permissões e retorno

`PageHeader` infere rota e artigo, sem duplicar lógica. Cabeçalhos próprios usam o mesmo
AjudaContextual. Financeiro (7 seções), Produto (2), Reposição (2) e Produção (3)
usam `artigoDaSecao`. Operações de recebimento, insumo, movimento, despesa, usuários,
perda/conversão e conferência de reservas têm links específicos adicionais.

Ajuda navega para URL estável da Wiki. A origem fica somente em `history.state`:
rota, identificação da sessão/tenant e rótulo; não põe token, convite ou formulário na URL.
Ao abrir, as Routes mantêm a página de origem montada sob um portal. Formulários,
modais, abas, filtros e carrinho permanecem em memória. O fundo fica `inert`, há armadilha
de Tab, Escape próprio e restauração de foco. Links entre artigos mantêm a origem.
O retorno revalida papel/tenant/usuário e só aceita rota interna inventariada e autorizada.
Não depende de referrer nem aceita URL externa; a query preservada é apenas `?add=1`.

Recarregar/F5 não conserva rascunhos em memória. Troca de usuário/tenant/papel invalida
origem incompatível. Artigos financeiros/gestão/plataforma são filtrados da navegação,
busca e acesso direto pelo perfil atual. Conteúdo é estático e não contém dados/segredos:
essa classificação de apresentação não substitui segurança de dados nas APIs.

## Busca

Local, enquanto digita, normaliza acentos/caixa, ignora palavras de ligação, expande
sinônimos (mercadoria/recebimento, kg/quilo, comanda/pedido etc.) e classifica título,
palavras-chave e texto. Todos os termos úteis devem estar cobertos. Resultados têm
destaque seguro em React (sem HTML injetado), links diretos e mensagem vazia.
A busca inclui campos, botões e dúvidas, sem serviço pago nem leitura Firestore/API.

## Carregamento e cache

WikiPage e índice só entram quando a Wiki é aberta. Artigos usam `import.meta.glob`
assíncrono, um chunk por arquivo; não são importados com eager. O PWA exclui chunks
`wiki-artigo-*` do precache para não baixar todos ao instalar. Depois de visitar,
CacheFirst mantém chunks estáticos com hash (até 60 entradas/um ano); artigo nunca visitado
pode exigir rede. A página trata falha de carregamento. Outros chunks da aplicação
continuam com a estratégia existente. Respostas autenticadas da API continuam NetworkOnly.

Zero leituras adicionais para conteúdo e busca. Autenticação, layout/alertas de estoque
e listeners já existentes na tela de origem continuam funcionando; não atribuir essas
leituras ao conteúdo estático. A ajuda preserva a tela montada, inclusive seus listeners.

## Manutenção obrigatória

1. Cadastre nova tela no manifesto com rota exata, componente, artigo, acesso e fontes.
2. Crie JSON com todas as seções e referências reais; não invente recursos futuros.
3. Inclua palavras-chave/sinônimos úteis. IDs/URLs não devem mudar para renomear títulos.
4. Adicione ajuda no PageHeader/cabeçalho; se houver abas, atualize o mapa de seções
   e a validação que compara suas chaves aos valores reais do componente.
5. Adicione relacionados existentes. Âncoras estáveis: `para-que-serve`, `quando-utilizar`,
   `como-utilizar`, `campos`, `acoes`, `depois`, `atencao`, `duvidas`, `veja-tambem`.
   Ex.: `<AjudaContextual artigo="despesas" ancora="campos" />`.
6. Em `frontend`, rode `npm run wiki:indice` para atualizar busca e projeção compacta.
7. Rode `npm run test:wiki`, TypeScript/build e validação UI.

O teste AST extrai as rotas reais de App/AppAutenticado e compara inventário; rejeita
rota sem artigo, artigo/título/categoria/ID/estrutura inválidos, arquivos órfãos, fonte
inexistente, relacionados e ajuda quebrados, aba sem mapeamento ou índice desatualizado.
Esse teste não prova correção semântica de toda frase: revisão funcional continua obrigatória.

## Correção da documentação financeira

A nota de domínio Financeiro, CMV e Resultado e a RN-18 agora distinguem explicitamente:
- BI em `/financeiro`: receita − CMV − operacionais, com cobertura completa.
- Contrato legado de Relatórios: faturamento − despesas por competência, sem descontar CMV novamente.

Exemplo receita100, compras40, CMV20, operacionais10: BI70 (com cobertura) e legado50.
Não são a mesma medida. Corrigida também a afirmação de receita automática do módulo
Delivery: a implementação independente não quita pedidos nem movimenta caixa/estoque.
A Wiki informa limites em linguagem de operação, sem mudar fórmula no backend.

## Homologação e limites

Ver `docs/04-testes/wiki-ajuda-contextual.md` para resultados e roteiro.
Leitor de tela humano, sessão real do cliente e instalação em dispositivo físico requerem
homologação; testes de UI usam dados simulados e não alteram Firebase. Não declarar
produção aprovada a partir deles. Acesso offline a artigo nunca visitado não é garantido.

## Ajuda contextual em nova aba e atualização de versão

O controle **Como usar esta tela?** abre /wiki/<artigo> em uma nova aba
(`target="_blank" rel="noopener noreferrer"`). A tela original não navega,
preservando pedidos, carrinho, modais e rascunhos em memória. O menu principal
**Wiki** permanece na aba atual. Links de temas internos são compactos e discretos.
A sobreposição antiga fica como compatibilidade legada, mas deixa de ser o caminho normal.

Versionamento: veja [[Versionamento-e-Atualizacao-PWA]]. Cada build Vite emite
`dist/version.json` e embute o SHA do commit no bundle. O Hosting não deve
cachear `/version.json`. O cliente compara em rede sem consultar o Firestore,
exibe aviso e disponibiliza **Forçar atualização** em Configurações. A recarga
depende de confirmação explícita para evitar perda de formulários não salvos.

## Explicações e exemplos por campo

Os 47 artigos foram ampliados para explicar o que os dados significam e como tomar uma decisão, além da sequência de cliques. Cada artigo contém exemplos práticos fictícios, com situação, resultado e interpretação, e dúvidas específicas do fluxo. Campos calculados podem incluir fórmula, exemplo e condições de disponibilidade. A apresentação dos campos usa blocos com rótulos no celular e alinhamento em colunas no desktop; sumário e âncoras existentes são preservados e foi acrescentada a seção Exemplos práticos.

Lucratividade detalha os 12 indicadores, cobertura por quantidade, referências históricas, divisores e exigência de cobertura completa na comparação de margens. O indicador geral de cobertura do Financeiro usa receita. Indisponível não é custo zero; corrigir cadastros não recompõe automaticamente vendas antigas. Sob pedido pode ter referência e realizado iguais; não há medição automática de todas as perdas. No Caixa, os totais da sessão são creditados na quitação, não em cada pagamento parcial isolado.

Padrão editorial para novas alterações: explicar significado, origem/base do cálculo, fórmula quando aplicável, exemplo com unidade/valor, motivo de ausência e ação de diagnóstico possível. Nunca prometer uma correção retroativa inexistente nem tratar fórmula BI e legado como a mesma medida. Evitar fórmulas artificiais para campos de texto. Exemplos não consultam o banco, não usam credenciais de clientes e não são uma simulação executável de estoque/venda.

Validação: tipos/índice de busca, estrutura de todos os artigos, renderização dos 47 artigos, responsividade detalhada em 320/360/390/430/768/1440px, temas, navegação, busca e PWA. Guia complementar em `docs/04-testes/wiki-explicacoes-detalhadas.md`. Nenhuma regra financeira ou de estoque alterada.
