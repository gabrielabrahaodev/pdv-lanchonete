# Reposição — aguardando, recebidos e cancelados

Base master `d888359`, incluindo PRs #17–#21. Branch independente `feat/reposicao-pedidos-recebidos`, compatível com a reorganização do Financeiro. Sem merge/deploy ou alteração produtiva.

## Implementação
- `/reposicao`: sugestões/WhatsApp e pedidos `gerado` aguardando. Não mostra recebidos nem cancelados.
- `/reposicao/recebidos`: histórico `recebido`, paginação e detalhes de compra/recebimento/débito.
- `/reposicao/cancelados`: histórico cancelado preservado.
- Links reais entre rotas, acesso direto/F5/voltar; componentes de históricos reiniciam cursores ao mudar de estado.
- Lista carrega fornecedor e valores já presentes no snapshot, sem consultar fornecedor/despesa por cartão. Detalhe mostra quantidades solicitadas, comerciais, convertidas, totais, datas e responsável. Botão Consultar débito faz apenas um GET de despesa e mostra competência, vencimento, pagamento/status e acesso ao Financeiro.
- Nenhuma ação de receber/editar estoque em histórico. Recebimento segue transação original com custo médio, data retroativa e despesa determinística; status só muda após confirmação backend. Nome do responsável é acrescentado no snapshot quando disponível, com UID como fallback legado.

## Código, consultas e cache
Arquivos principais: `ReposicaoPage.tsx`, `ReposicaoHistoricoPage.tsx`, `ReposicaoNavegacao.tsx`, `AppAutenticado.tsx`, tipos e router/service de reposição.

`GET /reposicao/pedidos/pagina?status=gerado|recebido|cancelado&limit=20&cursor=...` usa filtro no Firestore, ordenação `createdAt DESC` e cursor por snapshot; intervalo de limit 1–100. JSON `{items,nextCursor}`. Ordem pela geração preserva dados antigos sem data de recebimento; data efetiva e real de registro são exibidas separadas. Cursor que mudou de status retorna409 para atualizar a lista. `GET /reposicao/pedidos/{id}` disponível; endpoint legado de listagem completa preservado para clientes antigos.

Candidatos consultam somente pedidos gerados, não histórico completo. Chaves React Query incluem tenant/papel/status/cursor; TTL30s, sem polling. Histórico é lazy por rota; candidatos/configuração só na geração. Receber/cancelar confirma backend, restaura primeira página e invalida consultas do tenant. Recebimento também invalida despesas/BI/contas e cache Python do tenant. Auxiliares não são consultados por cartão.

Estimativas, não medições: histórico anterior H documentos por abertura; nova lista até20 por página +1 leitura do cursor nas seguintes. Candidatos antes liam H pedidos, agora P pendentes, além dos fornecedores/estoques necessários. Débito financeiro: 0 leituras por cartão; 1 por consulta explícita do detalhe, antes do cache. Não se pressupõe taxa de acerto nem quota produtiva medida.

## Índice necessário, NÃO publicado
Proposta em `firestore.indexes.json`: collectionGroup `items`, queryScope COLLECTION, `status ASC` + `createdAt DESC`. Mantém isenções existentes. Após revisão, administrador deve publicar separadamente `firebase deploy --only firestore:indexes --project pdv-lanchonete-1fa79` e aguardar construção antes de liberar as listas. Consulta com índice faltante retorna503 legível, sem fallback que leia tudo. Emulador não verifica a existência do índice produtivo.

## Validação
- 273 pytest passaram, incluindo estados separados, paginação/cursor, tenant e autorização admin/gerente (demais papéis bloqueados).
- 36 testes frontend existentes, TypeScript/build PWA.
- UI simulada em320/390/768/1024/1440px, claro/escuro: navegação por rotas, listas separadas, débito consultado só em detalhes, sem overflow, Escape.
- Cenário novo em SDK real/emulador: pedido gerado → recebido retroativo, 2kg/R$16 →2000g e débito16 único; segundo recebimento409; cancelados separados; outro tenant vazio.
- Integração ao script `evolucao_emulator.py` já usado no CI. Na primeira execução local, uma asserção preexistente do último admin ativo falhou sob concorrência; repetição passou sem mudar código de usuários. Resultado específico do histórico passou nos dois testes próprios; conferir CI e monitorar essa instabilidade de contenção do teste legado.

## Homologação local
1. Abrir Reposição/geração, enviar WhatsApp e confirmar registro; validar que gerados aparecem só em Aguardando.
2. Receber quantidades comerciais com data passada; validar saldo/custo/débito e saída da lista pendente após confirmação.
3. Abrir Pedidos recebidos, conferir fornecedor, criação/data efetiva/data registro, usuário, itens, quantidades e valores.
4. Consultar débito no detalhe; conferir status/competência; ir à seção Despesas do Financeiro para pagar/reabrir. Nenhum débito deve ser buscado ao só abrir a lista.
5. Repetir recebimento deve retornar conflito sem duplicação; cancelar outro pedido deve aparecer só em Cancelados.
6. Validar páginas, cursor movido, F5, URL direto, voltar/avançar, outro tenant, claro/escuro, teclado e PWA real.

Não apaga histórico, não muda datas antigas nem desfaz estoque/débito. Dados legados sem campos mostram “Não registrado”, não zero. Regras Firestore e credenciais não foram alteradas. Publicação e homologação autenticada ainda dependem de revisão e autorização.
