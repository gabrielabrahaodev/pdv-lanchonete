# Wiki integrada e ajuda contextual — validação

Base: master `5cbe450041895993d577f040322ebf55bb5e4a75`, consultada no GitHub e via fetch.
Branch: `feat/wiki-ajuda-contextual`. Sem merge, deploy, migração ou alteração de dados reais.

## Entrega e cobertura

| Medida | Resultado |
|---|---:|
| Telas funcionais existentes inventariadas | 27 |
| Telas existentes com artigo | 27 |
| Telas privadas com ajuda contextual | 25 de 25 |
| Artigos | 47 |
| Categorias | 8 |
| Telas operacionais sem cobertura | 0 |

Exceções do controle contextual: `/login` (desautenticada) e `/m/:restaurantId/:mesaId`
(cardápio público isolado). Ambas possuem artigo na Wiki autenticada. Redirects e wrappers
não são telas. `/wiki` e `/wiki/:artigoId` são a central nova e usam busca/sumário próprios.

O inventário completo é `frontend/src/wiki/manifesto.json`: rota, tela, componente,
artigo, classificação, fontes Obsidian, palavras-chave e relacionados. Os artigos
contêm campos, requisitos, ações e efeitos. Financeiro tem ajuda nas 7 seções;
Produto em Dados/Precificação; Reposição em geração/aguardando; Produção em Estufa/Produzir/Histórico.
Links adicionais atendem recebimento, insumos, movimento, despesas, usuários, reservas e perdas/conversão.

## Testes automatizados locais

- `npm run test:wiki`: estrutura/IDs/links/fontes, AST de rotas e abas, índice atualizado,
  busca/acento/sinônimos/campos, permissões, retorno e consulta privada efêmera.
- Suítes frontend existentes: precificação7, unidades10, segurança3, foco de modal3,
  cardápio10 e reposição3 — 36 testes. Com os 7 da Wiki, total43.
- TypeScript e build Vite/PWA passaram. Aviso preexistente de chunk Firebase >500 kB permanece.
- `npm run test:wiki:ui`: Chromium, componentes reais e roteador, Auth/API/Firestore simulados.
  Abre ajuda e retorna nas25 telas privadas. Verifica formulário de produto e modal de insumo
  preenchidos, Escape só na ajuda, abas de Resultados/Lucratividade/Contas a pagar,
  pesquisa sem chamadas API novas, âncora, voltar/avançar e acesso restrito por perfil.
- UI em320,360,390,430,768,1440px: claro/escuro, sem overflow horizontal; teclado e foco.
- `npm run test:wiki:bundle`:47 chunks de artigos, nenhum no precache; corpos/índice fora
  dos chunks iniciais; cache estático presente.
- `npm run test:wiki:pwa`: preview de produção e service worker reais. Inicialização do
  aplicativo autenticado interceptada para não acessar Firebase. Confere cache vazio de
  artigos inicialmente, visita um artigo, confirma CacheFirst e fetch offline do visitado.

Os scripts UI/PWA iniciam e encerram o servidor local no próprio processo. Playwright é
ferramenta de teste, sem dependência de runtime da aplicação. No CI, instalação temporária
fixa1.51.1 (fora do package.json da aplicação), seguida de Chromium Headless Shell.
Todos esses testes estão integrados ao job frontend do CI. Resultado remoto será registrado na PR.
A primeira execução remota revelou que o banner de inicialização do Vite não é uma
condição de disponibilidade confiável no CI. O runner passou a esperar HTTP local
(com timeout e logs de erro), também validado com CI=true, sem remover asserções de tela.

## Bundle e custo

Medição local comparada à build da base, mesmas dependências:
- AppAutenticado: base32,08kB (gzip9,54kB); Wiki43,99kB (gzip12,50kB): acréscimo
  aproximado11,91kB bruto /2,96kB gzip para mapa, controle e roteamento contextual.
- WikiPage + índice:83,95kB (gzip26,72kB), sob demanda.
- Overlay:1,47kB (gzip0,76kB), sob demanda.
-47 artigos somam87,19kB de JS bruto em chunks individuais; não baixados todos na instalação.

