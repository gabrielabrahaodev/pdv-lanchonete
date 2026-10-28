# Compativel com Windows PowerShell 5.1. Nenhuma credencial e armazenada aqui.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Programa {
    param([Parameter(Mandatory=$true)][string]$Arquivo, [string[]]$Argumentos = @())
    & $Arquivo @Argumentos
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao executar $Arquivo (codigo $LASTEXITCODE). Publicacao/atualizacao interrompida."
    }
}

function Get-GitTexto {
    param([string[]]$Argumentos)
    return ((Invoke-Programa -Arquivo git -Argumentos $Argumentos) | Out-String).Trim()
}

function Assert-Repositorio {
    param([string]$Raiz, [switch]$Master, [switch]$Sincronizado)
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Instale o Git e abra novamente o terminal.' }
    if (-not (Test-Path (Join-Path $Raiz 'firebase.json'))) { throw 'Execute os arquivos na raiz Git do projeto (pasta python), junto de firebase.json.' }
    $gitRaiz = Get-GitTexto -Argumentos @('rev-parse','--show-toplevel')
    if ((Resolve-Path $gitRaiz).Path.TrimEnd('\','/') -ne (Resolve-Path $Raiz).Path.TrimEnd('\','/')) {
        throw 'A pasta do script nao corresponde a raiz deste repositorio Git.'
    }
    $origem = Get-GitTexto -Argumentos @('remote','get-url','origin')
    if ($origem -notmatch '(?i)github\.com[:/]gabrielabrahaodev/pdv-lanchonete(?:\.git)?/?$') {
        throw 'O origin nao corresponde ao repositorio pdv-lanchonete esperado.'
    }
    $mudancas = Get-GitTexto -Argumentos @('status','--porcelain','--untracked-files=normal')
    if ($mudancas) { throw 'Existem alteracoes ou arquivos nao versionados. Salve/revise seu trabalho antes. O script nao apaga, nao faz stash e nao usa reset.' }
    if ($Master -and (Get-GitTexto -Argumentos @('branch','--show-current')) -ne 'master') {
        throw 'Execute atualizar-master.ps1 primeiro. A publicacao exige a branch master.'
    }
    if ($Sincronizado) {
        Invoke-Programa -Arquivo git -Argumentos @('fetch','origin','master')
        if ((Get-GitTexto -Argumentos @('rev-parse','HEAD')) -ne (Get-GitTexto -Argumentos @('rev-parse','origin/master'))) {
            throw 'A master local difere do GitHub. Execute atualizar-master.ps1 e tente novamente.'
        }
    }
}

function Wait-Backend {
    param([string]$Url, [string]$Commit, [int]$TimeoutSegundos = 1200)
    $limite = [DateTime]::UtcNow.AddSeconds($TimeoutSegundos)
    do {
        try {
            $saude = Invoke-RestMethod -Uri ($Url + '/health?v=' + [DateTime]::UtcNow.Ticks) -TimeoutSec 45
            if ($saude.status -eq 'ok' -and $saude.commit -eq $Commit) {
                $pronto = Invoke-RestMethod -Uri ($Url + '/ready') -TimeoutSec 45
                if ($pronto.status -eq 'ready') { Write-Host 'Backend no commit correto e Firestore acessivel.'; return }
            }
        } catch { Write-Host 'Backend ainda iniciando ou aguardando atualizacao...' }
        Write-Host 'Aguardando o auto-deploy da Render para o commit local...'
        Start-Sleep -Seconds 15
    } while ([DateTime]::UtcNow -lt $limite)
    throw 'Tempo esgotado aguardando a Render. Confira o deploy do commit no painel e execute novamente. O Hosting nao foi publicado.'
}

function Wait-Indices {
    param([string]$Firebase, [string]$Projeto, [object[]]$Indices, [int]$TimeoutSegundos = 1200)
    if ($Indices.Count -eq 0) { return }
    $limite = [DateTime]::UtcNow.AddSeconds($TimeoutSegundos)
    do {
        $texto = (Invoke-Programa -Arquivo $Firebase -Argumentos @('firestore:indexes','--pretty','--project',$Projeto,'--non-interactive') | Out-String) -replace '\x1b\[[0-9;]*m',''
        $todosProntos = $true
        foreach ($indice in $Indices) {
            $padrao = '\(' + [regex]::Escape($indice.collectionGroup) + '\).*'
            foreach ($campo in $indice.fields) {
                if (-not $campo.PSObject.Properties['order']) { throw 'O verificador suporta indices ordenados. Revise a configuracao antes de publicar.' }
                $padrao += '\(' + [regex]::Escape($campo.fieldPath + ',' + $campo.order) + '\).*'
            }
            $linhas = @($texto -split "`r?`n" | Where-Object { $_ -match $padrao })
            if ($linhas.Count -eq 0 -or @($linhas | Where-Object { $_ -notmatch '^\s*\[READY\]' }).Count -gt 0) { $todosProntos = $false }
        }
        if ($todosProntos) { Write-Host 'Indices correspondentes em estado READY.'; return }
        Write-Host 'Indices ainda em construcao. O Hosting sera publicado somente depois...'
        Start-Sleep -Seconds 15
    } while ([DateTime]::UtcNow -lt $limite)
    throw 'Indice ainda nao esta READY. Aguarde a construcao no Firebase e execute novamente. O Hosting nao foi publicado.'
}
