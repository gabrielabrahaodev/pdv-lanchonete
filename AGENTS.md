# AGENTS.md — PDV Lanchonete v2 (React + FastAPI + Firebase)

Contexto carregado no início de toda sessão opencode neste projeto.

## Visão geral

PDV (ponto de venda) de lanchonete reimplementado: frontend Vite + React 18 + TS + Tailwind 4, backend FastAPI + firebase-admin, Firestore como banco (projeto `pdv-lanchonete-1fa79`, mesmos modelos/estrutura da versão Flutter).

- `backend/` — API FastAPI na porta **8000** (`app/main.py`, routers em `app/routers/`, regras em `app/services/`)
- `frontend/` — SPA na porta **5173** (proxy `/api` → 8000)
- `scripts/` — TS Admin para init/seed/limpeza do Firestore

Estrutura Firestore: `restaurantes/{restaurantId}/data/{colecao}/items/{id}` (+ doc único `data/configuracoes`). Documentos antigos usam `createdAt/updatedAt`; a leitura normaliza para `criadoEm/atualizadoEm`.

## Como rodar

```powershell
# Backend (SEMPRE pelo python da .venv — o python global não tem fastapi)
cd backend
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

O servidor costuma rodar em background com saída redirecionada para `backend/uv-test.out.log` e `backend/srv.err.log`; o PID fica em `backend/server.pid`. **Não roda com --reload**: após alterar código Python, reinicie o processo (Stop-Process no PID do server.pid → Start-Process de novo). O log pode mostrar `--- Logging error --- OSError [Errno 22]`: é ruído do access logger do uvicorn no Windows quando a saída é pipe, não afeta requisições.

Frontend: `cd frontend && npm run dev`. Credenciais de teste: `admin@restaurante.com` / `SenhaForte123!` (uid `0O29i5gABJTtS5JrAFgB7yskIwC3`, claims `restaurantId=restaurante_001`, `papel=admin`).

## Testes E2E

Suíte **versionada no repo** em `scripts/e2e/` (instruções completas no `scripts/e2e/README.md`):

- `api_test.ps1` — suíte de 51 testes da API (auth, CRUDs, imagem do produto, cardápio digital com variação+observações, **cozinha bulk + baixa de estoque agregada (regressão do bug 10)**, pedido→cozinha→pagamento minimalista B1, caixa, estoque, delivery + 422 plataforma inválida M4, relatório com asserção de venda, configurações) com cleanup automático. Padrão: produção (`-Base http://127.0.0.1:8000` para local). Estado: **51/51 PASS na produção** (2026-08-24).
- `get-token.js` — login e salva ID token em `token.txt` (expira em 1h; requer `npm install` em `scripts/`).
- `e2e_test.js` — fluxo do app client direto no Firestore (valida firestore.rules).
- `scripts/e2e/token.txt` está no `.gitignore`.

**CI**: GitHub Actions em `.github/workflows/ci.yml` — pytest 23 + tsc + build em todo push/PR.

### Veredito histórico: "relatório zerado" (2026-08-23)

Suspeita de bug no `/relatorios/resumo` era **falsa** — o relatório sempre contou certo; quem montava a janela errada era o teste (`yyyy-MM-ddT00:00:00Z` com data LOCAL: às 21h32 de Brasília já é 00h32Z do dia seguinte). Corrigido no teste com `(Get-Date).Date.ToUniversalTime()`. O frontend (`diasAtrasISO`, `mesAtual`) sempre usou `setHours(0,0,0,0)`+`toISOString()` = correto. Ao construir janelas de datas para o backend, SEMPRE converter local→UTC explicitamente.

Fluxo validado de ponta a ponta: criar categoria/produto QA → abrir pedido em mesa livre → mesa fica `ocupada` → item vai a `preparo`→`pronto` via `/api/cozinha/...` → pagamento pix quita pedido (`status=pago`) → mesa volta a `livre` → venda credita na sessão de caixa aberta → fechar caixa confere totais. Relatório `/api/relatorios/resumo` reflete as vendas.

## Estado do backend após plano de correções (2026-08-22)

- Setup exige `pip install tzdata` (já no requirements.txt) — ver armadilha do zoneinfo abaixo.
- `POST /api/pagamentos/{pedido_id}` aceita `PaymentCreate` minimalista `{tipo, valor}` (+ `troco?`, `referencia?`); id/criadoEm são gerados no servidor (resposta 201).
- Operações com corrida protegidas por transação Firestore (`@transactional`): criar pedido em mesa, abrir caixa, movimentação de estoque, crédito na sessão de caixa.
- Fuso do relatório é configurável (`settings.timezone`, default `America/Sao_Paulo`) via `PUT /api/configuracoes`.

