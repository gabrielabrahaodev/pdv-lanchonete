# Testes E2E da API FastAPI do PDV.
# Alvo padrao: PRODUCAO (Render). Para testar local: -Base http://127.0.0.1:8000
param([string]$Base = 'https://pdv-lanchonete-dwiw.onrender.com')

$ErrorActionPreference = 'Stop'
$Token = (Get-Content "$PSScriptRoot\token.txt" -Raw).Trim()
$H = @{ Authorization = "Bearer $Token"; 'Content-Type' = 'application/json' }
$script:Pass = 0; $script:Fail = 0; $script:Fails = @()

function Step([string]$Nome, [scriptblock]$Bloco) {
  try {
    $r = & $Bloco
    $script:Pass++
    Write-Host ("PASS | " + $Nome + $(if ($r) { " -> $r" }))
    return $r
  } catch {
    $script:Fail++
    $code = ''
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $msg = $_.Exception.Message
    $script:Fails += "$Nome ($code) :: $msg"
    Write-Host ("FAIL | " + $Nome + " [$code] " + $msg) -ForegroundColor Red
    return $null
  }
}

function Invoke-Api([string]$Method, [string]$Path, $Body = $null) {
  $params = @{ Method = $Method; Uri = "$Base$Path"; Headers = $H; TimeoutSec = 90 }
  if ($null -ne $Body) {
    $json = if ($Body -is [string]) { $Body } else { ConvertTo-Json -InputObject $Body -Depth 8 -Compress }
    $params.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
  }
  try {
    Invoke-RestMethod @params
  } catch {
    $detail = ''
    try {
      $rs = $_.Exception.Response
      $sr = New-Object IO.StreamReader($rs.GetResponseStream())
      $detail = $sr.ReadToEnd()
    } catch {}
    if ($detail) { throw "[$([int]$_.Exception.Response.StatusCode)] $detail" }
    throw $_
  }
}

Write-Host "Alvo: $Base"
Write-Host "=== 1. Meta ===" -ForegroundColor Cyan
Step '/health' { (Invoke-RestMethod "$Base/health" -TimeoutSec 120).status }

Write-Host "`n=== 2. Auth ===" -ForegroundColor Cyan
Step '401 sem token' {
  try { Invoke-RestMethod "$Base/api/auth/me" -TimeoutSec 60; throw 'deveria falhar' }
  catch { if ([int]$_.Exception.Response.StatusCode -eq 401) { return 'HTTP 401 correto' }; throw }
}
$me = Step '/auth/me' {
  $m = Invoke-Api GET '/api/auth/me'
  if (-not $m.restaurantId) { throw 'restaurantId ausente' }
  $script:restId = $m.restaurantId
  return "uid=$($m.uid) papel=$($m.papel) rest=$($m.restaurantId)"
}

Write-Host "`n=== 3. Categorias CRUD ===" -ForegroundColor Cyan
$cats = Step 'GET /categorias' { $l = Invoke-Api GET '/api/categorias'; "count=$($l.Count)" }
$cat = Step 'POST /categorias' {
  $c = Invoke-Api POST '/api/categorias' @{ nome = 'QA TESTE'; ordem = 999 }
  if (-not $c.id) { throw 'sem id' }
  $script:catId = $c.id
  return "id=$($c.id)"
}
Step 'PATCH /categorias/{id}' {
  $c = Invoke-Api PATCH "/api/categorias/$catId" @{ nome = 'QA TESTE EDIT' }
  if ($c.nome -ne 'QA TESTE EDIT') { throw 'nome nao aplicado' }
  return $c.nome
}

Write-Host "`n=== 4. Produtos ===" -ForegroundColor Cyan
$prod = Step 'GET /produtos + criar na cat QA' {
  $p = Invoke-Api POST '/api/produtos' @{ nome = 'QA Produto'; categoriaId = $catId; preco = 9.9 }
  $script:prodId = $p.id
  return "id=$($p.id) nome=$($p.nome)"
}
Step 'PATCH /produtos/{id} preco=12.5' {
  $p = Invoke-Api PATCH "/api/produtos/$prodId" @{ preco = 12.5 }
  if ($p.preco -ne 12.5) { throw 'preco nao aplicado' }
  return "preco=$($p.preco)"
}
Step 'GET /produtos/{id}' { $p = Invoke-Api GET "/api/produtos/$prodId"; return $p.nome }

