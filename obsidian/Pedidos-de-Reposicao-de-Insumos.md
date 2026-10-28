# Pedidos de reposição de insumos

**Estado:** proposta para revisão; somente após aprovação e merge.

## Contexto e acesso

A reposição utiliza os fornecedores já cadastrados na aba **Financeiro → Fornecedores**, os insumos e movimentações existentes. Não cria cadastros paralelos.

Os endpoints de `/api/reposicao` usam `require_roles('admin','gerente')`. Insumos e pedidos são sempre consultados/escritos dentro de `restaurantes/{restaurantId}`; as respostas não podem misturar dados de restaurantes. Não são adicionadas regras públicas de Firestore.

## Configurações

O documento `restaurantes/{rid}/data/configuracoes` passa a aceitar `endereco` (endereço completo do restaurante, texto de até 500 caracteres). O endereço é usado **exclusivamente para solicitar entrega ao fornecedor**, não é publicado no QR Code. Restaurantes antigos continuam funcionando e precisarão preencher esse campo antes de pedir por WhatsApp.

## Insumos e fornecedores

`InventoryItemCreate` e `InventoryItemUpdate` aceitam `fornecedorId` opcional (identificador de fornecedor do próprio restaurante). A interface oferece seletor e permite deixar o insumo sem fornecedor. String vazia desassocia o insumo; alterações não afetam a rastreabilidade anterior.

Fornecedor inativo ou de outro restaurante não é aceito como novo vínculo. Um fornecedor ligado a insumos ou a pedidos de reposição não deve ser excluído definitivamente: use desativação, preservando o histórico.

## Tela Reposição

Rota autenticada `/reposicao` e duas opções:

- **Pedidos a gerar:** insumos ativos cujo `quantidadeAtual <= minimo`, agrupados pelo fornecedor ativo. Insumos sem fornecedor não são incluídos; devem ser associados no estoque. Insumos já incluídos em pedido no estado `gerado` não são sugeridos novamente.
- **Pedidos gerados:** lista histórico dos pedidos, incluindo **gerado**, **recebido** e **cancelado**. O pedido gerado pode ser recebido ou cancelado.

Quantidade sugerida para compra é `max(1, minimo - saldo)`, em unidade de **controle** (kg, L, un etc.), mas editável antes de enviar.

## WhatsApp

O botão utiliza link `https://wa.me/<telefone>?text=<texto>`. O número precisa conter DDD (padrão brasileiro). Sem custo de API, mas o fornecedor deve ter WhatsApp e o restaurante deve preencher seu endereço.

São oferecidos três textos genéricos alternados aleatoriamente, todos com lista de insumos, quantidade, unidade, endereço de entrega e nome do restaurante.

**Importante:** abrir o WhatsApp não garante entrega da mensagem. Ao retornar ao sistema, surge uma confirmação para **registrar o pedido de reposição**. O pedido só é persistido após a confirmação; caso o usuário não confirme, não altera estoque e não cria pedido. Um registro `gerado` significa **registrado para acompanhamento**, nunca comprovação de envio.

## Dados dos pedidos

Subcoleção: `restaurantes/{rid}/data/pedidos_reposicao/items/{pedidoId}`.

Campos principais: `fornecedorId`, `fornecedorNome`, `telefone`, `enderecoEntrega`, `mensagem`, `itens` (snapshot de nome, unidade, quantidade, custo inicial, saldo), `status`, `usuarioId` e carimbos de data.

Status:
- `gerado`: registrado, sem movimentação de estoque.
- `recebido`: atualização transacional confirmada.
- `cancelado`: sem atualização de estoque, libera novas sugestões dos itens.

## Recebimento

Na tela Pedidos gerados, o botão **Reabastecer estoque** permite alterar a **quantidade recebida** e o **custo unitário por unidade de controle** de cada insumo.

Confirmação transacional:
1. Lê pedido + todos insumos antes de gravar qualquer documento.
2. Exige que o pedido esteja `gerado`, com itens ativos e unidades preservadas.
3. Registra uma `movimentacao_estoque` do tipo `entrada` por item, ligada pelo `pedidoReposicaoId`.
4. Atualiza `quantidadeAtual` e recalcula `custoMedio` ponderado usando custo anterior + entrada.
5. Marca pedido `recebido` e registra responsável/data + detalhes de entrada na mesma transação.

Repetições ou tentativas concorrentes de receber pedido já finalizado são recusadas, evitando entradas em duplicidade. Alterar quantidade e custo de entrada **não reescreve** histórico financeiro ou custos de vendas antigas.

**Não registrar automaticamente despesas a pagar ou contas de fornecedores:** isso depende de uma integração financeira posterior. Para controle de despesas, continuar usando Financeiro.

## Homologação

- [ ] Cadastrar endereço em Configurações.
- [ ] Criar fornecedor com telefone brasileiro no Financeiro e associar em insumo.
- [ ] Reduzir estoque até o mínimo, verificar sugestão agrupada.
- [ ] Ajustar quantidade e abrir WhatsApp; conferir todas as três versões de texto.
- [ ] Retornar e confirmar **não registrar**; nada deve mudar.
- [ ] Retornar e confirmar **sim**; aparece em Pedidos gerados e desaparece das sugestões.
- [ ] Reabastecer quantidades reais com valores unitários; verificar saldo, custo médio e movimentações.
- [ ] Tentar receber novamente; não pode duplicar.
- [ ] Cancelar um pedido gerado; itens reaparecem na lista de sugestões.
- [ ] Verificar usuários com papel caixa, garçom e cozinha: sem acesso administrativo à reposição.
- [ ] Conferir isolamento multi-tenant, layouts mobile/desktop, tema claro/escuro, navegação e histórico.