### Sessão 2026-08-22 (parte 2): tema por usuário + onboarding + receita

- **Tema por usuário**: campo `tema` no doc do usuário; `GET/PATCH /api/usuarios/me` (self-service, qualquer papel). Frontend aplica classe `dark` no `<html>` via `ThemeContext` (cache localStorage por uid; Tailwind 4 usa `@custom-variant dark`).
- **Onboarding**: `POST /api/restaurantes/primeiro` (`{nome, quantidadeMesas=12}`, 0–50) cria restaurante completo em batch (doc raiz, configurações, docs-pai, mesas, doc admin do criador) e seta claims `{restaurantId, papel:"admin"}`. Guard duplo: claim no token **e** marcador transacional em coleção top-level `onboarding/{uid}` → 409 na segunda tentativa.
- **Receita/baixa automática**: produtos têm `ingredientes: [{itemId, qtd}]` por 1 unidade. Ao iniciar preparo (`pendente→preparo`), `pedidos_service.atualizar_status_item()` debita os ingredientes na MESMA transação do pedido, grava movimentação `saida` com `pedidoId` e marca `baixadoEm` no item (idempotente — retry não deduplica em dobro).
- **Toggle da baixa**: configuração `baixaEstoqueAutomatica: bool = True` em `PUT /api/configuracoes`; lida dentro da transação da baixa — desligada, o item vai a `preparo` normalmente sem descontar estoque.
- **Financeiro (fornecedores + despesas + DRE)**: coleções `fornecedores/items` e `despesas/items`; despesa tem `categoria: insumo|folha|conta_fixa|outra`, `status pendente|pago` (+ `POST /{id}/pagar`, `PATCH ativoPago:false` reabre e usa `DELETE_FIELD` em `pagoEm`). `/relatorios/resumo` retornou bloco `financeiro`: `despesasPorCategoria` (por COMPETÊNCIA `data`), `totalDespesas`, `cmvEstimado` (saídas com pedidoId × custoMedio atual — informativo) e `resultadoGerencial = faturamento − despesas`. Despesas NÃO mexem na sessão de caixa (decisão de produto); folha é lançamento manual vinculado a `usuarioId`.
- Regras de negócio decididas: saldo pode ficar **negativo** (não trava preparo); item cancelado após baixa **não estorna** ingredientes.

### Sessão 2026-08-22 (parte 3): quick wins + impressão + cardápio digital + PWA

- **firestore.rules real**: na raiz do repo (+ `firebase.json`). Acesso client direto só para o próprio tenant (`request.auth.token.restaurantId == restaurantId`); `onboarding/{uid}` leitura própria. Deploy: `firebase deploy --only firestore:rules` ou colar no Console. Backend é Admin SDK, imune.
- **pytest**: `backend/tests/` (23 testes) sobre lógica pura extraída em `app/services/calculos.py`: `total_pedido`, `agregar_consumo_receita` e `resumo_financeiro` (DRE). Rodar: `.venv\Scripts\python -m pytest tests -q`.
- **Tempo real**: hook frontend `useRealtime(restaurantId, ['pedidos','mesas','estoque','despesas'])` montado no AppLayout — onSnapshot invalida caches react-query; se as regras não estiverem publicadas, só loga warning e o polling segue funcionando. Frontend agora também importa `getFirestore`.
- **Alerta global de estoque**: `useAlertasEstoque` → badge vermelho com contagem no item "Estoque" do menu.
- **CSV**: `lib/csv.ts` (`;` + BOM p/ Excel pt-BR) — botões em Relatórios, Financeiro (despesas) e Estoque.
- **Impressão**: `lib/impressora.ts` — ESC/POS via Web Bluetooth (service 18f0/char 2af1, fallback varre serviços por característica write) + fallback janela print(). Comanda no KDS (🖨 por cartão), recibo no PagamentoPage quando quitado, teste de impressora em Configurações.
- **Cardápio digital**: rotas PÚBLICAS em `/api/publico/{rid}/cardapio` e `/api/publico/{rid}/mesas/{mesa}/pedido` (sem auth; rate-limit 12/min por IP; gate `cardapioDigitalAtivo` nas configurações). Mesa livre cria pedido; ocupada adiciona itens ao pedido ativo. Frontend: rota pública `/m/:restaurantId/:mesaId` (CardapioPage) + botão QR por mesa em MesasPage (lib `qrcode`, download PNG).
- **PWA**: `vite-plugin-pwa` no build (manifest + icons placeholder laranja em `frontend/public/icons/`, autoUpdate); workbox NetworkFirst nos GETs `/api/*` (timeout 4s, cache 24h). Dev server não registra SW — testar com `npm run build && npm run preview`. Escopo consciente: fila de escrita offline fica para depois.

