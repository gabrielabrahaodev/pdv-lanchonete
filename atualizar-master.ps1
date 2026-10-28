# Execute na pasta Git do projeto, junto de firebase.json.
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$localAnterior = Get-Location
try {
    Set-Location -LiteralPath $PSScriptRoot
    . (Join-Path $PSScriptRoot 'scripts/publicacao-comum.ps1')
    Assert-Repositorio -Raiz $PSScriptRoot
    Invoke-Programa -Arquivo git -Argumentos @('fetch','origin','master')
    Invoke-Programa -Arquivo git -Argumentos @('switch','master')
    Invoke-Programa -Arquivo git -Argumentos @('pull','--ff-only','origin','master')
    if ((Get-GitTexto -Argumentos @('rev-parse','HEAD')) -ne (Get-GitTexto -Argumentos @('rev-parse','origin/master'))) {
        throw 'Existem commits locais fora da master remota. Eles foram preservados; revise-os antes de publicar.'
    }
    Write-Host ('Projeto atualizado na master: ' + (Get-GitTexto -Argumentos @('rev-parse','--short','HEAD'))) -ForegroundColor Green
    Write-Host 'Reinicie os servidores locais se estiverem abertos. Para publicar, execute deploy-prd.bat.'
} catch {
    Write-Host ('ATUALIZACAO INTERROMPIDA: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally { Set-Location -LiteralPath $localAnterior.Path }