Write-Host "`n=== 4b. Imagem do produto ===" -ForegroundColor Cyan
# PNG 1x1 valido em base64 (payload minimo que passa na validacao do modelo)
$png1px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
Step 'PUT /produtos/{id}/imagem' {
  $r = Invoke-Api PUT "/api/produtos/$prodId/imagem" @{ imagemBase64 = $png1px; mime = 'image/png' }
  if ($r.mime -ne 'image/png') { throw "mime=$($r.mime)" }
  return "produtoId=$($r.produtoId)"
}
Step 'produto ficou temImagem=true' {
  $p = Invoke-Api GET "/api/produtos/$prodId"
  if (-not $p.temImagem) { throw 'temImagem ausente/falso' }
  return 'temImagem=True'
}
Step 'GET publico da foto SEM token -> bytes' {
  # <img> nao envia Authorization: a foto precisa ser servida publica (com cache)
  $resp = Invoke-WebRequest "$Base/api/publico/$restId/imagens/$prodId" -UseBasicParsing -TimeoutSec 120
  if ([int]$resp.StatusCode -ne 200) { throw "status=$($resp.StatusCode)" }
  if ($resp.Headers['Content-Type'] -notlike 'image/*') { throw "ct=$($resp.Headers['Content-Type'])" }
  return "ct=$($resp.Headers['Content-Type']) bytes=$($resp.RawContentLength)"
}
Step 'cardapio publico traz temImagem' {
  $c = Invoke-RestMethod "$Base/api/publico/$restId/cardapio" -TimeoutSec 120
  $alvo = @($c.produtos | Where-Object { $_.id -eq $prodId })[0]
  if (-not $alvo) { throw 'produto ausente no cardapio' }
  if ($alvo.temImagem -ne $true) { throw "temImagem=$($alvo.temImagem)" }
  return 'temImagem=True'
}
Step 'DELETE /produtos/{id}/imagem + publico 404' {
  Invoke-Api DELETE "/api/produtos/$prodId/imagem" | Out-Null
  $p = Invoke-Api GET "/api/produtos/$prodId"
  if ($p.temImagem) { throw 'temImagem ainda verdadeiro' }
  try { Invoke-WebRequest "$Base/api/publico/$restId/imagens/$prodId" -UseBasicParsing -TimeoutSec 120 | Out-Null; throw 'foto ainda acessivel' }
  catch { if ("$($_.Exception.Message)" -match 'ainda acessivel') { throw } ; return 'HTTP 404 correto' }
}

Write-Host "`n=== 4c. Cardapio digital: variacao + observacoes ===" -ForegroundColor Cyan
$null = Step 'POST /produtos com variacao' {
  $p = Invoke-Api POST '/api/produtos' @{
    nome = 'QA Produto Variavel'; categoriaId = $catId; preco = 15
    variacoes = @( @{ id = 'varqa1'; nome = 'Com Bacon'; precoAdicional = 3; ativo = $true } )
    ingredientes = @()
  }
  $script:prodVarId = $p.id
  return "id=$($p.id)"
}
Step 'POST publico /mesas/{m}/pedido com variacao+obs (SEM token)' {
  $l = Invoke-Api GET '/api/mesas'
  $livre = @($l | Where-Object { $_.status -eq 'livre' })[0]
  if (-not $livre) { throw 'nenhuma mesa livre' }
  $body = @{ itens = @( @{ produtoId = $script:prodVarId; variacaoId = 'varqa1'; qtd = 2; observacoes = 'sem cebola' } ) }
  $json = ConvertTo-Json -InputObject $body -Depth 6 -Compress
  $r = Invoke-RestMethod -Method Post -Uri "$Base/api/publico/$restId/mesas/$($livre.id)/pedido" -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 120
  $script:pubPedidoId = $r.pedidoId
  return "pedido=$($r.pedidoId) mesa=$($livre.numero)"
}
Step 'item do pedido publico tem variacao e observacao' {
  $p = Invoke-Api GET "/api/pedidos/$pubPedidoId"
  $it = $p.itens[0]
  if ($it.variacaoId -ne 'varqa1') { throw "variacaoId=$($it.variacaoId)" }
  if ($it.observacoes -ne 'sem cebola') { throw "obs=$($it.observacoes)" }
  if ($it.precoUnitario -ne 18) { throw "preco=$($it.precoUnitario) (base 15 + adicional 3)" }
  return "var=varqa1 obs=ok preco=$($it.precoUnitario)"
}
Step 'cancelar pedido publico -> mesa livre' {
  Invoke-Api POST "/api/pedidos/$pubPedidoId/cancelar" | Out-Null
  $todas = Invoke-Api GET '/api/mesas'
  $alvo = @($todas | Where-Object { $_.pedidoAtivoId -eq $pubPedidoId })[0]
  if ($alvo) { throw "mesa $($alvo.id) ainda presa ao pedido" }
  return 'mesas livres'
}