### Sessão 2026-08-23: deploy em produção (R$ 0/mês)

- **Frontend**: https://pdv-lanchonete-1fa79.web.app (Firebase Hosting; `VITE_API_URL` embutido no build)
- **API**: https://pdv-lanchonete-dwiw.onrender.com (Render free tier — dorme após ~15 min sem tráfego; UptimeRobot pinga `/health` a cada 10 min)
- **Repo**: https://github.com/gabrielabrahaodev/pdv-lanchonete (privado; push em `master` dispara auto-deploy na Render)
- Credenciais em produção via env `FIREBASE_SERVICE_ACCOUNT_JSON` (+ `CORS_ORIGINS=https://pdv-lanchonete-1fa79.web.app`). Ordem de resolução em `app/core/firebase.py`: env JSON → arquivo local (dev) → ADC.
- Baseline validado NA PRODUÇÃO: pytest 23/23 · suíte E2E **34/34** contra a API da Render (o `api_test.ps1` temporário teve `$Base` apontada para produção).
- `/health` aceita **GET e HEAD** (`@app.api_route`) — monitores externos (UptimeRobot) fazem HEAD e antes recebiam 405.
- Release do frontend: `$env:VITE_API_URL='https://pdv-lanchonete-dwiw.onrender.com'; npm run build; Remove-Item Env:VITE_API_URL` → `firebase deploy --only hosting`.
- **Decisão registrada**: usuário optou por NÃO fechar o auto-cadastro — Firebase Auth e-mail/senha segue aberto e `POST /restaurantes/primeiro` também (conta órfã pode virar admin de restaurante novo no mesmo projeto, consumindo quota Spark; dados do tenant continuam protegidos por claims + firestore.rules). Se um dia quiser restringir: flag `onboarding_aberto` em config + gate no service (plano já discutido).

### Sessão 2026-08-23 (parte 2): foto do produto no Firestore

- **Modelo**: imagem vive em coleção própria `imagens/items/{produtoId}` (mesmo id do produto) para não pesar listagens; produto ganha flag `temImagem`. Payload `ImagemCreate {imagemBase64 ≤200k chars (~150 KB), mime jpeg|png|webp}`.
- **Rotas autenticadas**: `PUT/DELETE /api/produtos/{id}/imagem` (ESCRITA: admin/gerente/caixa). `DELETE /api/produtos/{id}` apaga a imagem junto (cascade).
- **Rota pública**: `GET /api/publico/{rid}/imagens/{produto_id}` serve os BYTES (`Response`, `Cache-Control: public, max-age=3600`) — `<img>` não envia Authorization, então app e cardápio QR usam essa URL via `urlImagemProduto()` (`lib/imagem.ts`). FORA do rate limit de propósito (cardápio dispara N fotos em rajada) e sem gate `cardapioDigitalAtivo` (foto é conteúdo público; quem desativa o cardápio perde o menu que lista produtos).
- **Frontend**: compressão no cliente (`comprimirImagem`: canvas → JPEG, lado máx 900px, qualidade decrescente até ~140 KB); ProdutoFormPage substituiu o campo "Imagem (URL)" por file picker + preview data-URL + remover; upload acontece na MESMA mutation do salvar (cria produto → PUT imagem com o id novo). Thumbnails em ProdutosPage e CardapioPage (`temImagem ? url pública : placeholder`; `imagemUrl` externa continua como fallback).
- **Baseline local**: pytest 23/23 · tsc 0 · build PWA ok · suíte E2E **40/40** (`-Base http://127.0.0.1:8000`). **Deploy feito na sequência** (commit `c7afa8b` → Render + Hosting) e suíte revalidada NA PRODUÇÃO: **40/40 PASS**.
- Correções NA SUÍTE durante esta sessão: `$me` guardava string de resumo do Step (não o objeto `/auth/me`) → usar `$script:restId`; assert 422 do M4 agora lê `Exception.Response.StatusCode` (o stream às vezes chega sem corpo legível e o match de texto `\[422\]` falhava).

