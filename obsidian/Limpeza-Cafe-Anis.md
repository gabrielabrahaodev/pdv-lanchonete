# Limpar historico do Café Anis

Script exclusivo do projeto `pdv-lanchonete-1fa79`, restaurante
`rest_cafe_anis_930abfe0d7a82c4b`. Confere ID e nome `Café Anis` no Firebase.
Nao aceita outro restaurante. Nenhuma limpeza e executada ao instalar/publicar o sistema.

## Escopo

Apaga todos os pedidos (pagamentos embutidos), delivery, movimentacoes de estoque,
despesas pagas **e pendentes**, sessoes de caixa, reposicoes recebidas/canceladas,
agregados diarios/mensais e marcadores de idempotencia desses fluxos.
Reposicoes sao incluidas porque apontam para despesas/movimentacoes removidas.

Preserva saldo/custo do estoque, produtos, categorias, imagens, mesas, usuarios/Auth,
fornecedores, configuracoes, restaurante, lotes e movimentacoes de producao.
Nao chama cancelamento/estorno nem recalcula saldo. Apagar consumo nao devolve ingredientes.
Movimentacoes de producao preservadas podem citar IDs de pedidos removidos: sao registros
de auditoria, sem leitura do pedido para calcular saldo. Documentos-pai permanecem.

## Antes de executar

1. Conclua/cancele pedidos e delivery e termine preparos pendentes.
2. Confira reservas da estufa, inclusive de pedidos pagos. Lotes devem ter `reservado = 0`.
3. Receba/cancele reposicoes pendentes, libere mesas e feche o caixa pelo sistema.
4. Pare o uso do restaurante em todos os dispositivos, integracoes e processos que escrevem.
   `--operacao-parada` e declaracao do operador: **nao trava a API**.
5. Se precisar conservar o historico, exporte-o antes. Nao ha backup automatico; exclusao irreversivel.

Nao edite saldo para contornar bloqueios. O script mostra IDs das pendencias.

## PowerShell na raiz do repositorio (pasta python)

Use credencial Admin autorizada: `scripts/service-account.json` (ignorado pelo Git),
`FIREBASE_SERVICE_ACCOUNT_JSON` no ambiente ou Application Default Credentials.
**Login do Firebase CLI sozinho nao autentica o Admin SDK.** Nao versione credenciais.

```powershell
cd scripts
npm ci
# Simulacao: somente leituras; mostra contagens e bloqueios
npm run limpar-cafe-anis
```

Revise o resultado. Para apagar os dados listados, mantendo a operacao parada:

```powershell
npm run limpar-cafe-anis -- --exec --confirmar=rest_cafe_anis_930abfe0d7a82c4b --operacao-parada
```

O script le o plano antes de escrever, usa lotes de ate 400 documentos e exige
que cada documento tenha a versao lida. Interrompe em falhas; lotes anteriores podem
ter sido apagados. **Nao ha transacao/rollback global.** Resolva a causa e simule novamente
antes de repetir. Nao execute com usuarios/integracoes escrevendo: a verificacao
posterior detecta algumas corridas, mas nao impede todas.

Ao concluir, reinicie o backend para descartar cache BI (na Render, reinicie o servico)
e recarregue o aplicativo. Abra novo caixa para retomar vendas.

## Validacao sem Firebase

```powershell
npm run test:limpar-cafe-anis
npx tsc --noEmit
```

Testes simulam o SDK: nenhuma chamada real ou credencial de producao.
