# Testes locais sem Firebase/Render. Requer apenas PowerShell e Git.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$fonte = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$temporario = Join-Path ([IO.Path]::GetTempPath()) ('pdv-scripts-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporario | Out-Null
function Assert([bool]$Condicao,[string]$Mensagem) { if (-not $Condicao) { throw $Mensagem } }
function Git-Teste([string[]]$Argumentos) { & git @Argumentos; if ($LASTEXITCODE -ne 0) { throw 'Falha no Git do teste' } }
$inicial = Get-Location
try {
    foreach ($nome in @('atualizar-master.ps1','deploy-prd.ps1','scripts/publicacao-comum.ps1')) {
        $tokens=$null; $erros=$null
        [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $fonte $nome),[ref]$tokens,[ref]$erros) > $null
        Assert ($erros.Count -eq 0) "Erro de sintaxe em $nome"
    }
    $remoto=Join-Path $temporario 'remoto.git'
    $semente=Join-Path $temporario 'semente'
    $copia=Join-Path $temporario 'projeto com espacos'
    Git-Teste @('init','--bare','--initial-branch=master',$remoto)
    Git-Teste @('init','-b','master',$semente)
    Set-Location -LiteralPath $semente
    Git-Teste @('config','user.name','Teste local'); Git-Teste @('config','user.email','teste@example.invalid')
    New-Item -ItemType Directory scripts | Out-Null
    Copy-Item (Join-Path $fonte 'atualizar-master.ps1') .
    Copy-Item (Join-Path $fonte 'scripts/publicacao-comum.ps1') scripts
    # Somente a fixture permite remote de arquivo; o script distribuido exige GitHub.
    $comum=Get-Content -Raw scripts/publicacao-comum.ps1
    $comum=$comum.Replace("if (`$origem -notmatch '(?i)github\.com[:/]gabrielabrahaodev/pdv-lanchonete(?:\.git)?/?$')", "if (`$origem -ne '$($remoto.Replace("'","''"))')")
    Set-Content -LiteralPath scripts/publicacao-comum.ps1 -Value $comum
    Set-Content firebase.json '{}'; Set-Content README.md 'primeiro'
    Git-Teste @('add','.'); Git-Teste @('commit','-m','primeiro'); Git-Teste @('remote','add','origin',$remoto); Git-Teste @('push','-u','origin','master')
    Git-Teste @('clone',$remoto,$copia)
    Set-Content README.md 'segundo'; Git-Teste @('commit','-am','segundo'); Git-Teste @('push','origin','master')
    $executavel=Join-Path $PSHOME $(if ($PSVersionTable.PSEdition -eq 'Desktop') { 'powershell.exe' } elseif ($env:OS -eq 'Windows_NT') { 'pwsh.exe' } else { 'pwsh' })
    & $executavel -NoProfile -File (Join-Path $copia 'atualizar-master.ps1')
    Assert ($LASTEXITCODE -eq 0) 'Atualizacao limpa deveria passar'
    Assert ((Get-Content (Join-Path $copia 'README.md')) -eq 'segundo') 'Nao atualizou o arquivo'
    Set-Content (Join-Path $copia 'README.md') 'trabalho local preservado'
    & $executavel -NoProfile -File (Join-Path $copia 'atualizar-master.ps1')
    Assert ($LASTEXITCODE -eq 1) 'Deveria bloquear alteracao local'
    Assert ((Get-Content (Join-Path $copia 'README.md')) -eq 'trabalho local preservado') 'Perdeu alteracao local'
    Write-Host 'PASS: sintaxe, caminho com espacos, fast-forward e bloqueio sem apagar trabalho.'


    # Pipeline completo com programas/HTTP simulados. Nenhum deploy real.
    Set-Location -LiteralPath $copia
    Set-Content README.md 'segundo'
    Git-Teste @('config','user.name','Teste local'); Git-Teste @('config','user.email','teste@example.invalid')
    Copy-Item (Join-Path $fonte 'deploy-prd.ps1') .
    foreach ($arquivo in @('.firebaserc','firestore.indexes.json')) { Copy-Item (Join-Path $fonte $arquivo) . }
    Set-Content .gitignore "backend/.venv/`nfrontend/node_modules/`nfrontend/dist/"
    New-Item -ItemType Directory -Force backend/.venv/Scripts,frontend/node_modules/.bin | Out-Null
    Set-Content backend/.venv/Scripts/python.exe 'programa simulado'
    Set-Content frontend/node_modules/.bin/firebase.cmd 'programa simulado'
    $global:pdvTestCallsPath=Join-Path $temporario 'pipeline.log'
    $mock=@'
