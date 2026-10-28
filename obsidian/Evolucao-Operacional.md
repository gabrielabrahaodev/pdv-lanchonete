# Evolução operacional

Fonte atual: [[../docs/04-testes/evolucao-operacional|Regras, contratos, permissões e homologação]].

## Mesa x balcão

Quitação integral da mesa encerra sua operação no KDS e libera a mesa sem inventar
entrega. Itens mantêm estado físico e auditoria. Pagamento parcial não encerra.
Balcão pode permanecer na cozinha mesmo pago. Reservas não entregues de mesa
ficam bloqueadas até conferência explícita na Estufa; jamais voltam automaticamente
à venda pelo pagamento. Devolução não torna lote vencido vendável.

## Estoque e preço

Compra e consumo usam unidades próprias, com conversão compatível. Caixas/pacotes
exigem fator por insumo. Valor total da compra recalcula a média ponderada; correção
manual de custo é auditada. Arquivamento preserva receitas/histórico; unidade e
exclusão são protegidas contra vínculos. Preço sugerido depende de custo, rendimento
e acréscimo (markup), distinto de margem sobre venda. Preço cadastrado continua manual.
Novas saídas e lotes preservam custo congelado; legado sem custo é estimativo.

## Produção

Produto → rendimento e validade → conferência. Rendimento real manual não é
sobrescrito. Indicadores contam lotes; não somam apresentações diferentes. Histórico,
perdas, conversões e conferências preservam reservas, validade e autoria.

## Conta e permissões

Minha conta usa Firebase para senha e verificação do novo e-mail. Gestão de pessoas
permanece no restaurante; admin não vira dono da plataforma. Último admin ativo é
protegido em transação. Desativação preserva perfil e autoria. Divergência temporária
com Auth é sinalizada e exige repetição de sincronização, sem elevar privilégios.

Não houve migração de dados reais. As regras acima se aplicam aos novos fechamentos.