O índice e a projeção são gerados no desenvolvimento, versionados e verificados no CI.
Nenhuma coleção, endpoint ou listener de documentação foi adicionado. Conteúdo/busca não
fazem leituras Firestore. Autenticação/layout e listeners operacionais preexistentes permanecem;
a tela preservada sob a ajuda continua montada. Não prometer zero leituras totais da sessão.
Artigos com hash visitados usam CacheFirst (até60 entradas/um ano). Nunca visitados podem
precisar de rede; falha é exibida. Respostas privadas continuam NetworkOnly.

## Correção da documentação financeira solicitada

Conferida no backend, sem alterar fórmulas:
- `/financeiro`, `FinanceiroBI.tsx` / `bi_service.py`: receita − custo direto vendido −
  operacionais, com cobertura integral; desconhecido fica indisponível.
- Contrato legado de Relatórios: faturamento − despesas por competência. CMV estimado
  informativo; não o descontar mais uma vez.
- Exemplo: receita100, compras40, CMV20 e operacionais10 → BI70 com cobertura, legado50.
- Nenhum deles é lucro líquido contábil; despesa paga não é saída automática da sessão de caixa.
- Corrigida também atribuição indevida de receita automática à tela Delivery independente.

Notas de domínio Financeiro/Relatórios, RN-18 e Financeiro-Regras-Contabeis atualizadas;
manual explica as medidas por tela sem tratá-las como equivalentes. Defeito antigo de
get_all(*refs) deixa de ser descrito como falha vigente: código da master já corrigido.

## Homologar no localhost

1. `git fetch origin`; `git switch feat/wiki-ajuda-contextual`; `git pull --ff-only`.
2. Instale dependências: `cd frontend`; `npm ci`; `npm run dev`.
3. Com backend local configurado para um ambiente de teste, entre e abra Wiki no menu,
   imediatamente acima de Configurações. Não use os scripts destrutivos de limpeza.
4. Teste busca com/sem acento: precificação/precificacao, receber mercadoria,
   custo por quilo, pagar despesa, CMV e lucro indisponível. Confirme destaque e links.
5. Em Estoque, abra ajuda; volte. Abra Novo insumo, preencha sem salvar, abra o link de
   ajuda do formulário; Escape deve voltar ao mesmo modal preenchido.
6. Repita em cadastro de produto, abas de Precificação, Financeiro/Resultados,
   Contas a pagar, Lucratividade, Produção e históricos de Reposição.
7. Cole URL direta `/wiki/recebimento`; navegue por relacionados/sumário, atualize,
   use voltar/avançar. URL inválida deve dar mensagem, sem tela branca.
8. Confira perfis: garçom/cozinha não veem artigos financeiros restritos; admin de loja
   não vê o artigo Plataforma sem autorização de dono. Teste logout e troca de restaurante.
9. Teste320–430px, tablet e desktop, temas claro/escuro, Tab/Shift+Tab/Escape e foco.
10. Para PWA: `npm run build`; `npm run preview`. Instale em dispositivo de teste,
    visite artigos e confira leitura offline do visitado. Artigo ainda não visitado
    pode falhar offline; ações de venda continuam dependendo de rede.

Para reproduzir UI sem qualquer dado real, instale Playwright em diretório temporário,
configure PLAYWRIGHT_MODULE para o pacote e execute `npm run test:wiki:ui` e
`npm run test:wiki:pwa` (este após build). Não é necessário login/credencial nesses testes.

## Limitações e revisão pendente

Testes automatizados não substituem homologação com pessoas da operação, leitor de tela
humano ou instalação em celular físico. Nenhum desses três foi declarado aprovado.
A revisão semântica de artigos exige manter código/Obsidian coerentes; testes detectam
estrutura e cobertura, não toda interpretação contábil. Rascunhos são preservados em memória
na ajuda contextual, não depois de F5/fechar navegador. Não há mudanças de regra financeira,
estorno, integração fiscal ou operação offline de vendas nesta PR.
