# Atualização local e publicação

## Arquivos na raiz Git (pasta python)
- `atualizar-master.ps1`: valida pasta/origin e árvore limpa, fetch, switch master, pull --ff-only e confere igualdade com origin/master. Não executa reset, stash, clean, commit ou push. Alterações/arquivos não versionados e commits locais extras interrompem com mensagem, sem apagar trabalho.
- `deploy-prd.bat`: inicia `deploy-prd.ps1` no Windows PowerShell, preservando caminhos com espaços e código de saída. Pausa ao fim quando não está em CI.
- `scripts/publicacao-comum.ps1`: rotinas de segurança, execução de comandos, espera de backend e índices.

Na primeira atualização, os scripts ainda precisam ser baixados com Git. No PowerShell da pasta `pdv-restaurante\python`:

```powershell
git fetch origin
git switch master
git pull --ff-only origin master
```

Nas próximas atualizações:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\atualizar-master.ps1
```

Fechar/reiniciar servidores locais após atualizar. O script não gerencia os processos do VSCode/uvicorn.

## Publicar
Depois da homologação local e merge autorizado:

```powershell
.\deploy-prd.bat
```

Requisitos: Git, Node/npm20+, Python (recomendado3.12), login Firebase com permissão neste projeto. O script usa Firebase CLI local instalado por npm ci; se precisar autenticar: `frontend\node_modules\.bin\firebase.cmd login`.

Ordem:
1. Exige master limpa, origin correto e HEAD igual à master remota. Não atualiza/pusha código por conta própria.
2. Cria venv se necessário, instala requirements-dev e executa pytest; npm ci e todos os testes frontend (incluindo foco), build com VITE_API_URL da Render.
3. Aguarda Render servir o SHA local em `/health.commit` e passar `/ready`. Merge na master já dispara o auto-deploy configurado; não usa API key/hook da Render. Se auto-deploy estiver desativado/falhar, publicar o mesmo commit manualmente na Render e repetir. `/health` continua sem acessar Firestore; `/ready` verifica dependência.
4. Publica `firestore:rules,firestore:indexes` no projeto `pdv-lanchonete-1fa79`, sem `--force`. O modo não interativo interrompe se houver exclusões/configurações que exigem confirmação; revisar diferenças antes, não apagar índices desconhecidos automaticamente.
5. Consulta `firebase firestore:indexes --pretty` e espera os índices correspondentes aparecerem como READY. Verificador usa formato da CLI travada no package-lock, considerando todas as variantes correspondentes; formato inesperado impede prosseguir. Não mede permissões de negócio/resultado da consulta autenticada.
6. Confere novamente master/SHA/backend e publica somente `hosting:nexocomanda`. Não publica o outro Hosting padrão.

Timeout padrão20min para backend e construção dos índices. Pode ampliar com `deploy-prd.bat -TimeoutSegundos 3600`. Timeout/falha não publica Hosting; regras/índices que já tenham sido aplicados não são revertidos automaticamente. Novos índices podem continuar construindo após o script encerrar. Repetir quando prontos é permitido.

Variáveis VITE_API_URL e NO_COLOR são restauradas no finally; nenhum arquivo .env ou credencial é gravado. Variáveis de emulador bloqueiam publicação. Tokens não são pedidos, impressos nem versionados. Nenhuma publicação Firebase foi executada durante a criação/testes destes arquivos.

## Validação
`scripts/tests/publicacao.ps1` usa repositórios Git temporários locais, inclusive pasta com espaços, e programas/HTTP simulados: fast-forward, bloqueio de alterações, preservação de trabalho, ordenação das etapas, destino de Firebase, espera READY/timeout, commit correto/readiness e restauração do ambiente. Não acessa Render/Firebase. Parser PowerShell7.4.6 e testes no Linux; scripts usam sintaxe compatível com Windows PowerShell5.1. Execução real do .bat/Windows e deploy Firebase permanecem para o operador.

Backend passa a informar RENDER_GIT_COMMIT (SHA público de código, sem credenciais) em /health; teste cobre presença e ausência. Fonte: https://render.com/docs/environment-variables . O script não considera health isolado como prova de banco saudável.

Após publicar: testar login, Despesas/período/páginas, Reposição/recebidos, débito em detalhes e atualização do PWA. Sem migração ou alteração manual de dados.


## Deploy sem aguardar indefinidamente a Render (2026-10-28)

O deploy atual compara o SHA do `/health` da Render com o commit do Git.
Se o backend da Render esta em um commit ancestral conhecido e o intervalo nao
alterou `backend/` ou `render.yaml`, aceita o backend existente somente após
`/ready` retornar READY. **Nao exige que commits apenas de frontend/docs
provoquem um redeploy da Render.**

Se houve mudanca no backend, ou o commit da Render nao e ancestral/conhecido,
o script pode acionar o **Deploy Hook** da Render uma unica vez. Configurar no
Windows a variavel de ambiente de usuario `RENDER_DEPLOY_HOOK` com a URL
secreta copiada de Render > servico > Settings > Deploy Hook. Reiniciar CMD
depois de definir a variavel. A URL nao deve ir para Git, wiki publica, logs
ou conversas; nao a exiba para diagnostico. Sem hook configurado, o script
interrompe com mensagem orientando `Manual Deploy > Deploy latest commit`,
em vez de aguardar 20 minutos sem que nada seja disparado. O hook e invocado
**sem ref** para manter auto-deploy ligado. `/ready` continua obrigatorio.

### Publicar commits no Git com protecao

**Modo padrao:** `deploy-prd.bat` exige master limpa/sincronizada,
nao cria commits nem faz push. Mantem publicacao apenas do commit revisado
e integrado na master.

**Modo opcional:** `deploy-prd.bat -PublicarGit -MensagemCommit "mensagem"`
executa testes, cria commit apenas dos arquivos que o operador ja selecionou
explicitamente via `git add <arquivos>`, e faz `git push origin master` normal.
Se nao houver arquivos staged, nao cria commit vazio; permite publicar commits
locais que estejam a frente de origin/master. A branch remota deve ser ancestral
da branch local; divergencia bloqueia o push. Untracked, modificacoes fora do
stage e arquivos de credenciais staged sao bloqueados. Nunca executa `git
add -A`, stash, reset ou force push. A publicacao no Git somente ocorre
apos testes basicos. O CI e a politica de PR continuam recomendados.

**Atenção:** o modo `-PublicarGit` escreve diretamente em master. Use apenas
se suas regras de protecao GitHub permitirem e apos revisar `git diff --cached`.
O modo normal permanece recomendado para features integradas por PR.

O script nao edita dados de producao ate as etapas Firebase; backend e validado
antes das regras/indices e Hosting. Falha no meio da publicacao nao reverte
etapas anteriores automaticamente.