Write-Host "`n=== 5. Mesas ===" -ForegroundColor Cyan
$mesa = Step 'GET /mesas (livre)' {
  $l = Invoke-Api GET '/api/mesas'
  $livre = @($l | Where-Object { $_.status -eq 'livre' })[0]
  if (-not $livre) { throw 'nenhuma mesa livre' }
  $script:mesaId = $livre.id
  return "mesa=$($livre.numero) id=$($livre.id)"
}

Write-Host "`n=== 6. Pedidos (fluxo mesa) ===" -ForegroundColor Cyan
$pedido = Step 'POST /pedidos' {
  $p = Invoke-Api POST "/api/pedidos`?mesa_id=$mesaId&tipo=local" @(
    @{ produtoId = $prodId; qtd = 2; observacoes = 'sem cebola' }
  )
  $script:pedidoId = $p.id
  $script:itemPedidoId = $p.itens[0].id
  if ($p.status -ne 'aberto') { throw "status=$($p.status)" }
  return "pedido=$($p.id) total=$($p.total)"
}
Step 'Mesa ficou ocupada' {
  $m = Invoke-Api GET "/api/mesas/$mesaId"
  if ($m.status -ne 'ocupada') { throw "status=$($m.status)" }
  return $m.status
}
Step 'Cozinha: item -> preparo -> pronto' {
  Invoke-Api PATCH "/api/cozinha/pedidos/$pedidoId/itens/$itemPedidoId/status`?novo_status=preparo" | Out-Null
  $p = Invoke-Api PATCH "/api/cozinha/pedidos/$pedidoId/itens/$itemPedidoId/status`?novo_status=pronto"
  $item = @($p.itens | Where-Object { $_.id -eq $itemPedidoId })[0]
  if ($item.status -ne 'pronto') { throw "item status=$($item.status)" }
  return "pedido=$($p.status) item=$($item.status)"
}

Write-Host "`n=== 6b. Cozinha bulk (cartao inteiro numa transacao) ===" -ForegroundColor Cyan
$bulk = Step 'POST /pedidos com 2 itens (produtos distintos)' {
  $l = Invoke-Api GET '/api/mesas'
  $livre = @($l | Where-Object { $_.status -eq 'livre' })[0]
  if (-not $livre) { throw 'nenhuma mesa livre' }
  $p = Invoke-Api POST "/api/pedidos`?mesa_id=$($livre.id)&tipo=local" @(
    @{ produtoId = $prodId; qtd = 1 },
    @{ produtoId = $script:prodVarId; variacaoId = 'varqa1'; qtd = 1; observacoes = 'bem passado' }
  )
  $script:bulkPedidoId = $p.id
  $script:bulkItemIds = @($p.itens | ForEach-Object { $_.id })
  if ($p.itens.Count -ne 2) { throw "itens=$($p.itens.Count)" }
  return "pedido=$($p.id) mesa=$($livre.numero)"
}
Step 'PATCH bulk preparo (1 chamada, 2 itens)' {
  $r = Invoke-Api PATCH "/api/cozinha/pedidos/$bulkPedidoId/itens/status" @{ itemIds = $bulkItemIds; novoStatus = 'preparo' }
  $prep = @($r.itens | Where-Object { $_.status -eq 'preparo' }).Count
  if ($prep -ne 2) { throw "em preparo=$prep" }
  return "2/2 em preparo"
}
Step 'PATCH bulk pronto + cancelar (mesa livre)' {
  Invoke-Api PATCH "/api/cozinha/pedidos/$bulkPedidoId/itens/status" @{ itemIds = $bulkItemIds; novoStatus = 'pronto' } | Out-Null
  $r = Invoke-Api POST "/api/pedidos/$bulkPedidoId/cancelar"
  if ($r.status -ne 'cancelado') { throw "status=$($r.status)" }
  $todas = Invoke-Api GET '/api/mesas'
  $presa = @($todas | Where-Object { $_.pedidoAtivoId -eq $bulkPedidoId })[0]
  if ($presa) { throw "mesa $($presa.id) ainda presa" }
  return 'ok'
}

