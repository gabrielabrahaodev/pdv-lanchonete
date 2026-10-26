# Venda direta no caixa

Caixa → Nova venda direta → escolher produtos → Ir para pagamento. Requer sessão de caixa aberta e perfil admin, gerente ou caixa. Não cria nem ocupa mesa. Em dinheiro, informar o valor recebido para calcular troco; PIX e cartões registram a confirmação manual do operador, sem integração com adquirente.

O pedido é criado antes do pagamento e pode ser retomado em Caixa → Vendas de balcão. Em falha de comunicação, Tentar novamente preserva corpo e chave da operação. Uma venda sem pagamentos pode ser cancelada; ingredientes já consumidos não são estornados, conforme regra existente.

Produtos sob pedido seguem para a cozinha, inclusive após o pagamento. Produtos antecipados reservam lotes FEFO na criação e baixam o saldo pronto na entrega. A opção de confirmar a entrega dos itens prontos junto ao pagamento somente funciona na quitação integral. Itens ainda em preparo permanecem na cozinha. Lote vencido impede a entrega; é possível registrar somente o pagamento e resolver a reserva na cozinha. Produtos sem preparo mantêm o comportamento existente de entrega/consumo na inclusão.

## API e integridade

- POST /api/pedidos/balcao: lista OrderItemAdd e Idempotency-Key obrigatório. Preço resolvido no servidor, sessão aberta validada em transação, mesaId nulo.
- POST /api/pagamentos/{id}: X-Idempotency-Key e campo opcional entregarProntos. Para balcão, repetições iguais retornam o pedido; alteração do corpo com a mesma chave retorna 409.
- Todas as leituras precedem as escritas nas transações. Estoque, lotes, pedido e agregados afetados são persistidos atomicamente nos novos caminhos.
- Não há nova coleção pública nem mudança nas regras Firestore. Isolamento por restaurante e guardas financeiros existentes são mantidos.

## Validação

- 189 testes backend e 10 testes frontend passaram; TypeScript e build passaram.
- scripts/e2e/balcao_emulator.py usa exclusivamente Firestore Emulator: criação e pagamentos concorrentes com mesma chave, receita com dois ingredientes, reserva/entrega, caixa e agregados sem duplicação, mesa inalterada. Incluído no CI.
- Verificação de interface em 375/1280px com serviços simulados: caixa sem mesas, seleção, retry com mesma chave, pagamento com entrega e comprovante; sem overflow horizontal. Não substitui teste autenticado.
- Pendente antes da produção: fluxo autenticado local com frontend e backend reais, conforme AGENTS.md, incluindo scripts/e2e/api_test.ps1 -Base http://127.0.0.1:8000.

Checklist local: abrir caixa; vender sem mesa; repetir em dinheiro/PIX/cartões; recuperar venda aberta; testar estufa e produto com preparo; conferir KDS após pagamento, estoque, caixa, relatório e comprovante; verificar venda por mesa e delivery existentes.
