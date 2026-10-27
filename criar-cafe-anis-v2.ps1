# Execute na raiz do repositorio (pasta python), junto de firebase.json.
param([ValidateRange(0,50)][int]$QuantidadeMesas = 12)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
if (-not (Test-Path (Join-Path $projectRoot 'firebase.json'))) {
    throw 'Salve este script junto de firebase.json, na raiz do projeto.'
}
$python = Join-Path $projectRoot 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw 'Python do backend nao encontrado: backend\.venv\Scripts\python.exe. Prepare o ambiente do backend antes de executar.'
}
Write-Host 'Criar Cafe Anis em PRD: pdv-lanchonete-1fa79'
Write-Host 'Conta: rogerio@anis.com | Papel: admin do restaurante'
Write-Host "Mesas: $QuantidadeMesas | Nao concede acesso de dono da plataforma."
Write-Host 'A senha sera solicitada sem aparecer na tela e nao sera salva em arquivo.'
$probe = & $python -c "import sys; import firebase_admin; import google.cloud.firestore; print('PDV_PYTHON_OK', flush=True)"
if ($LASTEXITCODE -ne 0 -or (($probe -join '') -notmatch 'PDV_PYTHON_OK')) {
    throw 'O Python da venv nao confirmou execucao/dependencias. Execute backend\.venv\Scripts\python.exe --version para diagnosticar.'
}
Write-Host 'Python e dependencias: OK.'
$secret = Read-Host 'Digite a senha inicial solicitada para Rogerio' -AsSecureString
$pyCode = @'
"""Provisionamento administrativo especifico: Cafe Anis. Nao promove dono da plataforma."""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT = 'pdv-lanchonete-1fa79'
EMAIL = 'rogerio@anis.com'
NAME = 'Caf\u00e9 Anis'
SUFFIX = hashlib.sha256(EMAIL.encode()).hexdigest()[:16]
UID = 'provision_cafe_anis_' + SUFFIX
RID = 'rest_cafe_anis_' + SUFFIX


def provision(db, auth, password, mesas):
    from google.cloud.firestore import transactional
    if not isinstance(password, str) or len(password) < 6:
        raise ValueError('A senha deve ter pelo menos 6 caracteres.')
    if not isinstance(mesas, int) or not 0 <= mesas <= 50:
        raise ValueError('Quantidade de mesas deve estar entre 0 e 50.')

    # Nao adota contas preexistentes nem altera senhas em repeticoes.
    try:
        user = auth.get_user_by_email(EMAIL)
    except auth.UserNotFoundError:
        user = None
    if user and (user.uid != UID or user.disabled):
        raise ValueError('E-mail ja cadastrado por outro fluxo ou conta desativada. Nada foi sobrescrito.')
    for doc in db.collection('restaurantes').where('nome', '==', NAME).stream():
        if doc.id != RID:
            raise ValueError('Ja existe outro Cafe Anis. Revise o cadastro antes de prosseguir.')
    global_data = db.document('sistema/global').get().to_dict() or {}
    if UID in global_data.get('donoUids', []):
        raise ValueError('Conta consta como dona da plataforma. Revise manualmente.')
    if user:
        claims = user.custom_claims or {}
        if claims.get('restaurantId') not in (None, RID) or claims.get('papel') not in (None, 'admin'):
            raise ValueError('Conta tem vinculo ou papel diferente. Nada foi sobrescrito.')
    else:
        user = auth.create_user(uid=UID, email=EMAIL, password=password,
                                display_name='Rogerio', email_verified=False, disabled=False)

    root = db.document('restaurantes/' + RID)
    marker = db.document('onboarding/' + UID)
    prefix = 'restaurantes/' + RID + '/data/'
    profile = db.document(prefix + 'usuarios/items/' + UID)

    @transactional
    def create(t):
        raiz = next(iter(t.get(root)))
        marca = next(iter(t.get(marker)))
        perfil = next(iter(t.get(profile)))
        sistema = next(iter(t.get(db.document('sistema/global'))))
        if UID in (sistema.to_dict() or {}).get('donoUids', []):
            raise ValueError('Conta tem acesso de plataforma. Operacao interrompida.')
        if raiz.exists:
            r, m, p = raiz.to_dict(), marca.to_dict() or {}, perfil.to_dict() or {}
            if (r.get('criadorUid') != UID or r.get('nome') != NAME or
                m.get('restaurantId') != RID or p.get('papel') != 'admin' or
                p.get('ativo') is not True or p.get('restaurantId') != RID or p.get('email') != EMAIL):
                raise ValueError('Cadastro existente inconsistente. Revise; nada sera sobrescrito.')
            return False
        if marca.exists or perfil.exists:
            raise ValueError('Vinculo preexistente inconsistente. Revise manualmente.')
        agora = datetime.now(timezone.utc)
        stamp = {'createdAt': agora, 'updatedAt': agora}
        t.set(root, {'nome': NAME, 'criadoEm': agora, 'criadorUid': UID})
        t.set(db.document(prefix+'configuracoes'), {
            **stamp, 'nome': NAME, 'moeda': 'BRL', 'timezone': 'America/Sao_Paulo',
            'impressoraTipo': 'bluetooth', 'impressoraEndereco': '',
            'baixaEstoqueAutomatica': True, 'cardapioDigitalAtivo': True})
        for kind in ['categorias','produtos','mesas','estoque','pedidos','movimentacoes_estoque',
                     'usuarios','sessoes_caixa','lotes_producao','movimentacoes_producao']:
            t.set(db.document(prefix+kind), {**stamp, 'nome': kind.capitalize()})
        for numero in range(1, mesas+1):
            t.set(db.document(prefix+f'mesas/items/mesa_{numero:02d}'), {
                **stamp, 'numero': numero, 'status': 'livre', 'pedidoAtivoId': None, 'garcomId': None})
        t.set(profile, {'nome': 'Rogerio', 'email': EMAIL, 'papel': 'admin', 'ativo': True,
                        'tema': 'claro', 'restaurantId': RID, 'criadoEm': agora, 'atualizadoEm': agora})
        t.set(marker, {'restaurantId': RID, 'criadoEm': agora})
        return True

    created = create(db.transaction())
    # Firebase Auth nao faz parte da transacao Firestore. IDs fixos permitem
    # repetir apos falha sem duplicar dados nem redefinir a senha existente.
    latest = auth.get_user(UID)
    claims = latest.custom_claims or {}
    if latest.disabled or claims.get('restaurantId') not in (None, RID) or claims.get('papel') not in (None, 'admin'):
        raise ValueError('Conta mudou durante a operacao. Revise o vinculo.')
    if claims.get('restaurantId') != RID or claims.get('papel') != 'admin':
        auth.set_custom_user_claims(UID, {**claims, 'restaurantId': RID, 'papel': 'admin'})
    final = auth.get_user(UID).custom_claims or {}
    if final.get('restaurantId') != RID or final.get('papel') != 'admin':
        raise RuntimeError('Vinculo nao confirmado. Execute novamente para recuperar.')
    return {'criadoAgora': created, 'restaurantId': RID, 'uid': UID, 'email': EMAIL, 'papel': 'admin'}


