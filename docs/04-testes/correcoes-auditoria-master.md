# Correções da auditoria da master

Base: `9b6fa71355247520f863cbdc1a3928fd55b58e9c`.
Branch: `fix/auditoria-master-integridade`.

## Comportamentos corrigidos

- Autorização da API verifica revogação do token, vínculo ativo e papel atual no cadastro. Desativar também desabilita a conta no Auth e revoga sessões. Excluir não ignora falhas do Auth.
- Firestore exige perfil ativo do restaurante. Despesas, fornecedores, caixa, agregados e listagem de usuários são restritos a admin/gerente/caixa; cada usuário pode ler seu próprio perfil. Coleções internas de eventos não têm leitura pelo cliente. Escrita direta continua negada.
- A impressão escapa HTML no título e nas linhas, incluindo observações dos itens.
- Edições de despesas utilizam revisão incremental transacional para identificar eventos distintos, inclusive quando os timestamps coincidem. Valor editado deve ser positivo e finito.
- Os agregados somam pagamentos repetidos da mesma modalidade e linhas repetidas do mesmo produto.
- Cancelar item recalcula o total. Pedidos fechados não aceitam mudanças de itens; pedidos com pagamentos não aceitam remoção/cancelamento de itens. Transições seguem pendente → preparo → pronto → entregue, com cancelamento enquanto o pedido está aberto e sem pagamentos. Repetir o mesmo status é idempotente.
- Cancelamento após baixa não devolve ingredientes, conforme regra existente. Despesas continuam sem movimentar o caixa.
- Fechamento e sangria/suprimento releem e atualizam a sessão em transação, validando que continua aberta.
- Mesa vinculada a pedido não pode ser liberada/removida manualmente. A abertura de pedido verifica também o vínculo, mesmo em mesas com status legado inconsistente.
- Inclusão de itens usa `POST /pedidos/{pedido_id}/itens/lote` com `Idempotency-Key`, valida todos os produtos antes de escrever e inclui a baixa de estoque na transação. Retry do mesmo lote não duplica itens nem baixa. A tela mantém corpo/chave e bloqueia edição do carrinho quando o resultado do envio é incerto.
- Listeners normalizam `createdAt/updatedAt` para `criadoEm/atualizadoEm`.
- Interface oculta ações financeiras por papel; cache de API do service worker foi removido e cache de consultas é limpo ao mudar a sessão.

## Validação

Comandos na raiz:

```sh
python -m pytest backend/tests -q
cd frontend
npm run test:precificacao
npm run test:seguranca
npm run build
npx firebase emulators:exec --only firestore --project demo-p0a "node tests/firestore_rules.test.mjs"
```

O emulador exige Java 21+. Os testes Python usam Firestore simulado e não acessam produção. As regras são verificadas no emulador real, incluindo usuário inativo, papel antigo no token, acesso entre restaurantes e escrita negada.

A validação visual/E2E com login real ainda é necessária antes da publicação em produção, conforme AGENTS.md. O download do Chromium neste ambiente retornou arquivo inválido; a suíte PowerShell com credenciais reais não foi executada.

## Dados históricos e publicação

As correções não alteram automaticamente dados já gravados. Antes de publicar regras que exigem perfil ativo, confira se os usuários legítimos possuem documento em `usuarios/items/{uid}` com `ativo: true` e `papel` válido. Perfil ausente/inativo é rejeitado deliberadamente.

Para reconstruir agregados, com credenciais administrativas configuradas e na raiz:

```powershell
backend\.venv\Scripts\python scripts/reconstruir_agregados.py --restaurante restaurante_001
```

Esse comando é uma simulação, sem escrita. Confira o restaurante e os períodos antes de aplicar, em janela sem lançamentos concorrentes e com exportação dos agregados atuais para reversão:

```powershell
backend\.venv\Scripts\python scripts/reconstruir_agregados.py --restaurante restaurante_001 --apply
```

O script solicita `RECONSTRUIR`. Recalcula a partir de pedidos, despesas e movimentações e zera agregados de períodos existentes sem fontes. Não altera pedidos, pagamentos ou despesas. Não corrige cobranças antigas indevidas por cancelamento: estas exigem conciliação específica. Nenhuma reconstrução foi executada em produção nesta entrega.

Publicar o backend antes do frontend que utiliza a nova rota em lote; publicar as regras junto da atualização de permissões. O merge na master dispara o auto-deploy do backend no Render. Hosting e regras precisam de publicação no Firebase. O código mantém os targets default/nexocomanda no mesmo projeto.