### Sessão 2026-08-23 (parte 3): customização no pedido + categorias

- **Modal de customização** (`components/ProdutoCustomModal.tsx`, compartilhado): escolhe variação (radio com preço), quantidade e **retirar/adicionar** via chips de sugestão ("sem cebola", "bem passado"…) + texto livre ≤200 chars. Usado em `NovoPedidoPage` (PDV na mesa) e `CardapioPage` (QR) — clicar no produto abre o modal; chip de variação já abre pré-selecionado. Chave da linha no carrinho inclui variacao+obs (mesmo produto com obs diferentes = linhas separadas). Backend NÃO mudou (`OrderItemAdd` já aceitava variacao_id/observacoes; preço resolvido no servidor).
- **Categorias**: tela própria `/categorias` (`CategoriasPage.tsx`) — CRUD completo com ícone (emoji), ordem, ativo/inativa; exclusão BLOQUEADA no frontend se houver produtos vinculados (backend não tem guard). Entrada no menu lateral após Produtos.
- Cardápio QR mostra "a partir de R$ X" quando o produto tem variações.
- Suíte E2E: seção 4c valida pedido público SEM token com variação+obs → item com `variacaoId`, `observacoes` e preço base+adicional → cancelar libera a mesa. **44/44 PASS produção** (commit `03aeb37`).

### Sessão 2026-08-24: fix definitivo da baixa + suíte 51

- Correção raiz do 500 no "iniciar preparo" (`ReadAfterWriteError`, bug 10) e handler 500 com CORS (bug 9) — detalhes na seção de bugs.
- Suíte `api_test.ps1` ampliada para **51 casos** com regressão da baixa agregada: 2 produtos compartilham 1 ingrediente → bulk preparo → saldo −7 e exatamente 1 movimentação. **51/51 PASS na produção**.
- Layout do formulário de produto: linhas de variação/ingrediente em grid de colunas fixas (`minmax(0,1fr)` + larguras fixas p/ preço/unidade/qtd/remover) e container `max-w-3xl` — nomes longos não espremem mais os campos numéricos.

## Bugs já corrigidos (não reintroduzir)

