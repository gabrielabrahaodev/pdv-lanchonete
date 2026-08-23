$ErrorActionPreference = 'Stop'

$work = Join-Path $env:LOCALAPPDATA 'Temp\opencode\video-pdv'
$aud  = Join-Path $work 'audio'
$sld  = Join-Path $work 'slides'
New-Item -ItemType Directory -Force -Path $aud, $sld | Out-Null

$sections = @(
  @{
    n='01'; t='PDV Lanchonete v2'
    b=@('Sistema completo de ponto de venda para lanchonetes',
        'Salao, cozinha, estoque, delivery e financeiro',
        'Acesso pelo navegador - nada para instalar')
    nar='Olá! Seja bem-vinda ao PDV Lanchonete, o sistema completo para gerenciar a sua lanchonete. Neste vídeo, você vai entender como ele funciona no dia a dia.'
  },
  @{
    n='02'; t='Acesso e papeis'
    b=@('Login individual com e-mail e senha',
        'Papeis: admin, gerente, caixa, garcom e cozinha',
        'Cada papel ve apenas o que precisa',
        'Tema claro ou escuro por usuario')
    nar='O acesso é feito pelo navegador, com login e senha. Cada pessoa da equipe tem o seu próprio perfil: administrador, gerente, operador de caixa, garçom ou cozinha. Assim, cada um vê apenas o que precisa.'
  },
  @{
    n='03'; t='Caixa: mesas e pedidos'
    b=@('O mapa de mesas e a tela inicial',
        'Mesa livre inicia um pedido novo',
        'Produtos organizados por categorias',
        'Variacoes e observacoes por item',
        'Adicione itens a qualquer momento')
    nar='A tela inicial é o mapa de mesas. Para iniciar um atendimento, toque em uma mesa livre, escolha os produtos pelas categorias e confirme o pedido. A mesa fica marcada como ocupada, e os itens vão direto para a cozinha.'
  },
  @{
    n='04'; t='Cozinha: painel KDS'
    b=@('Painel escuro com atualizacao automatica',
        'Colunas: Pendente / Em preparo / Pronto',
        'Iniciar preparo baixa ingredientes do estoque',
        'Um toque imprime a comanda do cartao')
    nar='Na cozinha, o painel mostra três colunas: pendente, em preparo e pronto. Quando o cozinheiro inicia o preparo, o sistema já baixa automaticamente os ingredientes da receita no estoque. Ao terminar, ele marca como pronto e depois entrega ao cliente.'
  },
  @{
    n='05'; t='Estoque inteligente'
    b=@('Receita por produto: ingredientes por unidade',
        'Cada venda desconta o estoque sozinha',
        'Saldo abaixo do minimo acende alerta',
        'Entradas, saidas e ajustes sempre auditados')
    nar='No cadastro de produtos, você informa a receita: quanto cada ingrediente gasta por unidade vendida. Com isso, toda venda desconta o estoque sozinha. E quando um item fica abaixo do mínimo, o menu acende um alerta vermelho.'
  },
  @{
    n='06'; t='Pagamento e caixa'
    b=@('Dinheiro, PIX, credito ou debito',
        'Pagamento parcial e calculo de troco',
        'Pedido quitado libera a mesa sozinho',
        'Venda credita na sessao de caixa aberta',
        'Fechamento mostra a diferenca da gaveta')
    nar='No pagamento, você escolhe dinheiro, PIX, crédito ou débito, pode receber em partes e calcular o troco. Quando o pedido é quitado, a mesa libera sozinha, a venda entra no caixa e, se quiser, você imprime o recibo.'
  },
  @{
    n='07'; t='Cardapio digital e delivery'
    b=@('QR Code na mesa: cliente pede pelo celular',
        'Mesa livre cria pedido; ocupada adiciona itens',
        'Sem login, com protecao contra abuso',
        'Delivery: iFood, Goomer, WhatsApp e proprio')
    nar='Pelo QR Code na mesa, o cliente vê o cardápio pelo próprio celular e envia o pedido sem ajuda do garçom. Mesa livre cria um pedido novo; mesa ocupada adiciona itens ao pedido atual. Pedidos de delivery também são registrados e acompanhados até a entrega.'
  },
  @{
    n='08'; t='Relatorios e financeiro'
    b=@('Faturamento por hora e forma de pagamento',
        'Top produtos e categorias do periodo',
        'Despesas por categoria e CMV estimado',
        'Resultado gerencial: faturamento menos despesas',
        'Exportacao CSV compativel com Excel')
    nar='No fim do dia, o fechamento de caixa compara o valor esperado com o valor contado. Os relatórios mostram faturamento por hora, formas de pagamento e os produtos mais vendidos. No financeiro, você lança despesas e fornecedores e acompanha o resultado gerencial.'
  },
  @{
    n='09'; t='Comece agora'
    b=@('Cadastre seus produtos e abra o caixa',
        'O sistema cuida do resto',
        'Documentacao completa na pasta docs',
        'Testes: pytest 23 de 23 - API 34 de 34')
    nar='Simples assim: cadastre seus produtos, abra o caixa e comece a vender. O PDV Lanchonete cuida do resto. Obrigada pela atenção!'
  }
)

# ------------------------------------------------------------------ slides
Add-Type -AssemblyName System.Drawing

function Wrap([string]$s, [int]$max) {
  $out = @(); $cur = ''
  foreach ($wd in ($s -split ' ')) {
    if ((($cur + ' ' + $wd).Trim()).Length -le $max) { $cur = ($cur + ' ' + $wd).Trim() }
    else { if ($cur) { $out += $cur }; $cur = $wd }
  }
  if ($cur) { $out += $cur }
  return ,$out
}

