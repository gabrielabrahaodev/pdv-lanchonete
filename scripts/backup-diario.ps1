# Backup diario do Firestore com retencao e log.
# Chamado pelo Task Scheduler ("PDV-Backup-Firestore", 12:00 diario), mas pode
# rodar manual:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-diario.ps1
# Nao duplica se ja houver backup gerado hoje. Mantem apenas os 14 mais recentes.

$ErrorActionPreference = 'Stop'
$scriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupsDir = Join-Path (Split-Path -Parent $scriptsDir) 'backups'
$logFile = Join-Path $backupsDir 'agendamento.log'
$manter = 14

function Log([string]$msg) {
    $linha = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -LiteralPath $logFile -Value $linha
}

try {
    if (-not (Test-Path $backupsDir)) { New-Item -ItemType Directory -Path $backupsDir | Out-Null }

    $hoje = Get-Date -Format 'yyyy-MM-dd'
    $deHoje = Get-ChildItem $backupsDir -Filter 'backup-*.json' -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime.ToString('yyyy-MM-dd') -eq $hoje }
    if ($deHoje) {
        Log "ja existe backup de hoje ($($deHoje[0].Name)); nada a fazer"
        exit 0
    }

    Log "executando npm run backup..."
    Push-Location $scriptsDir
    $saida = & npm run backup 2>&1
    $code = $LASTEXITCODE
    Pop-Location

    foreach ($l in $saida) { if ("$l".Trim()) { Log "  | $l" } }
    if ($code -ne 0) { throw "npm run backup falhou com codigo $code" }

    # retencao: mantem os N mais recentes
    $antigos = Get-ChildItem $backupsDir -Filter 'backup-*.json' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $manter
    foreach ($a in $antigos) {
        Remove-Item $a.FullName -Force
        Log "retido-fora: removido $($a.Name)"
    }

    $novo = Get-ChildItem $backupsDir -Filter 'backup-*.json' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    Log ("OK backup={0} ({1:N1} KB)" -f $novo.Name, ($novo.Length / 1KB))
    exit 0
}
catch {
    try { Log ("ERRO: " + $_.Exception.Message) } catch {}
    exit 1
}
