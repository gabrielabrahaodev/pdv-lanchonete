# Evolução operacional do NexoComanda

Base: master `bd3a34a`; branch `feat/nexocomanda-evolucao-operacional`.
Nenhum deploy, merge ou escrita em dados de produção faz parte desta entrega.

## Regras implementadas

### Mesa e cozinha

A quitação integral de pedido `local` com `mesaId` registra `encerramentoOperacional`
no pedido e nos itens ainda pendentes/preparo/pronto, com motivo `mesa_quitada`,
horário e operador. `cozinhaPendente=false` retira o pedido do KDS e a mesa é
liberada na mesma transação do caixa/agregados. Os estados físicos dos itens,
valores e histórico são preservados. Parcial não encerra. Balcão/delivery mantêm
seu comportamento independente. Repetição do pagamento de mesa continua retornando
409, sem duplicar; balcão preserva seu replay de sucesso com chave/corpo iguais.

Reservas de estufa não comprovadas NÃO são liberadas ou consumidas pelo pagamento.
Elas continuam indisponíveis e são sinalizadas para conferência. Na Estufa,
admin/gerente/caixa decide explicitamente se houve consumo físico ou devolução.
A primeira decisão é persistida por item, com justificativa e autoria; repetição
igual é inócua, decisão conflitante recebe 409. Estado de preparo não é reescrito.
Devolução de lote vencido só libera a reserva: o lote permanece vencido e não pode
ser vendido. Baixa de conferência em lote já vencido é registro retrospectivo de
uma retirada física confirmada, não autorização para servir produto vencido.
Inconsistência de saldo bloqueia conferência; não impede receber o pagamento.
Pedidos encerrados não aceitam avanço físico ou troca de reserva pelo KDS.

Insumos de itens sob pedido ainda pendentes não são consumidos pelo fechamento:
encerramento administrativo não prova preparo. Eventual divergência física exige
ajuste de estoque auditável pela gestão; não é baixa silenciosa.

### Estoque, compra e precificação

- Insumo sem `ativo` é lido como ativo; arquivamento adiciona `ativo=false`.
- Receitas existentes podem continuar referenciando insumo arquivado. Novas receitas
  não podem incluí-lo, e entradas manuais exigem reativação. Histórico permanece.
- Unidade só muda sem saldo, receita, movimentações ou referência histórica.
  Não há conversão retroativa de documentos; se usado, criar novo insumo.
- PATCH cadastral rejeita `quantidadeAtual`; saldo muda por movimentação.
- Exclusão definitiva só sem saldo/vínculos/histórico. Padrão da UI é arquivar.
- `unidadeCompra` e `fatorCompra` são por insumo. Fator de caixa/pacote representa
  quantidade na unidade de controle. kg/g e L/ml convertem diretamente; não há
  conversão de peso/volume. Sem fator válido, embalagem incompatível é rejeitada.
- Precisão de quantidade: 0,001 da unidade de controle. Fração mais fina é
  rejeitada, não descartada silenciosamente; nesse caso usar controle em g/ml.
- Entrada pode informar `valorTotalCompra`. Custo médio =
  `(max(saldoAnterior,0)*custoAnterior + valorCompra)/(max(saldoAnterior,0)+qtdConvertida)`.
  Saldo negativo não é valor de estoque disponível. Cálculo Decimal; custo com
  oito casas. Sem valor de compra, mantém custo anterior. Ajuste para zero é aceito.
- UI envia `Idempotency-Key` e mantém corpo/chave no retry de rede/5xx. API aceita
  chamadas antigas sem a chave por compatibilidade; novos integradores devem usá-la.
- Correção manual de custo gera movimento `tipo=custo`, sem modificar saldo.
- Ingrediente pode enviar `qtd` + `unidade`; backend normaliza para controle e
  preserva `qtdInformada/unidadeInformada` para edição. Documento antigo com só
  `qtd` continua significando unidade de controle, sem migração de massa.
- Preço final continua manual até o usuário usar a sugestão. Markup não é margem.
  Custo atualizado não altera preço cadastrado nem o preço já gravado no pedido.
