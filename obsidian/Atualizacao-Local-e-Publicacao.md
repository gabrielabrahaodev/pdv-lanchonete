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
