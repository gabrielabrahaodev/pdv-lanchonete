# Produção e Estufa

## Uso

1. No produto, selecione **Produzido antecipadamente**, unidade de venda, receita completa de uma fornada e rendimento previsto. O preço sugerido divide o custo da receita pelo rendimento.
2. Em **Produção e Estufa → Produzir**, informe quantas receitas preparou, quantidade realmente produzida, validade e local (Estufa, Balcão, Geladeira etc.). A confirmação consome ingredientes e cria o lote. O custo unitário usa o rendimento real.
3. Adicionar ao pedido reserva unidades dos lotes que vencem antes. Confirmar entrega baixa apenas o produto pronto. Aquecer um item não consome novamente sua receita.
4. Perdas/ajustes exigem quantidade e justificativa. Unidades reservadas devem primeiro ter sua reserva transferida ou o item cancelado, quando permitido.
5. Para vender fatias, cadastre outra apresentação de produção antecipada (pode não ter receita própria) e converta o bolo inteiro em quantidade de fatias. Custo e validade são preservados.

## Regras

- Produtos antigos continuam no modo sob pedido; não há conversão automática de saldo histórico.
- Revenda vincula uma unidade vendida a uma unidade de um item do estoque. Embalagens devem ser cadastradas na mesma unidade ou usar receita no modo sob pedido.
- Produção explícita consome ingredientes mesmo se a baixa automática de pedidos estiver desligada. Saldo negativo dos ingredientes continua permitido pela regra existente; produtos prontos nunca podem ser reservados acima do disponível.
- Lotes vencidos não podem ser reservados, entregues nem convertidos. Reservas vencidas podem ser atualizadas na mesa ou no KDS, se houver novo lote disponível. Depois registre a perda do lote antigo.
- Cancelar antes da entrega libera a reserva. Produtos entregues não voltam automaticamente ao estoque, e ingredientes consumidos não são estornados.
- Pagamento e fechamento de caixa não movimentam lotes. Pedidos pagos ainda podem concluir preparo e entrega, preservando total e pagamentos. Cancelamento/remoção seguem bloqueados após pagamento.
- O custo dos prontos vendidos entra no CMV informativo na quitação. Produção não registra saída com pedidoId, evitando dupla contagem. O custo reconhecido é preservado em trocas de reserva posteriores à quitação. A fórmula existente de resultado gerencial não foi alterada.
- Admin, gerente, caixa e cozinha podem produzir, converter e registrar perdas. Garçom consulta disponibilidade e confirma entrega. Escritas diretas no Firestore são negadas.
- Histórico da interface exibe os últimos 100 movimentos; API oferece paginação por cursor.
- Pedidos pagos anteriores à implantação não possuem o marcador cozinhaPendente; a alteração não migra automaticamente esses pedidos para o KDS.

## Validação automatizada

- `pytest backend/tests -q`: inclui receitas com dois ingredientes, custo/rendimento, repetição, reserva FEFO, saldo insuficiente, pagamento antes do preparo, cancelamento, perdas, conversão, validade e permissões.
- `cd frontend && npm run test:precificacao && npm run test:seguranca && npm run build`.
- Emulador real: `frontend/node_modules/.bin/firebase emulators:exec --only firestore --project demo-p0a 'node frontend/tests/firestore_rules.test.mjs && PYTHONPATH=backend python scripts/e2e/producao_emulator.py'` (Python com dependências do backend e Java 21).
- Integração do emulador testa duas produções simultâneas com a mesma chave e duas reservas disputando a última unidade, além de entrega sem dupla baixa. CI executa o cenário com projeto demo.

## Homologação antes do deploy

Validar com login local: cadastrar pão com rendimento 30; produzir 25; conferir ingredientes e custo por 25; reservar/vender/entregar 5; conferir saldo 20; registrar perda; converter bolo em fatias; conferir telas em celular; pagar antes de preparar e concluir no KDS. Executar também a suíte autenticada `scripts/e2e/api_test.ps1 -Base http://127.0.0.1:8000`.

Publicar API, regras Firestore e frontend de forma coordenada. Feature branch não faz deploy; não mesclar na master antes da homologação local exigida em AGENTS.md.

## Resultado nesta implementação

175 testes backend e 9 testes frontend passaram; TypeScript/build passaram. Regras e concorrência passaram no emulador Firestore. A tela de produção foi verificada em navegador a 375 e 1280 px com dados simulados, sem overflow horizontal ou erro JavaScript. Isso não substitui a homologação autenticada local, ainda pendente.
