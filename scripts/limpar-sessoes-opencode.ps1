#requires -Version 5.1
<#
.SYNOPSIS
    Limpa sessoes antigas do opencode com selecao visual (grid GUI).

.DESCRICAO
    Lista todas as sessoes gravadas em ~/.local/share/opencode/opencode.db,
    abre um grid para voce marcar quais APAGAR, faz backup automatico do banco,
    deleta as linhas relacionadas (message/part/todo/etc.) e roda VACUUM.

.USO
    1. FECHE TODOS os opencode (inclusive o desta conversa).
    2. powershell -ExecutionPolicy Bypass -File scripts\limpar-sessoes-opencode.ps1
       Parametros opcionais:
         -SoLista : so mostra a tabela de sessoes (nao apaga nada)
         -Forcar  : pula a digitacao da palavra de confirmacao

.NOTAS
    - Requer o comando "opencode" no PATH (usa "opencode db" como engine SQL).
    - O backup fica em ~/.local/share/opencode/backup-AAAAMMDD-HHMMSS/.
      Para restaurar: feche o opencode e copie os arquivos de volta para a pasta pai.
#>
param(
    [switch]$SoLista,
    [switch]$Forcar
)

$ErrorActionPreference = 'Stop'

function Invoke-OcDb {
    param([Parameter(Mandatory = $true)][string]$Sql)
    $raw = & opencode db $Sql --format json
    if ($LASTEXITCODE -ne 0) { throw "opencode db falhou: $Sql" }
    $json = ($raw -join "`n")
    if ([string]::IsNullOrWhiteSpace($json)) { return @() }
    $parsed = $json | ConvertFrom-Json
    return @($parsed)
}

$dbPath = Join-Path $env:USERPROFILE '.local\share\opencode\opencode.db'
if (-not (Test-Path -LiteralPath $dbPath)) { throw "Banco nao encontrado: $dbPath" }

$query = @"
SELECT s.id,
       s.title AS titulo,
       s.directory AS projeto,
       datetime(s.time_created/1000,'unixepoch','localtime') AS criado,
       datetime(s.time_updated/1000,'unixepoch','localtime') AS atualizado,
       (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id) AS msgs,
       CAST((((SELECT COALESCE(SUM(LENGTH(data)),0) FROM message m WHERE m.session_id = s.id)
            + (SELECT COALESCE(SUM(LENGTH(data)),0) FROM part p WHERE p.session_id = s.id)
            + (SELECT COALESCE(SUM(LENGTH(content)),0) FROM todo t WHERE t.session_id = s.id)
            ) / 1024.0) AS INTEGER) AS peso_kb
FROM session s
ORDER BY s.time_updated DESC
"@

Write-Host "Lendo sessoes do banco..." -ForegroundColor Cyan
$sessoes = @(Invoke-OcDb $query)

if ($sessoes.Count -eq 0) {
    Write-Host "Nenhuma sessao encontrada." -ForegroundColor Yellow
    return
}

$sessoes | Select-Object titulo, criado, atualizado, projeto, msgs, peso_kb |
    Format-Table -AutoSize | Out-String | Write-Host

if ($SoLista) { return }

# ---- selecao -------------------------------------------------------------
$tituloGrid = "MARQUE as sessoes para APAGAR (Ctrl+clique para multipla escolha) e clique OK"
if (Get-Command Out-GridView -ErrorAction SilentlyContinue) {
    $alvos = @($sessoes | Out-GridView -Title $tituloGrid -PassThru)
}
else {
    Write-Host "Out-GridView indisponivel; selecao por numero." -ForegroundColor Yellow
    for ($i = 0; $i -lt $sessoes.Count; $i++) {
        "{0,4} | {1} | {2} | {3} msgs | {4} KB | {5}" -f `
            ($i + 1), $sessoes[$i].atualizado, $sessoes[$i].titulo, $sessoes[$i].msgs, $sessoes[$i].peso_kb, $sessoes[$i].id
    }
    $entrada = Read-Host "Numeros das sessoes a APAGAR (ex: 1,3,5-9)"
    $indices = @()
    foreach ($parte in ($entrada -split ',')) {
        $p = $parte.Trim()
        if ($p -match '^(\d+)\s*-\s*(\d+)$') {
            $indices += [int]$Matches[1]..[int]$Matches[2]
        }
        elseif ($p -match '^\d+$') { $indices += [int]$p }
    }
    $alvos = @($indices | Sort-Object -Unique | ForEach-Object { $sessoes[$_ - 1] })
}

if ($alvos.Count -eq 0) {
    Write-Host "Nada selecionado. Encerrando sem alterar nada." -ForegroundColor Yellow
    return
}

foreach ($a in $alvos) {
    if ($a.id -notmatch '^ses_[A-Za-z0-9]+$') { throw "id suspeito, abortando: $($a.id)" }
}

$pesoTotal = ($alvos | Measure-Object peso_kb -Sum).Sum
Write-Host ""
Write-Host ("Serao apagadas {0} sessao(es), ~{1} KB de dados:" -f $alvos.Count, $pesoTotal) -ForegroundColor Yellow
$alvos | ForEach-Object { Write-Host ("  - [{0}] {1}" -f $_.atualizado, $_.titulo) }

if (-not $Forcar) {
    $resp = Read-Host "Digite APAGAR para confirmar"
    if ($resp -cne 'APAGAR') {
        Write-Host "Confirmacao invalida. Nada foi alterado." -ForegroundColor Yellow
        return
    }
}

# ---- trava de seguranca: banco nao pode estar aberto para escrita --------
$rodando = Get-Process -Name 'opencode' -ErrorAction SilentlyContinue
if ($rodando) {
    throw "Opencode esta rodando (PID: $(($rodando | ForEach-Object Id) -join ', ')). Feche TODOS antes de apagar."
}

# ---- backup --------------------------------------------------------------
$tstamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bakDir = Join-Path (Split-Path $dbPath -Parent) "backup-$tstamp"
New-Item -ItemType Directory -Path $bakDir -Force | Out-Null
Copy-Item -LiteralPath $dbPath -Destination $bakDir
foreach ($suf in @('-wal', '-shm')) {
    if (Test-Path -LiteralPath "$dbPath$suf") { Copy-Item -LiteralPath "$dbPath$suf" -Destination $bakDir }
}
Write-Host "Backup em: $bakDir" -ForegroundColor Green

# ---- delete (filhos primeiro, depois a sessao) ---------------------------
$antes = (Get-Item -LiteralPath $dbPath).Length
$tabelasFilhas = @('part', 'message', 'todo', 'session_message', 'session_input', 'session_share', 'session_context_epoch')

foreach ($a in $alvos) {
    foreach ($t in $tabelasFilhas) {
        [void](Invoke-OcDb "DELETE FROM $t WHERE session_id = '$($a.id)'")
    }
    [void](Invoke-OcDb "DELETE FROM session WHERE id = '$($a.id)'")
    Write-Host ("apagada: [{0}] {1}" -f $a.atualizado, $a.titulo) -ForegroundColor DarkGray
}

[void](Invoke-OcDb "VACUUM")

$depois = (Get-Item -LiteralPath $dbPath).Length
Write-Host ""
Write-Host ("Pronto. Banco: {0:N1} MB -> {1:N1} MB" -f ($antes / 1MB), ($depois / 1MB)) -ForegroundColor Green
Write-Host "Para desfazer, feche o opencode e copie os arquivos de '$bakDir' de volta para '$(Split-Path $dbPath -Parent)'."