# Regressao do bug 10 (ReadAfterWriteError): 2 produtos compartilhando o MESMO
# ingrediente, avancados juntos -> baixa AGREGADA numa unica movimentacao.
$bulkIng = Step 'POST /estoque/itens (p/ regressao baixa agregada)' {
  $i = Invoke-Api POST '/api/estoque/itens' @{ nome = 'QA Ingrediente Bulk'; unidade = 'un'; quantidadeAtual = 100; minimo = 10; custoMedio = 1 }
  $script:bulkIngId = $i.id
  return "id=$($i.id)"
}
$bulkAB = Step 'POST 2 produtos compartilhando o ingrediente' {
  $a = Invoke-Api POST '/api/produtos' @{ nome = 'QA Bulk A'; categoriaId = $catId; preco = 10; ativo = $true; variacoes = @(); ingredientes = @( @{ itemId = $script:bulkIngId; qtd = 2 } ) }
  $b = Invoke-Api POST '/api/produtos' @{ nome = 'QA Bulk B'; categoriaId = $catId; preco = 12; ativo = $true; variacoes = @(); ingredientes = @( @{ itemId = $script:bulkIngId; qtd = 3 } ) }
  $script:bulkProdA = $a.id; $script:bulkProdB = $b.id
  return "A=$($a.id) B=$($b.id)"
}
Step 'baixa agregada: 2 itens juntos -> saldo -7 e 1 movimentacao' {
  $l = Invoke-Api GET '/api/mesas'
  $livre = @($l | Where-Object { $_.status -eq 'livre' })[0]
  if (-not $livre) { throw 'nenhuma mesa livre' }
  $p = Invoke-Api POST "/api/pedidos`?mesa_id=$($livre.id)&tipo=local" @(
    @{ produtoId = $script:bulkProdA; qtd = 2 },
    @{ produtoId = $script:bulkProdB; qtd = 1 }
  )
  try {
    $ids = @($p.itens | ForEach-Object { $_.id })
    $r = Invoke-Api PATCH "/api/cozinha/pedidos/$($p.id)/itens/status" @{ itemIds = $ids; novoStatus = 'preparo' }
    if (@($r.itens | Where-Object { $_.status -eq 'preparo' }).Count -ne 2) { throw 'itens nao avancaram' }
    $e = Invoke-Api GET "/api/estoque/itens/$bulkIngId"
    if ([double]$e.quantidadeAtual -ne 93) { throw "saldo=$($e.quantidadeAtual) esperado 93 (100 - 2x2 - 1x3)" }
    $movs = Invoke-Api GET '/api/estoque/movimentacoes'
    $doPedido = @($movs | Where-Object { $_.pedidoId -eq $p.id })
    if ($doPedido.Count -ne 1) { throw "movimentacoes=$($doPedido.Count) esperado 1 (agregada)" }
    if ([double]$doPedido[0].qtd -ne 7) { throw "qtd da movimentacao=$($doPedido[0].qtd) esperado 7" }
  } finally {
    Invoke-Api POST "/api/pedidos/$($p.id)/cancelar" | Out-Null   # libera a mesa (nao estorna estoque)
  }
  return "saldo=93 movs=1 qtd=7 ok"
}
Step 'cleanup dos produtos/ingrediente de bulk' {
  Invoke-Api DELETE "/api/produtos/$script:bulkProdA" | Out-Null
  Invoke-Api DELETE "/api/produtos/$script:bulkProdB" | Out-Null
  Invoke-Api DELETE "/api/estoque/itens/$script:bulkIngId" | Out-Null
  return 'removidos'
}