1. `pedidos_service.criar()` chamava função inexistente `get_pedido` → 500 depois de gravar pedido e ocupar mesa. Correto: `obter()`.
2. `_run_txn` usava `db.run_transaction(...)` (API do SDK Node.js, não existe no Python). Correto: decorator `from google.cloud.firestore import transactional`.
3. `Transaction.get(ref)` no SDK Python retorna **generator** de snapshots (não um snapshot único): usar `next(iter(transaction.get(ref)), None)`.
4. `stamp_update()` descarta campos `None` — updates que precisam limpar campo devem usar `DELETE_FIELD` explícito (ver `mesas_service.liberar()`, que antes deixava `pedidoAtivoId` órfão em mesa liberada).
5. `_run_txn` deve retornar sempre o pedido completo (`obter(...)`) após commit — os txns internos não têm return.
6. Sessão 2026-08-22 (correções B1–B5/M1–M4): `main.py` chegou a ter **duas instâncias** de `FastAPI` (routers na primeira, `lifespan` na segunda) → só `/health` respondia, todo `/api/*` dava 404. Correto: UMA instância com `lifespan=` + middleware + routers. Ao mexer no app, garantir que routers ficam na instância exportada.
7. Sessão 2026-08-23 (produção): campo pydantic chamava-se `service_account_json` → lia a env `SERVICE_ACCOUNT_JSON`, NUNCA `FIREBASE_SERVICE_ACCOUNT_JSON`; na Render caía no ADC sem projeto → **401 em toda rota autenticada e 500 nos endpoints públicos**, com `/health` ok (init ADC é lazy). Correto: campo renomeado para `firebase_service_account_json`. Diagnóstico rápido: endpoint público que lê Firestore dando 500 ⇒ credencial quebrada; `/health` é estático e não prova nada.
8. Sessão 2026-08-23 (produção): `/health` só aceitava GET → monitores externos fazem HEAD e recebiam 405 ("405 method not allowed" no UptimeRobot com serviço perfeitamente saudável). Correto: `@app.api_route("/health", methods=["GET", "HEAD"])`.
9. Sessão 2026-08-24 (produção): KDS avançava um cartão inteiro disparando N PATCHes PARALELOS (`forEach` no frontend) — cada um abre transação Firestore tocando o MESMO doc do pedido E os mesmos ingredientes da receita (ex.: X-Burger e X-Bacon dividem 5 insumos) → contenção, retries esgotados, **500** (que ainda por cima chegava ao browser como erro de CORS porque exceções não tratadas passam fora do CORSMiddleware). Correção dupla: `PATCH /api/cozinha/pedidos/{id}/itens/status` com `{itemIds[], novoStatus}` faz TODA a transição numa única transação com baixa de estoque AGREGADA (`_consumo_produto` × qtd do item → `_aplicar_consumo`, uma leitura/escrita por ingrediente); `atualizar_status_item` (rota antiga) delega para o bulk. E middleware interno `_Erros500Json` em `main.py` devolve 500 JSON que passa pela pilha CORS (`@app.exception_handler(Exception)` NÃO resolve: ServerErrorMiddleware fica FORA do CORS). Lição: NUNCA disparar mutações paralelas que tocam o mesmo doc Firestore; agrupar num endpoint bulk.
10. Sessão 2026-08-24 (a causa REAL do 500 acima): `google.cloud.firestore_v1.ReadAfterWriteError` — **transações Firestore proíbem ler um doc DEPOIS de escrever outro**. O loop de baixa lia ingrediente → escrevia mov+estoque → ao ler o 2º ingrediente explodia. Por isso produtos com **2+ ingredientes** falharam SEMPRE no "iniciar preparo" (desde a feature de receita!) e bebidas (1 insumo) nunca — os testes não pegavam porque os produtos QA não tinham receita. Correção em `_aplicar_consumo`: fase 1 lê TODOS os docs (config + estoques), fase 2 executa TODAS as escritas. Regressão na suíte: 2 produtos compartilham 1 ingrediente → bulk preparo → saldo −7 e exatamente 1 movimentação. Lição: em transação Firestore, leitura 100% antes de escrita 100%; teste E2E de baixa PRECISA usar produto com ingredientes.

## Armadilhas conhecidas

- PowerShell 5.1: `array | ConvertTo-Json` desmonta array de 1 elemento — usar `ConvertTo-Json -InputObject $array`.
- PowerShell 5.1: pipar o resultado de `Invoke-RestMethod` DIRETO em `Where-Object { $_.x -eq 'y' } | Select -First 1` pode entregar o array inteiro como item único (o `-eq` contra array retorna subarray truthy e o filtro não isola nada) → atribuir a uma variável primeiro (`$l = Invoke-...; @($l | Where ...)[0]`).
- Windows: `zoneinfo` (stdlib) sem base IANA → `ZoneInfoNotFoundError: 'America/Sao_Paulo'`. O pacote pip **tzdata** está no requirements.txt; sem ele o backend nem sobe (usado em `relatorios_service.py`).
- URL com barra final (`/api/pedidos/`) dispara redirect 307 e o .NET stripa o header Authorization → parece "Token ausente".
- Auth da API: header `Authorization: Bearer <id-token>`; claims exigidos: `restaurantId` (senão 403) e `papel` (guards por papel em `app/core/security.py`).
- Preços são sempre resolvidos no servidor a partir de `produtos` (nunca confiar no preço vindo do cliente).
- Custom claims do Firebase (`restaurantId`/`papel`) só valem no PRÓXIMO ID token: endpoints que mudam claims exigem `getIdToken(true)` + revalidação de `/auth/me` no frontend. Para guardas críticos não confie só no claim (token pode estar velho) — ex.: onboarding usa marcador transacional em `onboarding/{uid}`.
- pydantic-settings: a env é vinculada pelo NOME DO CAMPO (case-insensitive, sem prefixo) — o campo precisa se chamar exatamente como a variável (ver bug 7).
- Render free: cold start de ~30–60s (às vezes mais) — testes com `Invoke-RestMethod`/`curl` precisam de timeout ≥120s, senão parecem falha. Slugs `.onrender.com` são globais: `pdv-lanchonete.onrender.com` é de OUTRA conta; o nosso é o `-dwiw`.
- PowerShell: `Invoke-WebRequest` em modo NonInteractive exige `-UseBasicParsing`; para HEAD rápido usar `curl.exe -I`.
