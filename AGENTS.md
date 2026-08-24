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

## Testes E2E (sessão 2026-08-22)

Scripts criados em `%LOCALAPPDATA%\Temp\opencode\e2e-repro\` (temporário; recriar se apagado):

- `e2e_test.js` — reproduz o fluxo do app Flutter Web direto no Firestore: login Firebase Auth → ler produtos/mesas → query pedidos `whereIn status` → batch.set(merge) de pedido + update de mesa → cleanup. Rodar com `node e2e_test.js`.
- `get-token.js` — login e salva ID token em `token.txt` (para chamar a API FastAPI).
- `api_test.ps1` — suíte completa de 34 testes da API (auth, CRUDs, pedido→cozinha→pagamento→caixa, estoque, delivery, relatórios, configurações) com cleanup automático. Rodar com `powershell -NoProfile -ExecutionPolicy Bypass -File api_test.ps1`. Estado final: **34/34 PASS**.
- `manual_b1_m4.ps1` — testes manuais do plano de correções: pagamento minimalista `{tipo, valor}` (sem id/criadoEm, espera 201) e delivery com `platform: "uber"` (espera 422). Estado final: **TODOS PASS**.

O token em `token.txt` expira em 1h — se a suíte começar a dar 401 "Token inválido ou expirado", rodar `node get-token.js` de novo antes.

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

## Bugs já corrigidos (não reintroduzir)

1. `pedidos_service.criar()` chamava função inexistente `get_pedido` → 500 depois de gravar pedido e ocupar mesa. Correto: `obter()`.
2. `_run_txn` usava `db.run_transaction(...)` (API do SDK Node.js, não existe no Python). Correto: decorator `from google.cloud.firestore import transactional`.
3. `Transaction.get(ref)` no SDK Python retorna **generator** de snapshots (não um snapshot único): usar `next(iter(transaction.get(ref)), None)`.
4. `stamp_update()` descarta campos `None` — updates que precisam limpar campo devem usar `DELETE_FIELD` explícito (ver `mesas_service.liberar()`, que antes deixava `pedidoAtivoId` órfão em mesa liberada).
5. `_run_txn` deve retornar sempre o pedido completo (`obter(...)`) após commit — os txns internos não têm return.
6. Sessão 2026-08-22 (correções B1–B5/M1–M4): `main.py` chegou a ter **duas instâncias** de `FastAPI` (routers na primeira, `lifespan` na segunda) → só `/health` respondia, todo `/api/*` dava 404. Correto: UMA instância com `lifespan=` + middleware + routers. Ao mexer no app, garantir que routers ficam na instância exportada.
7. Sessão 2026-08-23 (produção): campo pydantic chamava-se `service_account_json` → lia a env `SERVICE_ACCOUNT_JSON`, NUNCA `FIREBASE_SERVICE_ACCOUNT_JSON`; na Render caía no ADC sem projeto → **401 em toda rota autenticada e 500 nos endpoints públicos**, com `/health` ok (init ADC é lazy). Correto: campo renomeado para `firebase_service_account_json`. Diagnóstico rápido: endpoint público que lê Firestore dando 500 ⇒ credencial quebrada; `/health` é estático e não prova nada.
8. Sessão 2026-08-23 (produção): `/health` só aceitava GET → monitores externos fazem HEAD e recebiam 405 ("405 method not allowed" no UptimeRobot com serviço perfeitamente saudável). Correto: `@app.api_route("/health", methods=["GET", "HEAD"])`.

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
