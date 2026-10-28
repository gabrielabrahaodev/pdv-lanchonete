# Relatório técnico de entrega - evolução operacional

Branch: `feat/nexocomanda-evolucao-operacional`, baseada na master `bd3a34a`.
Sem merge, deploy, migração destrutiva ou modificação de dados reais.

## Implementação por fase

1. **Mesas/KDS:** quitação local encerra operação e libera mesa em transação, sem
   alterar os estados físicos. Reservas não comprovadas ficam indisponíveis até
   conferência auditada. Parcial não encerra; balcão continua independente.
2. **Estoque:** edição, arquivo/reativação, histórico individual e exclusão protegida;
   saldo auditável; compra em unidade diferente, fator de embalagem, média ponderada
   e chaves de repetição. Custos novos congelados nas saídas e agregados.
3. **Produção/Estufa:** fluxo em três etapas, rendimento previsto automático até
   ajuste manual, revisão de ingredientes/saldo, filtros por situação/local,
   indicadores por lote e confirmação de operações físicas.
4. **Precificação:** unidade do ingrediente selecionável, custo por linha/receita/
   unidade, preço efetivo, markup separado da margem, alertas e aplicação explícita
   da sugestão. Mais casas decimais para custos de g/ml; venda segue pelo servidor.
5. **Acesso:** Minha conta para nome/credenciais, recuperação uniforme, novo e-mail
   verificado, sincronização canônica, gestão de nome/papel/estado e auditoria de
   solicitações. Último admin ativo protegido; conta preservada ao desativar.
6. **Testes:** novas regressões e concorrência no emulador; verificação visual nas
   sete larguras; componente e hooks do KDS com Firestore emulado real.
7. **Documentação:** guia atual, mapa de API e notas existentes do vault atualizados;
   histórico antigo sem custo e pedidos antigos sem encerramento não são migrados.
8. **Entrega:** commits por camada, PR de revisão e checklist de homologação.

## Arquivos e responsabilidades

| Arquivos principais | Responsabilidade |
|---|---|
| `backend/app/services/caixa_service.py` | Encerramento administrativo na quitação; caixa/agregados/mesa atômicos |
| `pedidos_service.py`, `producao_service.py`, `cozinha_service.py` | Conferência de reservas, preservação física, KDS e baixa de lotes |
| `estoque_service.py`, `unidades.py`, `produtos_service.py` | Compra/custo médio, conversões, vínculos, normalização de receitas |
| `agregados_service.py`, `relatorios_service.py`, `calculos.py`, `backfill_service.py` | Custo congelado novo e fallback legado; nenhuma reconstrução real executada |
| `usuarios_service.py`, routers e modelos | Conta, autorizações, último admin, auditoria e sincronização Auth |
| `backend/app/services/base.py` | Contenção esgotada como conflito recuperável, sem ocultar outros erros |
| `EstoquePage.tsx`, `ProducaoPage.tsx`, `ProdutoFormPage.tsx` | Operação e precificação responsivas |
| `MinhaContaPage.tsx`, `ConfiguracoesPage.tsx`, `LoginPage.tsx`, `lib/conta.ts` | Conta própria, recuperação e gestão autorizada |
| `useFirestore.ts`, `types/index.ts`, `App.tsx`, `AppLayout.tsx` | Novos campos, rotas, filtros e consultas em tempo real |
| Testes backend/frontend e `scripts/e2e/*` | Regressões de regra, concorrência e KDS em tempo real |

## Banco, índices e compatibilidade

Campos novos são aditivos e opcionais. Legado sem `ativo` de estoque é ativo;
receitas sem unidade informada já estão em unidade de controle. Nenhuma mudança de
unidade reescreve documentos antigos. Lotes e estados físicos permanecem preservados.
Novos metadados de encerramento/reserva não são aplicados retroativamente.

Coleções internas: `eventos_estoque`, `controle_acessos` e `auditoria_acessos`.
Continuam negadas ao cliente por padrão; não houve mudança nas Firestore Rules.
Sem índice composto novo. Consultas de referências na exclusão/mudança de unidade
podem ler histórico extenso, mas não são executadas no fluxo rotineiro de venda.

Campos de custo: movimentos novos guardam `custoUnitario`; agregados guardam
`saidasComCustoPorItem` e `cmvEstoqueCongelado`. Dados sem snapshot continuam
estimativos pelo custo atual. Não existe informação suficiente para recuperar um
custo histórico inexistente sem fonte externa; não foi inventada uma migração.

Contratos e permissões completos: [Guia da evolução](evolucao-operacional.md).

## Validação efetivamente executada

| Comando / cenário | Resultado |
|---|---|
| `python -m pytest backend/tests -q` | **220 passaram**; um aviso de depreciação do TestClient/Starlette |
| `npm run test:precificacao --prefix frontend` | **7 passaram** |
| `npm run test:unidades --prefix frontend` | **5 passaram** |
| `npm run test:seguranca --prefix frontend` | **3 passaram** |
| `npm run build --prefix frontend -- --emptyOutDir` | TypeScript e build PWA aprovados; aviso conhecido de chunk Firebase grande |
| `git diff --check` | Sem erro de whitespace |
| Firestore Rules no emulador | Todas as asserções passaram, incluindo isolamento e escritas negadas |
| `producao_emulator.py` | Produção concorrente idempotente, última unidade e entrega sem baixa dupla |
| `balcao_emulator.py` | Criação/pagamento concorrentes, caixa, agregado e estufa sem duplicação |
| `evolucao_emulator.py` | Mesa concorrente, reserva retida, decisões conflitantes, compra com retry e último admin |
| `kds_realtime.py` + navegador | Componente/hooks/SDK reais; mesa some sem reload, balcão pago permanece; identidade simulada |
| Navegador em 320/360/390/430/768/1024/1440 px | Fluxo progressivo, rendimento manual, modal de estoque, conversão na precificação, nome próprio, gestão e claro/escuro; serviços simulados |