- Novas saídas de pedidos congelam `custoUnitario` e agregados
  `saidasComCustoPorItem/cmvEstoqueCongelado`. Lotes mantêm custo congelado existente.
  Saídas antigas sem custo persistido continuam estimativas pelo custo atual;
  não foi inventado custo histórico. Backfill foi adaptado, mas NÃO executado.

### Produção e estufa

Fluxo em três etapas: produto → rendimento/local/validade → conferência. Quantidade
prevista acompanha receitas enquanto não houver ajuste manual; edição manual não
é sobrescrita ao mudar o número de receitas. Trocar o produto reinicia a previsão.
Receita ausente/inválida é identificada antes da produção. Revisão mostra consumo,
saldo e custos estimados; custos gerenciais são secundários. Requisições mantêm a
mesma chave no retry. Filtros de local/situação e busca na Estufa; indicadores contam
lotes, sem somar bolos/fatias/unidades heterogêneas. Perdas/conversões têm confirmação.

### Conta e acesso

- `/minha-conta` para qualquer membro ativo: nome, papel consultivo, senha/e-mail.
- Senha própria exige reautenticação com Firebase; alteração encerra a sessão atual.
- E-mail usa `verifyBeforeUpdateEmail`. Perfil só sincroniza a partir do registro
  canônico verificado do Auth, no próximo login ou na ação explícita de sincronizar.
- Recuperação pública usa resposta uniforme; não confirma a existência da conta.
- Gestão permite nome, papel, desativação lógica/reativação e iniciar recuperação.
  Gerente não administra gerente/admin; admin administra contas do seu restaurante.
  Próprio papel não pode ser alterado. DELETE preserva o perfil, marcando inativo.
- Último admin ativo não pode ser desativado/rebaixado, protegido por transação e
  documento de controle. Dono da plataforma não é criado nem alterado por esse fluxo.
- Firestore e Firebase Auth não têm transação distribuída. Perfil é autoridade do
  backend/rules. Falha na sincronização Auth retorna 503 e marca
  `sincronizacaoAuthPendente`; repetir a operação conclui a sincronização. Nenhum
  segredo é persistido; evento de auditoria registra campos, ator e papéis.
- Administração não recebe links que permitam assumir a senha de outra pessoa;
  orienta o titular a verificar o novo login. Caso sem acesso ao e-mail requer
  procedimento de identidade do suporte, não troca arbitrária de e-mail.

## Contratos e armazenamento

- POST `/pedidos/{pid}/itens/{iid}/conferir-reserva`: `{acao:consumido|devolver,motivo}`.
- PATCH `/estoque/itens/{id}`: cadastro + `ativo`, `unidadeCompra`, `fatorCompra`.
- POST `/estoque/movimentacoes`: `unidade` e `valorTotalCompra` opcionais;
  `Idempotency-Key` opcional no legado, usado pela nova UI.
- PATCH `/usuarios/me`: somente `nome` e/ou `tema`; campos extras retornam 422.
- POST `/usuarios/me/seguranca`: audita solicitação própria de troca de senha/e-mail, sem segredo; não afirma conclusão da operação no Firebase.
- POST `/usuarios/me/sincronizar-login`: usa usuário canônico do Firebase Auth.
- POST `/usuarios/{id}/recuperacao`: autoriza/audita solicitação e fornece endereço
  canônico à UI para disparar o fluxo padrão do Firebase; não retorna segredo/link.
- PATCH usuário com `senha` retorna 422 orientando recuperação por e-mail.
- Coleções internas novas: `eventos_estoque`, `controle_acessos`, `auditoria_acessos`.
  Permanecem negadas ao SDK cliente por padrão. Escritas só pelo backend.
- Sem novos índices compostos. Pendências de conferência usam igualdade em um campo.
- Sem migração de produção. Pedidos antigos não recebem encerramento retroativo.
  Consultas administrativas de exclusão/unidade verificam referências históricas;
  podem exigir muitas leituras em restaurantes com histórico grande.
- Contenção esgotada do Firestore vira 409 recuperável com mensagem de conferência,
  sem simular sucesso nem aplicar operação fora da transação.

## Matriz de permissões