def main():
    import firebase_admin
    from firebase_admin import auth, credentials, firestore
    if os.environ.get('FIRESTORE_EMULATOR_HOST') or os.environ.get('FIREBASE_AUTH_EMULATOR_HOST'):
        raise ValueError('Este script e destinado a PRD. Remova as variaveis de emulador para utiliza-lo.')
    root = Path(sys.argv[1])
    account = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON')
    if account:
        credential = json.loads(account)
    else:
        path = root / 'scripts' / 'service-account.json'
        if not path.is_file():
            raise ValueError('Credencial ausente: scripts/service-account.json ou FIREBASE_SERVICE_ACCOUNT_JSON.')
        credential = json.loads(path.read_text(encoding='utf-8-sig'))
    if credential.get('project_id') != PROJECT:
        raise ValueError('Credencial pertence a outro projeto. Esperado: '+PROJECT)
    print('Credencial do projeto correto carregada.', flush=True)
    args = json.load(sys.stdin)
    firebase_admin.initialize_app(credentials.Certificate(credential), {'projectId': PROJECT})
    print('Verificando conta e criando/vinculando restaurante no Firebase...', flush=True)
    result = provision(firestore.client(), auth, args['senha'], args['mesas'])
    print(json.dumps(result, ensure_ascii=True, indent=2))
    print('Concluido. Acesse https://nexocomanda.web.app com a conta informada.')
    print('Em repeticoes, a senha existente e as configuracoes sao preservadas.')
    print('PDV_CAFE_ANIS_SUCESSO', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Nao imprime payloads, senha, credenciais nem resposta bruta do SDK.
        message = str(exc) if isinstance(exc, ValueError) else type(exc).__name__
        print('FALHA: '+message, file=sys.stderr)
        print('Pode haver etapas concluidas. Repita este mesmo script para recuperar; nao apague a conta.', file=sys.stderr)
        sys.exit(1)

'@
$temp = Join-Path ([IO.Path]::GetTempPath()) ('pdv-cafe-anis-' + [guid]::NewGuid().ToString('N') + '.py')
$previousEncoding = $OutputEncoding
$previousPythonEncoding = $env:PYTHONIOENCODING
$pointer = [IntPtr]::Zero
$exitCode = 1
try {
    [IO.File]::WriteAllText($temp, $pyCode, (New-Object System.Text.UTF8Encoding($false)))
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $env:PYTHONIOENCODING = 'utf-8'
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $payload = @{senha=$plain; mesas=$QuantidadeMesas} | ConvertTo-Json -Compress
    Write-Host 'Executando cadastro. Aguarde o resultado do Firebase...'
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $python
    $info.Arguments = '-u "' + $temp + '" "' + $projectRoot + '"'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $info.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try {
        if (-not $process.Start()) { throw 'Nao foi possivel iniciar Python.' }
        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        # JSON ASCII evita problemas de codificacao no Windows PowerShell 5.1.
        $safePayload = [regex]::Replace($payload, '[^\x00-\x7F]', {
            param($match)
            '\u{0:x4}' -f [int][char]$match.Value
        })
        $process.StandardInput.WriteLine($safePayload)
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(120000)) {
            $process.Kill()
            throw 'Tempo esgotado. Pode haver etapas concluidas; repita o mesmo script para recuperar.'
        }
        $stdout = $outTask.GetAwaiter().GetResult()
        $stderr = $errTask.GetAwaiter().GetResult()
        $exitCode = $process.ExitCode
        if ($stdout) { Write-Host $stdout }
        if ($stderr) { Write-Host $stderr -ForegroundColor Yellow }
        Write-Host "Codigo de saida do Python: $exitCode"
        if ($exitCode -eq 0 -and $stdout -notmatch '(?m)^PDV_CAFE_ANIS_SUCESSO\r?$') {
            throw 'Python terminou sem confirmar o cadastro. Nao considere o restaurante criado.'
        }
    } finally {
        $safePayload = $null
        $process.Dispose()
    }
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $plain = $null
    $payload = $null
    $secret.Dispose()
    $OutputEncoding = $previousEncoding
    $env:PYTHONIOENCODING = $previousPythonEncoding
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}
if ($exitCode -ne 0) { throw 'Cadastro nao concluido. Confira a mensagem acima.' }
