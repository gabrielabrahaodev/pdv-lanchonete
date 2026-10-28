# Reposição — histórico de recebimentos

## Rotas e estados
- `/reposicao`: sugestões por insumo e lista paginada de `gerado` (aguardando).
- `/reposicao/recebidos`: somente `recebido`.
- `/reposicao/cancelados`: somente `cancelado`; histórico preservado.
- `GET /reposicao/pedidos/pagina`: status obrigatório lógico (default gerado), limit 1–100 (UI 20), cursor do último documento. JSON `{items,nextCursor}`. Status no Firestore, não separação de histórico completo no React.
- `GET /reposicao/pedidos/{id}`: detalhe autenticado no tenant. API legada `/pedidos` preservada para versões anteriores.

## Índice necessário
Consulta nova combina `status ASC` com `createdAt DESC`, escopo COLLECTION no collection group `items`. Proposta adicionada ao arquivo de índices existente, preservando isenções anteriores. NÃO foi publicada. Após revisão/homologação, administrador deve publicar separadamente `firebase deploy --only firestore:indexes --project pdv-lanchonete-1fa79` e aguardar construção antes de disponibilizar as novas listas. Índice ausente retorna 503 com mensagem clara; nunca faz fallback para scan integral. Emulador não prova presença do índice em produção.

## Cache e custo
React Query: chave por restaurante, papel, status e cursor; staleTime 30s. Histórico não monta até acessar a rota. Candidatos/configurações só ao abrir geração. Após ação confirmada, primeira página é restaurada e listas/candidatos são invalidados; recebimento também invalida despesas/BI/contas do mesmo restaurante e cache Python do tenant. Nenhuma transição otimista antecipa commit.

Estimativas (não medições): antes a tela lia H pedidos de todo histórico, inclusive ao compor candidatos. Depois a lista lê até 20 pedidos do status escolhido + 1 leitura de cursor nas páginas seguintes. Candidatos ainda leem fornecedores/estoque necessários e P pedidos gerados para impedir compras duplicadas, mas não H históricos recebidos/cancelados. Histórico financeiro: zero consultas de despesas na lista; uma consulta ao solicitar débito em detalhes, com cache. Ordenação por geração evita excluir históricos antigos sem data de recebimento.

## Preservação e segurança
Somente admin/gerente nas páginas e API. Cursor é buscado dentro do tenant e precisa manter o status da consulta; documento movido entre estados exige atualizar a lista (409), sem misturar registros. Recebimento comercial, kg/g, custo ponderado, competência retroativa, despesa determinística e bloqueio de replay preservados. Histórico é somente leitura, não apaga pedidos nem permite editar saldos/débitos.

## Homologação
Criar pedido por WhatsApp/confirmar → aguardando; receber 2 kg/R$16 com data anterior → desaparece de gerados, aparece em recebidos, saldo2000g/débito16. Confirmar criação/data efetiva/data registro e nome/UID responsável. Repetir recebimento deve falhar sem duplicar. Cancelar outro pedido → somente Cancelados. Navegar por links, F5/URL direto, voltar/avançar, páginas com datas empatadas e tenant diferente. Consultar débito apenas em detalhes; ir ao Financeiro para pagar/reabrir. Validar claro/escuro, 320–1440px, teclado e foco. Não publicar dados ou índices sem autorização.