| Operação | Admin | Gerente | Caixa | Garçom | Cozinha |
|---|---|---|---|---|---|
| Conta própria / recuperação | Sim | Sim | Sim | Sim | Sim |
| Insumo / compra / arquivo | Sim | Sim | Não | Não | Não |
| Consultar estoque | Sim | Sim | Sim | Sim | Sim |
| Produção / perda / conversão | Sim | Sim | Sim | Não | Sim |
| Conferir reserva de mesa | Sim | Sim | Sim | Não | Não |
| Receber / quitar mesa | Sim | Sim | Sim | Não | Não |
| Criar/editar operacional | Sim | Sim | Não | Não | Não |
| Gerenciar gerente/admin | Sim | Não | Não | Não | Não |

## Comandos de validação

```bash
# Apenas dados em memória ou emulador demo-p0a.
python -m pytest backend/tests -q
npm run test:precificacao --prefix frontend
npm run test:unidades --prefix frontend
npm run test:seguranca --prefix frontend
npm run build --prefix frontend
# Executar da raiz com Java 21 e dependências dev instaladas:
frontend/node_modules/.bin/firebase emulators:exec --only firestore --project demo-p0a \
  'PYTHONPATH=backend python scripts/e2e/evolucao_emulator.py'
```

O CI executa testes backend, frontend, Rules e três cenários transacionais no
emulador. O relatório final da PR informa resultados efetivamente obtidos.

## Homologação manual antes de merge

- [ ] Rodar backend local e frontend local em ambiente seguro com credencial própria.
- [ ] Rodar `scripts/e2e/api_test.ps1 -Base http://127.0.0.1:8000` com tokens de teste.
- [ ] Cadastrar carne em g; comprar 1 kg/R$40; receita 150g custa R$6.
- [ ] Leite: comprar 2L/R$16, usar 200ml, custo R$1,60; caixa100/R$50, usar3, R$1,50.
- [ ] Conferir média ponderada após nova compra; editar custo sem mudar venda antiga.
- [ ] Arquivar, reativar e tentar excluir insumo usado; tentar mudança de unidade.
- [ ] Criar receita em unidade convertida; reabrir edição e conferir quantidade/unidade.
- [ ] Produzir em 3 etapas; alterar receitas, corrigir rendimento manual e conferir.
- [ ] Simular resposta perdida e tentar novamente sem criar segundo lote/compra.
- [ ] Conferir filtros, validade, perda, conversão e histórico dos lotes.
- [ ] Mesa com itens em estados mistos: parcial mantém KDS; quitação limpa e libera.
- [ ] Conferir que status físicos e ingredientes já consumidos não mudaram.
- [ ] Conferir reserva pendente após quitação, consumo/devolução com motivo e retry.
- [ ] Balcão pago ainda em preparo continua no KDS e pode ser entregue normalmente.
- [ ] Conferir caixa, CMV e agregados por dia/mês; repetir pagamentos concorrentes.
- [ ] Validar nome próprio, senha com reautenticação, recuperação e novo e-mail real.
- [ ] Conferir template/domínios autorizados, política de senha e limites no Firebase.
- [ ] Tentar alterar outro restaurante, próprio papel e desativar último admin.
- [ ] Usar teclado, modo claro/escuro e 320/360/390/430/768/1024/desktop.

Emails reais, credenciais, operação autenticada com backend real e a suíte
PowerShell exigem ambiente seguro do proprietário. Não apresentar mocks como
homologação desses fluxos. Não publicar antes do aceite.

### Teste opcional de KDS com snapshots reais

`frontend/tests/browser/kds.html` é entrada de teste para Vite, fora do build.
Com Vite em localhost:5173, Java 21, dependências Python e Playwright/Chromium
instalados no ambiente de teste, executar:

```bash
# PDV_PLAYWRIGHT_MODULE aponta ao pacote Playwright local, se não resolvido por Node.
frontend/node_modules/.bin/firebase emulators:exec --only firestore --project demo-p0a \
  'PYTHONPATH=backend python scripts/e2e/kds_realtime.py'
```

O teste usa porta 8766 temporária para comandar os pagamentos no backend de teste.
Componente, hooks, SDK, regras, pagamentos e Firestore são reais em emulação;
a identidade é simulada e tráfego externo do navegador é bloqueado. O teste
confirma remoção instantânea da mesa sem reload e permanência do balcão pago.
Não substitui login real nem valida entrega de e-mails. Não é executado no CI
padrão, que não instala navegador/Playwright; sua execução local é registrada na PR.