function Invoke-Programa {
    param([string]$Arquivo,[string[]]$Argumentos=@())
    Add-Content -LiteralPath $global:pdvTestCallsPath -Value ($Arquivo+' '+($Argumentos -join ' '))
    if ($Arquivo -eq 'git') { & git @Argumentos; if($LASTEXITCODE -ne 0){throw 'Git falhou na fixture'}; return }
    if ($Arquivo -eq 'node' -and $Argumentos[0] -eq '-p') { '20.0.0'; return }
    if ($Arquivo -eq 'npm.cmd' -and $Argumentos[0] -eq 'run' -and $Argumentos[1] -eq 'build') {
        New-Item -ItemType Directory -Force dist | Out-Null; Set-Content dist/index.html '<html>teste</html>'; return
    }
    if ($Argumentos.Count -gt 0 -and $Argumentos[0] -eq 'firestore:indexes') { '[READY] (items) -- (status,ASCENDING) (createdAt,DESCENDING)'; return }
}
function Wait-Backend { param($Url,$Commit,$TimeoutSegundos) Add-Content -LiteralPath $global:pdvTestCallsPath -Value 'BACKEND VALIDADO' }
'@
    Add-Content scripts/publicacao-comum.ps1 $mock
    Git-Teste @('add','.'); Git-Teste @('commit','-m','fixture deploy'); Git-Teste @('push','origin','master')
    function global:node { }
    function global:npm.cmd { }
    $viteTesteAnterior=[Environment]::GetEnvironmentVariable('VITE_API_URL','Process')
    $env:VITE_API_URL='valor-anterior-teste'
    & (Join-Path $copia 'deploy-prd.ps1') -TimeoutSegundos 30
    Assert ($env:VITE_API_URL -eq 'valor-anterior-teste') 'Variavel VITE_API_URL nao foi restaurada'
    [Environment]::SetEnvironmentVariable('VITE_API_URL',$viteTesteAnterior,'Process')
    $chamadas=Get-Content -LiteralPath $global:pdvTestCallsPath
    $regras=@($chamadas | Where-Object {$_ -match 'deploy --only firestore:rules,firestore:indexes'})
    $hosting=@($chamadas | Where-Object {$_ -match 'deploy --only hosting:nexocomanda'})
    Assert ($regras.Count -eq 1 -and $hosting.Count -eq 1) 'Destinos Firebase incorretos'
    Assert ($chamadas[-1] -match 'hosting:nexocomanda') 'Hosting deve ser a ultima etapa externa'
    Write-Host 'PASS: pipeline simulado completo, destinos corretos, Hosting por ultimo e ambiente restaurado.'
    Remove-Item Function:\node,Function:\npm.cmd -ErrorAction SilentlyContinue

    . (Join-Path $fonte 'scripts/publicacao-comum.ps1')
    $script:rodadas=0
    function Invoke-Programa { param($Arquivo,$Argumentos) $script:rodadas++; if ($script:rodadas -eq 1) { '[CREATING] (items) -- (status,ASCENDING) (createdAt,DESCENDING)' } else { '[READY] (items) -- (status,ASCENDING) (createdAt,DESCENDING)' } }
    function Start-Sleep { param($Seconds) }
    $idx=[pscustomobject]@{collectionGroup='items';fields=@([pscustomobject]@{fieldPath='status';order='ASCENDING'},[pscustomobject]@{fieldPath='createdAt';order='DESCENDING'})}
    Wait-Indices -Firebase 'mock' -Projeto 'demo-test' -Indices @($idx) -TimeoutSegundos 30
    Assert ($script:rodadas -eq 2) 'Nao aguardou a construcao do indice'
    function Invoke-Programa { param($Arquivo,$Argumentos) '[CREATING] (items) -- (status,ASCENDING) (createdAt,DESCENDING)' }
    $bloqueou=$false
    try { Wait-Indices -Firebase mock -Projeto demo -Indices @($idx) -TimeoutSegundos 0 } catch { $bloqueou=$true }
    Assert $bloqueou 'Deveria interromper com indice ainda em construcao'
    $script:consultas=0
    function Invoke-RestMethod { param($Uri,$TimeoutSec) $script:consultas++; if ($Uri -match '/health') { [pscustomobject]@{status='ok';commit='abc'} } else { [pscustomobject]@{status='ready'} } }
    Wait-Backend -Url 'https://teste.invalid' -Commit abc -TimeoutSegundos 0
    Assert ($script:consultas -eq 2) 'Deveria conferir commit e readiness'
    $bloqueou=$false
    try { Wait-Backend -Url 'https://teste.invalid' -Commit outro -TimeoutSegundos 0 } catch { $bloqueou=$true }
    Assert $bloqueou 'Deveria interromper com commit incorreto'
    Write-Host 'PASS: aguardou READY, bloqueou timeout e conferiu commit/readiness sem acesso externo.'
    # Regressao de frontend-only: Render em commit ancestral, sem mudanca backend.
    # Fixture possui alteracoes apenas no README e scripts.
    $historico = @(git rev-list --max-count=3 HEAD)
    Assert ($historico.Count -ge 2) 'Fixture sem historico suficiente'
    Assert (Test-RenderSemMudancaDeBackend -Publicado $historico[-1] -Atual $historico[0]) 'Frontend/docs nao podem exigir redeploy do backend'
    Assert (-not (Test-RenderSemMudancaDeBackend -Publicado ('a' * 40) -Atual $historico[0])) 'SHA desconhecido deve bloquear a compatibilidade'
    Assert (-not (Test-RenderSemMudancaDeBackend -Publicado $historico[0] -Atual $historico[-1])) 'Commit Render futuro nao pode ser aceito'
    Write-Host 'PASS: commit ancestral sem alteracao do backend e aceito; desconhecido/futuro e bloqueado.'
} finally {
    Set-Location -LiteralPath $inicial.Path
    Remove-Item -LiteralPath $temporario -Recurse -Force
}
