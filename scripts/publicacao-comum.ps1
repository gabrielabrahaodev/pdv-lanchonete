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
    param([string]$Raiz, [switch]$Master, [switch]$Sincronizado, [switch]$PermitirStaged, [switch]$PermitirAhead)
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
    if ($PermitirStaged) {
        foreach ($linha in @($mudancas -split "`r?`n" | Where-Object { $_ })) {
            # Somente arquivos conscientemente selecionados com git add:
            # indice alterado e arvore de trabalho limpa. Nunca inclui ??.
            if ($linha.Length -lt 3 -or $linha.Substring(0,2) -notmatch '^[AMDRC] 
    if ($Master -and (Get-GitTexto -Argumentos @('branch','--show-current')) -ne 'master') {
        throw 'Execute atualizar-master.ps1 primeiro. A publicacao exige a branch master.'
    }
    if ($Sincronizado) {
        Invoke-Programa -Arquivo git -Argumentos @('fetch','origin','master')
        if ($PermitirAhead) {
            & git merge-base --is-ancestor origin/master HEAD
            if ($LASTEXITCODE -ne 0) { throw 'A master local divergiu da origin/master. Execute atualizar-master.ps1 e reconcilie o historico sem force push.' }
        } elseif ((Get-GitTexto -Argumentos @('rev-parse','HEAD')) -ne (Get-GitTexto -Argumentos @('rev-parse','origin/master'))) {
            throw 'A master local difere do GitHub. Execute atualizar-master.ps1 e tente novamente.'
        }
    }
}

function Test-RenderSemMudancaDeBackend {
    param([string]$Publicado, [string]$Atual)
    # Falha fechada se o commit da Render nao for conhecido ou nao ancestral.
    if ($Publicado -notmatch '^[0-9a-f]{40}$' -or $Atual -notmatch '^[0-9a-f]{40}$') { return $false }
    & git cat-file -e "$Publicado^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    & git merge-base --is-ancestor $Publicado $Atual
    if ($LASTEXITCODE -ne 0) { return $false }
    & git diff --quiet $Publicado $Atual -- backend render.yaml
    return ($LASTEXITCODE -eq 0)
}

function Invoke-DeployRender {
    # Segredo configurado SO no Windows. Nunca registrar URL, parametros ou resposta.
    $hook = [Environment]::GetEnvironmentVariable('RENDER_DEPLOY_HOOK', 'Process')
    if ([string]::IsNullOrWhiteSpace($hook)) {
        throw 'Backend mudou, mas Render nao atualizou. Configure RENDER_DEPLOY_HOOK (Settings > Deploy Hook na Render), ou faca Manual Deploy > Deploy latest commit; depois execute novamente.'
    }
    $uri = $null
    if (-not [Uri]::TryCreate($hook, [UriKind]::Absolute, [ref]$uri) -or
        $uri.Scheme -ne 'https' -or $uri.Host -notin @('api.render.com','deploy.render.com')) {
        throw 'RENDER_DEPLOY_HOOK invalido. Use a URL HTTPS fornecida pela Render (sem coloca-la no Git).'
    }
    try {
        # Sem ?ref=: Render usa o ultimo commit da branch e MANTEM auto-deploy ligado.
        $resposta = Invoke-WebRequest -Uri $uri.AbsoluteUri -Method Post -UseBasicParsing -TimeoutSec 45
        if ([int]$resposta.StatusCode -notin @(200,202)) { throw 'HTTP nao aceito' }
        Write-Host 'Deploy da Render solicitado com sucesso (latest commit).'
    } catch {
        throw 'Nao foi possivel acionar o Deploy Hook da Render. Verifique o hook e o servico no painel, sem compartilhar a URL secreta.'
    }
}

function Wait-Backend {
    param([string]$Url, [string]$Commit, [int]$TimeoutSegundos = 1200)
    $limite = [DateTime]::UtcNow.AddSeconds($TimeoutSegundos)
    $hookChamado = $false
    do {
        $saude = $null
        try {
            $saude = Invoke-RestMethod -Uri ($Url + '/health?v=' + [DateTime]::UtcNow.Ticks) -TimeoutSec 45
        } catch {
            Write-Host 'Render inacessivel ou acordando; consultando novamente...'
        }
        if ($null -ne $saude -and $saude.status -eq 'ok') {
            $compativel = $false
            if ($saude.commit -eq $Commit) {
                $compativel = $true
            } elseif (Test-RenderSemMudancaDeBackend -Publicado ([string]$saude.commit) -Atual $Commit) {
                Write-Host ('Render no commit ' + ([string]$saude.commit).Substring(0,12) + '; sem alteracoes backend/render.yaml ate ' + $Commit.Substring(0,12) + '. Sem redeploy desnecessario.')
                $compativel = $true
            } else {
                if (-not $hookChamado) {
                    Write-Host 'A API na Render precisa de uma versao mais recente.'
                    Invoke-DeployRender
                    $hookChamado = $true
                }
            }
            if ($compativel) {
                try {
                    $pronto = Invoke-RestMethod -Uri ($Url + '/ready') -TimeoutSec 45
                    if ($pronto.status -eq 'ready') {
                        Write-Host 'Backend compativel e Firestore acessivel.'
                        return
                    }
                } catch { Write-Host 'Backend respondeu, mas /ready ainda nao esta pronto.' }
            }
        }
        if ([DateTime]::UtcNow -ge $limite) { break }
        Write-Host 'Aguardando Render ficar pronta...'
        Start-Sleep -Seconds 15
    } while ([DateTime]::UtcNow -lt $limite)
    throw 'Tempo esgotado na Render. Confira status de /health, /ready e Deploys no painel. Hosting nao foi publicado.'
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
) {
                throw 'Ha arquivos nao versionados ou alteracoes fora do stage. Revise git status. Use git add apenas nos arquivos aprovados.'
            }
        }
    } elseif ($mudancas) { throw 'Existem alteracoes ou arquivos nao versionados. Salve/revise seu trabalho antes. O script nao apaga, nao faz stash e nao usa reset.' }
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
