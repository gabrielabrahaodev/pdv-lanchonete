[CmdletBinding()]
param(
    [ValidateRange(30,3600)][int]$TimeoutSegundos = 1200,
    [switch]$PublicarGit,
    [string]$MensagemCommit = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$localAnterior = Get-Location
$apiAnterior = [Environment]::GetEnvironmentVariable('VITE_API_URL','Process')
$corAnterior = [Environment]::GetEnvironmentVariable('NO_COLOR','Process')
$projeto = 'pdv-lanchonete-1fa79'
$api = 'https://pdv-lanchonete-dwiw.onrender.com'
try {
    Set-Location -LiteralPath $PSScriptRoot
    . (Join-Path $PSScriptRoot 'scripts/publicacao-comum.ps1')
    if ($PublicarGit) {
        # Aceita apenas arquivos que o usuario selecionou com "git add".
        # Nunca faz git add -A, reset, stash ou push --force.
        Assert-Repositorio -Raiz $PSScriptRoot -Master -Sincronizado -PermitirStaged -PermitirAhead
        $staged = Get-GitTexto -Argumentos @('diff','--cached','--name-only')
        if ($staged) {
            if ([string]::IsNullOrWhiteSpace($MensagemCommit)) {
                throw 'Ha arquivos staged: informe -MensagemCommit "descricao" junto de -PublicarGit.'
            }
            foreach ($arquivo in @($staged -split "`r?`n" | Where-Object { $_ })) {
                if ($arquivo -match '(?i)(^|/)(\.env(\..*)?|service-account\.json|token\.txt|.*\.pem|.*\.key|.*credentials.*)
    Write-Host 'Destino: Firebase pdv-lanchonete-1fa79 / Hosting nexocomanda'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 20 ou superior.' }
    $versaoNode = (Invoke-Programa -Arquivo node -Argumentos @('-p','process.versions.node') | Out-String).Trim()
    if ([int]($versaoNode.Split('.')[0]) -lt 20) { throw 'Node.js 20 ou superior e necessario.' }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm.cmd nao encontrado. Reinstale o Node.js e reabra o terminal.' }
    if ($env:FIRESTORE_EMULATOR_HOST -or $env:FIREBASE_AUTH_EMULATOR_HOST) { throw 'Remova as variaveis de emulador antes de publicar producao.' }
    $alvos = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '.firebaserc') | ConvertFrom-Json
    if ($alvos.targets.$projeto.hosting.nexocomanda -notcontains 'nexocomanda') { throw 'Alvo Hosting nexocomanda nao configurado neste projeto.' }

    Write-Host '[1/6] Instalando dependencias e validando backend local...'
    $python = Join-Path $PSScriptRoot 'backend/.venv/Scripts/python.exe'
    if (-not (Test-Path $python)) {
        if (Get-Command py -ErrorAction SilentlyContinue) { Invoke-Programa -Arquivo py -Argumentos @('-3','-m','venv','backend/.venv') }
        elseif (Get-Command python -ErrorAction SilentlyContinue) { Invoke-Programa -Arquivo python -Argumentos @('-m','venv','backend/.venv') }
        else { throw 'Instale Python 3.12 e reabra o terminal.' }
    }
    Invoke-Programa -Arquivo $python -Argumentos @('-m','pip','install','-r','backend/requirements-dev.txt')
    Invoke-Programa -Arquivo $python -Argumentos @('-m','pytest','backend/tests','-q')

    Write-Host '[2/6] Instalando dependencias e testando frontend...'
    Set-Location -LiteralPath (Join-Path $PSScriptRoot 'frontend')
    Invoke-Programa -Arquivo npm.cmd -Argumentos @('ci')
    foreach ($teste in @('test:precificacao','test:unidades','test:seguranca','test:cardapio','test:reposicao','test:wiki')) { Invoke-Programa -Arquivo npm.cmd -Argumentos @('run',$teste) }
    Invoke-Programa -Arquivo node -Argumentos @('--test','tests/modal-focus.test.mjs')
    Set-Location -LiteralPath $PSScriptRoot
    if ($PublicarGit) {
        $staged = Get-GitTexto -Argumentos @('diff','--cached','--name-only')
        if ($staged) {
            Invoke-Programa -Arquivo git -Argumentos @('commit','-m',$MensagemCommit)
            Write-Host 'Commit local criado a partir dos arquivos staged.'
        } else {
            Write-Host 'Nenhuma alteracao staged: nao sera criado commit vazio.'
        }
        Invoke-Programa -Arquivo git -Argumentos @('push','origin','master')
        Write-Host 'GitHub atualizado via push normal (sem --force).'
    }
    Assert-Repositorio -Raiz $PSScriptRoot -Master -Sincronizado
    $commit = Get-GitTexto -Argumentos @('rev-parse','HEAD')
    Write-Host "Build e publicacao do commit $commit"
    Set-Location -LiteralPath (Join-Path $PSScriptRoot 'frontend')
    $env:VITE_API_URL = $api
    Invoke-Programa -Arquivo npm.cmd -Argumentos @('run','build')
    Set-Location -LiteralPath $PSScriptRoot
    if (-not (Test-Path 'frontend/dist/index.html')) { throw 'Build nao gerou frontend/dist/index.html.' }
    $firebase = Join-Path $PSScriptRoot 'frontend/node_modules/.bin/firebase.cmd'
    if (-not (Test-Path $firebase)) { throw 'Firebase CLI local nao instalado pelo npm ci.' }
    $env:NO_COLOR = '1'

    Write-Host '[3/6] Validando compatibilidade com Render / disparando deploy so se necessario...'
    Wait-Backend -Url $api -Commit $commit -TimeoutSegundos $TimeoutSegundos
    Write-Host '[4/6] Publicando regras e indices Firestore...'
    Invoke-Programa -Arquivo $firebase -Argumentos @('deploy','--only','firestore:rules,firestore:indexes','--project',$projeto,'--non-interactive')
    $configIndices = Get-Content -Raw -LiteralPath 'firestore.indexes.json' | ConvertFrom-Json
    Wait-Indices -Firebase $firebase -Projeto $projeto -Indices @($configIndices.indexes) -TimeoutSegundos $TimeoutSegundos

    Write-Host '[5/6] Conferindo versao e disponibilidade antes de publicar o Hosting...'
    Assert-Repositorio -Raiz $PSScriptRoot -Master -Sincronizado
    if ((Get-GitTexto -Argumentos @('rev-parse','HEAD')) -ne $commit) { throw 'O commit local mudou durante a publicacao. Execute novamente.' }
    Wait-Backend -Url $api -Commit $commit -TimeoutSegundos $TimeoutSegundos
    Write-Host '[6/6] Publicando exclusivamente o Hosting nexocomanda...'
    Invoke-Programa -Arquivo $firebase -Argumentos @('deploy','--only','hosting:nexocomanda','--project',$projeto,'--non-interactive')
    Write-Host 'PUBLICACAO CONCLUIDA: https://nexocomanda.web.app' -ForegroundColor Green
    Write-Host 'Confira o PWA e a versao em Configuracoes, login e os fluxos alterados.'
} catch {
    Write-Host ('PUBLICACAO INTERROMPIDA: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Se faltar autenticacao, execute firebase login. Etapas anteriores nao sao desfeitas automaticamente.'
    exit 1
} finally {
    [Environment]::SetEnvironmentVariable('VITE_API_URL',$apiAnterior,'Process')
    [Environment]::SetEnvironmentVariable('NO_COLOR',$corAnterior,'Process')
    Set-Location -LiteralPath $localAnterior.Path
}
) {
                    throw 'Arquivo sensivel no stage. Retire-o com git restore --staged e revise antes do deploy.'
                }
            }
            Invoke-Programa -Arquivo git -Argumentos @('diff','--cached','--check')
        }
    } else {
        Assert-Repositorio -Raiz $PSScriptRoot -Master -Sincronizado
    }
    Write-Host 'Publicar NexoComanda - verificando codigo local'
    if ($PublicarGit) { Write-Host 'Modo Git: commit/push apenas dos arquivos previamente adicionados ao stage.' }
    Write-Host 'Destino: Firebase pdv-lanchonete-1fa79 / Hosting nexocomanda'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 20 ou superior.' }
    $versaoNode = (Invoke-Programa -Arquivo node -Argumentos @('-p','process.versions.node') | Out-String).Trim()
    if ([int]($versaoNode.Split('.')[0]) -lt 20) { throw 'Node.js 20 ou superior e necessario.' }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm.cmd nao encontrado. Reinstale o Node.js e reabra o terminal.' }
    if ($env:FIRESTORE_EMULATOR_HOST -or $env:FIREBASE_AUTH_EMULATOR_HOST) { throw 'Remova as variaveis de emulador antes de publicar producao.' }
    $alvos = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot '.firebaserc') | ConvertFrom-Json
    if ($alvos.targets.$projeto.hosting.nexocomanda -notcontains 'nexocomanda') { throw 'Alvo Hosting nexocomanda nao configurado neste projeto.' }

    Write-Host '[1/6] Instalando dependencias e validando backend local...'
    $python = Join-Path $PSScriptRoot 'backend/.venv/Scripts/python.exe'
    if (-not (Test-Path $python)) {
        if (Get-Command py -ErrorAction SilentlyContinue) { Invoke-Programa -Arquivo py -Argumentos @('-3','-m','venv','backend/.venv') }
        elseif (Get-Command python -ErrorAction SilentlyContinue) { Invoke-Programa -Arquivo python -Argumentos @('-m','venv','backend/.venv') }
        else { throw 'Instale Python 3.12 e reabra o terminal.' }
    }
    Invoke-Programa -Arquivo $python -Argumentos @('-m','pip','install','-r','backend/requirements-dev.txt')
    Invoke-Programa -Arquivo $python -Argumentos @('-m','pytest','backend/tests','-q')

    Write-Host '[2/6] Instalando dependencias e testando frontend...'
    Set-Location -LiteralPath (Join-Path $PSScriptRoot 'frontend')
    Invoke-Programa -Arquivo npm.cmd -Argumentos @('ci')
    foreach ($teste in @('test:precificacao','test:unidades','test:seguranca','test:cardapio','test:reposicao')) { Invoke-Programa -Arquivo npm.cmd -Argumentos @('run',$teste) }
    Invoke-Programa -Arquivo node -Argumentos @('--test','tests/modal-focus.test.mjs')
    $env:VITE_API_URL = $api
    Invoke-Programa -Arquivo npm.cmd -Argumentos @('run','build')
    Set-Location -LiteralPath $PSScriptRoot
    if (-not (Test-Path 'frontend/dist/index.html')) { throw 'Build nao gerou frontend/dist/index.html.' }
    $firebase = Join-Path $PSScriptRoot 'frontend/node_modules/.bin/firebase.cmd'
    if (-not (Test-Path $firebase)) { throw 'Firebase CLI local nao instalado pelo npm ci.' }
    $env:NO_COLOR = '1'

    Write-Host '[3/6] Aguardando backend do mesmo commit na Render...'
    Wait-Backend -Url $api -Commit $commit -TimeoutSegundos $TimeoutSegundos
    Write-Host '[4/6] Publicando regras e indices Firestore...'
    Invoke-Programa -Arquivo $firebase -Argumentos @('deploy','--only','firestore:rules,firestore:indexes','--project',$projeto,'--non-interactive')
    $configIndices = Get-Content -Raw -LiteralPath 'firestore.indexes.json' | ConvertFrom-Json
    Wait-Indices -Firebase $firebase -Projeto $projeto -Indices @($configIndices.indexes) -TimeoutSegundos $TimeoutSegundos

    Write-Host '[5/6] Conferindo versao antes de publicar o Hosting...'
    Assert-Repositorio -Raiz $PSScriptRoot -Master -Sincronizado
    if ((Get-GitTexto -Argumentos @('rev-parse','HEAD')) -ne $commit) { throw 'O commit local mudou durante a publicacao. Execute novamente.' }
    Wait-Backend -Url $api -Commit $commit -TimeoutSegundos $TimeoutSegundos
    Write-Host '[6/6] Publicando exclusivamente o Hosting nexocomanda...'
    Invoke-Programa -Arquivo $firebase -Argumentos @('deploy','--only','hosting:nexocomanda','--project',$projeto,'--non-interactive')
    Write-Host 'PUBLICACAO CONCLUIDA: https://nexocomanda.web.app' -ForegroundColor Green
    Write-Host 'Atualize o PWA e confira login, Despesas e Reposicao / Pedidos recebidos.'
} catch {
    Write-Host ('PUBLICACAO INTERROMPIDA: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Se faltar autenticacao, execute firebase login. Etapas anteriores nao sao desfeitas automaticamente.'
    exit 1
} finally {
    [Environment]::SetEnvironmentVariable('VITE_API_URL',$apiAnterior,'Process')
    [Environment]::SetEnvironmentVariable('NO_COLOR',$corAnterior,'Process')
    Set-Location -LiteralPath $localAnterior.Path
}