Write-Host "`n=== 7. Caixa ===" -ForegroundColor Cyan
Step 'sessao-atual' {
  $s = Invoke-Api GET '/api/caixa/sessao-atual'
  if ($s -and $s.id) { $script:sessaoExistia = $true; $script:sessaoId = $s.id; return "ja aberta $($s.id)" }
  $script:sessaoExistia = $false
  return 'nenhuma'
}
if (-not $sessaoExistia) {
  Step 'POST /caixa/abrir 100' { $s = Invoke-Api POST '/api/caixa/abrir' @{ valorInicial = 100 }; $script:sessaoId = $s.id; return "id=$($s.id)" }
}
Step 'POST /caixa/suprimento 50' { $s = Invoke-Api POST '/api/caixa/suprimento' @{ valor = 50; observacao = 'troco QA' }; return "suprimentos=$($s.suprimentos)" }
Step 'POST /caixa/sangria 10' { $s = Invoke-Api POST '/api/caixa/sangria' @{ valor = 10; observacao = 'QA' }; return "sangrias=$($s.sangrias)" }

Write-Host "`n=== 8. Pagamento (quita pedido) ===" -ForegroundColor Cyan
$total = Step 'GET total do pedido' { (Invoke-Api GET "/api/pedidos/$pedidoId").total }
Step "POST /pagamentos/{pedido} pix R$$total (minimalista B1)" {
  # Contrato B1: corpo minimo {tipo, valor}; id/criadoEm gerados no servidor (201)
  $p = Invoke-Api POST "/api/pagamentos/$pedidoId" @{ tipo = 'pix'; valor = $total }
  if ($p.status -ne 'pago') { throw "status=$($p.status)" }
  return "status=$($p.status) pagamentos=$($p.pagamentos.Count)"
}
Step 'Mesa liberada apos pagamento' {
  $m = Invoke-Api GET "/api/mesas/$mesaId"
  if ($m.status -ne 'livre') { throw "status=$($m.status)" }
  return $m.status
}
if (-not $sessaoExistia) {
  Step 'POST /caixa/fechar' {
    $s = Invoke-Api POST '/api/caixa/fechar' @{ valorContado = 165.0 }
    if ($s.status -ne 'fechado') { throw "status=$($s.status)" }
    return "vendas=$($s.totalVendas) recebido=$($s.totalRecebido)"
  }
}

Write-Host "`n=== 9. Estoque ===" -ForegroundColor Cyan
Step 'POST /estoque/itens' {
  $i = Invoke-Api POST '/api/estoque/itens' @{ nome = 'QA Ingrediente'; unidade = 'kg'; quantidadeAtual = 5; minimo = 1; custoMedio = 12.3 }
  $script:estoqueItemId = $i.id
  return "id=$($i.id)"
}
Step 'POST /estoque/movimentacoes entrada 10kg' {
  Invoke-Api POST '/api/estoque/movimentacoes' @{ tipo = 'entrada'; itemId = $estoqueItemId; qtd = 10; observacao = 'compra QA' } | Out-Null
  $i = Invoke-Api GET "/api/estoque/itens/$estoqueItemId"
  if ($i.quantidadeAtual -ne 15) { throw "qtd=$($i.quantidadeAtual)" }
  return "qtdAtual=$($i.quantidadeAtual)"
}
Step 'GET /estoque/movimentacoes' { $l = Invoke-Api GET '/api/estoque/movimentacoes'; return "count=$($l.Count)" }
Step 'DELETE /estoque/itens/{id}' { Invoke-Api DELETE "/api/estoque/itens/$estoqueItemId" | Out-Null; return 'removido' }