O teste visual também conferiu retry da produção com o mesmo corpo/chave e ocultação
de ações de gestão para cozinha. Escape do modal foi exercitado. A travessia completa
pelo teclado e todas as combinações de leitores de tela permanecem na homologação.

Foram encontradas e tratadas contenções reais no emulador. A proteção de admins
passou a ler a coleção na mesma ordem antes do alvo. Contenção esgotada retorna 409
recuperável; o teste de compra repete a mesma chave e confirma apenas uma entrada.
Não há fallback que grave fora da transação.

## Limitações e testes pendentes

- Não executado login real, envio/recebimento de e-mail, troca de senha/e-mail em
  conta real, integração Auth/Firestore em produção ou suíte PowerShell autenticada.
  Não há credenciais/tokens de teste autorizados neste ambiente; nenhum dado real
  foi usado. Validar com conta própria no localhost antes de merge.
- Firestore e Auth não oferecem uma transação conjunta. O perfil mantém a autoridade
  de acesso e falha de sincronização Auth é sinalizada com 503/campo pendente;
  repetir a ação é necessário. O operador não deve ignorar essa pendência.
- Credenciais são geridas no Firebase; a auditoria local de troca é de **solicitação**,
  não uma prova falsa de conclusão. Verificação canônica confirma o novo e-mail.
- Recuperação pública tem resposta uniforme inclusive em erro de envio. O usuário
  deve conferir a caixa postal e limites/templates do Firebase antes de repetir.
- Correção administrativa de login orienta o titular a verificar o novo endereço.
  Perda total de acesso requer validação de identidade pelo suporte, sem bypass.
- Não há reorganização retroativa da fila de pedidos antigos já pagos.
- CI atualizado executa backend, frontend, Rules e três cenários de concorrência.
  Teste opcional de navegador/KDS não faz parte do CI por não instalar Playwright.

## Commits

1. `51f1fc48` - domínio transacional, estoque, contas e regressões backend.
2. `7a54bea7` - fluxos e telas operacionais, conta e testes frontend.
3. Documentação, cenários de emulador e CI; hash consultável na PR.

## Aceite manual

O checklist detalhado está em [evolucao-operacional.md](evolucao-operacional.md).
Priorizar: compra → receita convertida → preço → produção → pedido → parcial →
quitação → KDS → conferência de estufa → caixa/agregados/histórico; repetir com
balcão. Testar depois credenciais reais, perfis e dois restaurantes independentes.
A PR deve permanecer em revisão até esse aceite. Nenhuma publicação faz parte desta
entrega.


## Ajuste visual solicitado após a revisão

Estoque voltou a uma tabela compacta no desktop e lista enxuta no celular. Saldo
baixo recebe fundo âmbar, valor em vermelho e aviso textual/ícone, também no modo
escuro. Nome e saldo têm tamanho menor; ações de edição, movimentação, histórico e
arquivamento permanecem acessíveis. Sem mudança nas regras do backend.

Verificação visual adicional: 320/390/1024/1440 px, claro/escuro, distinção de cor
entre saldo normal e baixo, sem overflow e abertura/fechamento da edição. Build
com TypeScript validado. A correção integra a mesma branch/PR de evolução.

### Lista de produtos compacta

- Tabela de produtos alinhada ao estoque: espaçamentos menores, ações por ícones no desktop e lista compacta no celular, preservando imagem, categoria, preço, variações e status.
- Cabeçalho, divisórias, hover e indicadores com contraste no tema escuro; ações com nomes acessíveis e área de toque de 44 px.
- Build/TypeScript aprovados. Verificação local com dados simulados em 320, 390, 768, 1024 e 1440 px, temas claro/escuro, sem overflow horizontal; busca, categoria, status, destino de edição e cancelamento da exclusão conferidos. Não substitui homologação autenticada com o cliente.
- Sem deploy ou mudança de regras de negócio.

### Usabilidade das mesas

- Cartão abre/inicia pedido; menu de opções separa QR e exclusão. Gestão visível para admin, gerente e caixa, conforme autorização existente da API; mesa ocupada/com pedido não pode ser excluída na interface.
- Contadores, filtros por estado, busca por número e modos grade/lista. Ordem numérica estável, foco visível, áreas de toque de 44 px e contraste nos dois temas.
- Mesa ocupada mostra total do pedido aberto vinculado e tempo desde a abertura, atualizado por minuto; ausência/erro dos dados não inventa valor. Apenas pedidos abertos em tempo real, sem busca do histórico.
- Build/TypeScript aprovados. Verificação local com dados simulados em 320, 390, 768, 1024 e 1440 px: claro/escuro, sem overflow, filtros, lista, QR, bloqueio de exclusão e navegação. Homologação autenticada permanece necessária. Sem deploy.

### Proporções e botões arredondados

- Mesas em grade com altura uniforme, colunas mais compactas e botão explícito para abrir/iniciar pedido, separado do menu. Modo lista preservado.
- Ações antes apresentadas como links receberam superfície, borda, cantos arredondados e foco visível nas telas de produtos, categorias, estoque, caixa, financeiro, produção e cozinha; navegação mantém a semântica de link. Componente Button usa cantos arredondados e variante ghost com superfície visível.
- Build/TypeScript aprovados. Tela de mesas conferida localmente com dados simulados em cinco larguras (320–1440), nos dois temas: filtros, lista, QR, exclusão bloqueada e navegação. Demais telas requerem conferência visual na homologação. Sem deploy.