function New-Slide([string]$num, [string]$title, [string[]]$bullets, [string]$path) {
  $w = 1280; $h = 720
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $cBg   = [System.Drawing.ColorTranslator]::FromHtml('#0F172A')
    $cOr   = [System.Drawing.ColorTranslator]::FromHtml('#EA580C')
    $cWh   = [System.Drawing.ColorTranslator]::FromHtml('#F8FAFC')
    $cTxt  = [System.Drawing.ColorTranslator]::FromHtml('#E2E8F0')
    $cGray = [System.Drawing.ColorTranslator]::FromHtml('#94A3B8')

    $bBg = New-Object System.Drawing.SolidBrush($cBg)
    $g.FillRectangle($bBg, 0, 0, $w, $h)

    $fTitle = New-Object System.Drawing.Font('Segoe UI', 40, [System.Drawing.FontStyle]::Bold)
    $fBul   = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Regular)
    $fSmall = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Regular)
    $bWh   = New-Object System.Drawing.SolidBrush($cWh)
    $bOr   = New-Object System.Drawing.SolidBrush($cOr)
    $bTxt  = New-Object System.Drawing.SolidBrush($cTxt)
    $bGray = New-Object System.Drawing.SolidBrush($cGray)

    $g.FillRectangle($bOr, 70, 92, 10, 66)
    $g.DrawString($title, $fTitle, $bWh, 100, 88)
    $g.DrawString(('Secao ' + $num + '/09'), $fSmall, $bGray, ($w - 220), 40)

    $y = 220
    foreach ($b in $bullets) {
      $lines = @(Wrap $b 54)
      for ($li = 0; $li -lt $lines.Count; $li++) {
        if ($li -eq 0) { $g.FillEllipse($bOr, 104, ($y + 14), 10, 10) }
        $g.DrawString($lines[$li], $fBul, $bTxt, 132, $y)
        $y += 36
      }
      $y += 16
    }

    $g.FillRectangle($bOr, 70, 640, 60, 4)
    $g.DrawString('PDV Lanchonete v2 - documentacao em docs/', $fSmall, $bGray, 70, 655)

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $g.Dispose(); $bmp.Dispose()
  }
}

for ($i = 0; $i -lt $sections.Count; $i++) {
  $png = Join-Path $sld ('slide{0:d2}.png' -f ($i + 1))
  New-Slide $sections[$i].n $sections[$i].t ([string[]]$sections[$i].b) $png
}
Write-Output ('Slides gerados: ' + $sections.Count)

# ------------------------------------------------------------------ narração (voz neural pt-BR via edge-tts)
$pyExe = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pyExe)) { throw ('Python do venv não encontrado: ' + $pyExe) }

$voice   = 'pt-BR-ThalitaMultilingualNeural'
$rateArg = '--rate=-4%'
$narDir  = Join-Path $work 'narracao'
New-Item -ItemType Directory -Force -Path $narDir | Out-Null
Write-Output ('Voz neural: ' + $voice)

for ($i = 0; $i -lt $sections.Count; $i++) {
  $n   = '{0:d2}' -f ($i + 1)
  $txt = Join-Path $narDir ('seg' + $n + '.txt')
  $mp3 = Join-Path $aud   ('seg' + $n + '.mp3')
  [IO.File]::WriteAllText($txt, $sections[$i].nar, (New-Object Text.UTF8Encoding($false)))
  & $pyExe -m edge_tts --voice $voice $rateArg --file $txt --write-media $mp3
  if ($LASTEXITCODE -ne 0) { throw ('edge-tts falhou no segmento ' + $n) }
  Write-Output ('Áudio neural ok: ' + $n)
}
Write-Output ('Áudios gerados: ' + $sections.Count)

# ------------------------------------------------------------------ montagem com ffmpeg
$listPath = Join-Path $work 'list.txt'
$lines = @()
for ($i = 0; $i -lt $sections.Count; $i++) {
  $n   = '{0:d2}' -f ($i + 1)
  $png = Join-Path $sld ('slide' + $n + '.png')
  $audSeg = Join-Path $aud ('seg' + $n + '.mp3')
  $mp4 = Join-Path $work ('seg' + $n + '.mp4')
  & ffmpeg -y -hide_banner -loglevel error -loop 1 -i $png -i $audSeg `
    -c:v libx264 -preset veryfast -crf 22 -vf "fps=30,format=yuv420p" `
    -c:a aac -b:a 128k -ar 44100 -ac 2 -shortest $mp4
  if ($LASTEXITCODE -ne 0) { throw ("ffmpeg falhou no segmento " + $n) }
  Write-Output ('Segmento ok: ' + $n)
  $lines += ("file '" + (($mp4 -replace '\\', '/')) + "'")
}
Set-Content -LiteralPath $listPath -Value $lines -Encoding Ascii

$final = Join-Path $PSScriptRoot 'explicacao-pdv-lanchonete-v2.mp4'
& ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i $listPath -c copy -movflags +faststart $final
if ($LASTEXITCODE -ne 0) { throw 'ffmpeg falhou na concatenacao final' }

$dur = & ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $final
$sizeKb = [math]::Round((Get-Item -LiteralPath $final).Length / 1KB, 0)
Write-Output ('VIDEO FINAL: ' + $final)
Write-Output ('Duracao (s): ' + [math]::Round([double]$dur, 1) + ' | Tamanho (KB): ' + $sizeKb)