Write-Host "`n=== 10. Delivery ===" -ForegroundColor Cyan
$deliv = Step 'POST /delivery/pedidos' {
  $d = Invoke-Api POST '/api/delivery/pedidos' @{
    platform = 'proprio'; clienteNome = 'Cliente QA'; clienteTelefone = '11999990000'
    itens = @( @{ produtoId = $prodId; qtd = 1 } )
  }
  $script:delivId = $d.id
  return "id=$($d.id) status=$($d.status) total=$($d.total)"
}
Step 'PATCH delivery status=confirmed' {
  $d = Invoke-Api PATCH "/api/delivery/pedidos/$delivId/status" @{ status = 'confirmed' }
  return $d.status
}
Step 'GET /delivery/pedidos' { $l = Invoke-Api GET '/api/delivery/pedidos'; return "count=$($l.Count)" }
Step 'Cancelar delivery QA (cleanup)' { $d = Invoke-Api PATCH "/api/delivery/pedidos/$delivId/status" @{ status = 'cancelled' }; return $d.status }
Step 'POST delivery platform invalida -> 422 (M4)' {
  try {
    Invoke-Api POST '/api/delivery/pedidos' @{
      platform = 'uber'; clienteNome = 'QA'; clienteTelefone = '11999990000'
      itens = @( @{ produtoId = $prodId; qtd = 1 } )
    }
    throw 'deveria falhar'
  } catch {
    # status direto da resposta OU do detalhe decorado pelo Invoke-Api (o stream
    # as vezes chega sem corpo legivel e a mensagem cai no formato "(422) ...")
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    elseif ($_.Exception.Message -match '[\[\(](\d+)[\]\)]') { $code = [int]$Matches[1] }
    if ($code -eq 422) { return 'HTTP 422 correto' }
    throw
  }
}

Write-Host "`n=== 11. Relatorios ===" -ForegroundColor Cyan
# Janela correta: meia-noite LOCAL convertida para o instante UTC real
# (bug historico: montar 'yyyy-MM-ddT00:00:00Z' com a data local — a venda das 21h de Brasilia
#  ja nasce no dia seguinte em UTC e ficava FORA da janela).
Step 'GET /relatorios/resumo inclui a venda do teste' {
  $ini = (Get-Date).Date.ToUniversalTime().ToString('o')
  $fim = (Get-Date).ToUniversalTime().AddHours(1).ToString('o')
  $r = Invoke-Api GET "/api/relatorios/resumo`?inicio=$ini&fim=$fim"
  if ($r.totalPedidos -lt 1) { throw "pedidos=$($r.totalPedidos) (venda do teste deveria contar)" }
  return "pedidos=$($r.totalPedidos) bruto=$($r.faturamentoBruto)"
}

Write-Host "`n=== 12. Configuracoes ===" -ForegroundColor Cyan
Step 'PUT /configuracoes' {
  $c = Invoke-Api PUT '/api/configuracoes' @{ nome = 'Lanchonete QA'; moeda = 'BRL'; timezone = 'America/Sao_Paulo'; impressoraTipo = 'bluetooth'; impressoraEndereco = '' }
  return "nome=$($c.nome)"
}
Step 'GET /configuracoes' { $c = Invoke-Api GET '/api/configuracoes'; return "moeda=$($c.moeda)" }

Write-Host "`n=== 13. Cleanup ===" -ForegroundColor Cyan
Step 'DELETE produtos QA (todos)' {
  $l = Invoke-Api GET '/api/produtos'
  $n = 0
  foreach ($p in $l) { if ($p.nome -like 'QA *') { Invoke-Api DELETE "/api/produtos/$($p.id)" | Out-Null; $n++ } }
  return "removidos=$n"
}
Step 'DELETE categorias QA (todas)' {
  $l = Invoke-Api GET '/api/categorias'
  $n = 0
  foreach ($c in $l) { if ($c.nome -like 'QA *') { Invoke-Api DELETE "/api/categorias/$($c.id)" | Out-Null; $n++ } }
  return "removidos=$n"
}

Write-Host ''
Write-Host ('=' * 50)
Write-Host ("RESULTADO: $Pass PASS / $Fail FAIL")
if ($Fail -gt 0) { $Fails | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }; exit 1 }
exit 0
