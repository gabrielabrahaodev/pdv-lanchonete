#requires -Version 5.1
<#
.SYNOPSIS
    Mescla sessoes do opencode com mesmo assunto em uma unica sessao.

.DESCRICAO
    Voce escolhe uma sessao DESTINO e uma ou mais sessoes ORIGEM.
    Todas as mensagens/partes das origens sao movidas para o destino
    (a cadeia interna parentID de cada origem e preservada porque o
    bloco se move inteiro) e as linhas de sessao das origens sao apagadas.

    As mensagens se ordenam por tempo (ids ULID): se as sessoes foram
    criadas em momentos diferentes, a conversa fica em ordem cronologica.

.USO
    1. FECHE TODOS os opencode (inclusive o desta conversa).
    2. powershell -ExecutionPolicy Bypass -File scripts\mesclar-sessoes-opencode.ps1
       Parametros opcionais:
         -Titulo "novo nome" : renomeia a sessao destino apos a mesclagem
         -SoLista            : so mostra a tabela de sessoes

.NOTAS
    - Requer o comando "opencode" no PATH (usa "opencode db" como engine SQL).
    - Backup automatico em ~/.local/share/opencode/backup-mescla-AAAAMMDD-HHMMSS/.
#>
param(
    [string]$Titulo,
    [switch]$SoLista
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

function Esc-Sql {
    param([string]$S)
    return $S -replace "'", "''"
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
if ($sessoes.Count -eq 0) { Write-Host "Nenhuma sessao encontrada." -ForegroundColor Yellow; return }

$sessoes | Select-Object titulo, criado, atualizado, projeto, msgs, peso_kb |
    Format-Table -AutoSize | Out-String | Write-Host

if ($SoLista) { return }

# ---- escolha do destino ---------------------------------------------------
if (Get-Command Out-GridView -ErrorAction SilentlyContinue) {
    $destino = $sessoes | Out-GridView -Title "ESCOLHA A SESSAO DESTINO (a que permanece) - selecione UMA e clique OK" -OutputMode Single
}
else {
    for ($i = 0; $i -lt $sessoes.Count; $i++) {
        "{0,4} | {1} | {2} | {3} msgs | {4}" -f ($i + 1), $sessoes[$i].atualizado, $sessoes[$i].titulo, $sessoes[$i].msgs, $sessoes[$i].id
    }
    $n = [int](Read-Host "Numero da sessao DESTINO")
    $destino = $sessoes[$n - 1]
}
if (-not $destino) { Write-Host "Nenhum destino selecionado." -ForegroundColor Yellow; return }
if ($destino.id -notmatch '^ses_[A-Za-z0-9]+$') { throw "id suspeito, abortando: $($destino.id)" }

# ---- escolha das origens --------------------------------------------------
$candidatas = @($sessoes | Where-Object { $_.id -ne $destino.id })
if ($candidatas.Count -eq 0) { Write-Host "Nao ha outras sessoes para mesclar." -ForegroundColor Yellow; return }

if (Get-Command Out-GridView -ErrorAction SilentlyContinue) {
    $origens = @($candidatas | Out-GridView -Title "MARQUE as sessoes ORIGEM (serao absorvidas pela destino) e clique OK" -PassThru)
}
else {
    for ($i = 0; $i -lt $candidatas.Count; $i++) {
        "{0,4} | {1} | {2} | {3} msgs | {4}" -f ($i + 1), $candidatas[$i].atualizado, $candidatas[$i].titulo, $candidatas[$i].msgs, $candidatas[$i].id
    }
    $entrada = Read-Host "Numeros das sessoes ORIGEM (ex: 2,5-7)"
    $indices = @()
    foreach ($parte in ($entrada -split ',')) {
        $p = $parte.Trim()
        if ($p -match '^(\d+)\s*-\s*(\d+)$') { $indices += [int]$Matches[1]..[int]$Matches[2] }
        elseif ($p -match '^\d+$') { $indices += [int]$p }
    }
    $origens = @($indices | Sort-Object -Unique | ForEach-Object { $candidatas[$_ - 1] })
}
if ($origens.Count -eq 0) { Write-Host "Nenhuma origem selecionada. Nada foi alterado." -ForegroundColor Yellow; return }

foreach ($o in $origens) {
    if ($o.id -notmatch '^ses_[A-Za-z0-9]+$') { throw "id suspeito, abortando: $($o.id)" }
}

$msgsOrigem = ($origens | Measure-Object msgs -Sum).Sum
Write-Host ""
Write-Host ("DESTINO : [{0}] {1} ({2} msgs)" -f $destino.atualizado, $destino.titulo, $destino.msgs) -ForegroundColor Green
$origens | ForEach-Object { Write-Host ("ORIGEM  : [{0}] {1} ({2} msgs)" -f $_.atualizado, $_.titulo, $_.msgs) -ForegroundColor Yellow }
Write-Host ""
$resp = Read-Host "Digite MESCLAR para confirmar"
if ($resp -cne 'MESCLAR') { Write-Host "Cancelado. Nada foi alterado." -ForegroundColor Yellow; return }

# ---- trava de seguranca: banco nao pode estar aberto para escrita --------
$rodando = Get-Process -Name 'opencode' -ErrorAction SilentlyContinue
if ($rodando) {
    throw "Opencode esta rodando (PID: $(($rodando | ForEach-Object Id) -join ', ')). Feche TODOS antes de mesclar."
}

# ---- backup ---------------------------------------------------------------
$tstamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bakDir = Join-Path (Split-Path $dbPath -Parent) "backup-mescla-$tstamp"
New-Item -ItemType Directory -Path $bakDir -Force | Out-Null
Copy-Item -LiteralPath $dbPath -Destination $bakDir
foreach ($suf in @('-wal', '-shm')) {
    if (Test-Path -LiteralPath "$dbPath$suf") { Copy-Item -LiteralPath "$dbPath$suf" -Destination $bakDir }
}
Write-Host "Backup em: $bakDir" -ForegroundColor Green

# ---- merge ----------------------------------------------------------------
$tabelasFilhas = @('part', 'message', 'todo', 'session_message', 'session_input', 'session_share', 'session_context_epoch')
$antes = (Get-Item -LiteralPath $dbPath).Length

foreach ($o in $origens) {
    foreach ($t in $tabelasFilhas) {
        [void](Invoke-OcDb "UPDATE $t SET session_id = '$($destino.id)' WHERE session_id = '$($o.id)'")
    }
    [void](Invoke-OcDb "DELETE FROM session WHERE id = '$($o.id)'")
    Write-Host ("absorvida: [{0}] {1}" -f $o.atualizado, $o.titulo) -ForegroundColor DarkGray
}

# atualiza carimbo de tempo do destino e titulo opcional
[void](Invoke-OcDb (@"
UPDATE session
SET time_updated = COALESCE((SELECT MAX(time_updated) FROM message WHERE session_id = '{0}'), time_updated)
WHERE id = '{0}'
"@ -f $destino.id))

if ($Titulo) {
    [void](Invoke-OcDb "UPDATE session SET title = '$(Esc-Sql $Titulo)' WHERE id = '$($destino.id)'")
}

[void](Invoke-OcDb "VACUUM")

$depois = (Get-Item -LiteralPath $dbPath).Length
$totalMsgs = ((Invoke-OcDb "SELECT COUNT(*) AS n FROM message WHERE session_id = '$($destino.id)'") | Select-Object -First 1).n

Write-Host ""
Write-Host ("Pronto. Sessao '{0}' agora tem {1} mensagens ({2} vindas das origens)." -f $destino.titulo, $totalMsgs, $msgsOrigem) -ForegroundColor Green
Write-Host ("Banco: {0:N1} MB -> {1:N1} MB" -f ($antes / 1MB), ($depois / 1MB))
Write-Host "Para desfazer, feche o opencode e copie os arquivos de '$bakDir' de volta para '$(Split-Path $dbPath -Parent)'."
