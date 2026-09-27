# Documento de Arquitetura de Software — PDV Lanchonete v2

## 1. Visão geral

Arquitetura **web de 3 camadas lógicas** com backend stateless e BaaS (Firebase):

```
┌──────────────┐   HTTPS /api/*    ┌──────────────┐   Admin SDK   ┌──────────────┐
│  SPA React   │ ────────────────► │  FastAPI     │ ────────────► │  Firestore   │
│  (PWA)       │ ◄──────────────── │  stateless   │ ◄──────────── │  multi-tenant│
└──────┬───────┘                   └──────┬───────┘               └──────────────┘
       │ Firebase JS SDK                  │ verify_id_token
       ▼                                  ▼
   Firebase Auth  ◄────────────────────────┘
```

**Decisões arquiteturais fundamentais:**

| # | Decisão | Justificativa |
|---|---|---|
| AD-1 | Backend único FastAPI como único ponto de escrita | Centraliza regras de negócio, autorização e transações; cliente nunca escreve no Firestore diretamente |
| AD-2 | Firestore como banco NoSQL documental multi-tenant | Custo zero inicial, tempo real nativo, escala horizontal; isolamento por prefixo de caminho |
| AD-3 | Autenticação delegada ao Firebase Auth com custom claims | Sem sessão/estado no backend; papel e tenant viajam assinados no token |
| AD-4 | Padrão agregado (arrays embutidos) para pedido/produto | Leitura atômica do agregado (pedido + itens + pagamentos) em 1 doc |
| AD-5 | Transações Firestore nos pontos de corrida | Mesa, caixa, estoque e onboarding são operações concorridas na realidade do salão |
| AD-6 | Lógica pura extraída (`calculos.py`) | Testabilidade sem emular banco (pytest) |
| AD-7 | Tempo real como fonte, não campainha | `onSnapshot` filtrado por tela (`useFirestore.ts`) É os dados; escritas na API; banner em falha — zero polling |
| AD-8 | Impressão e QR gerados no cliente | Backend não participa da impressão; Web Bluetooth evita servidor dedicado |

## 2. Camadas e responsabilidades

### 2.1 Backend (`backend/app`)

```
app/
├── main.py            # UMA instância FastAPI: lifespan(Firebase) + CORS + routers(prefix=/api)
├── core/
│   ├── config.py      # Settings pydantic-settings (.env): project_id, service_account_path,
│   │                  # firebase_service_account_json (env FIREBASE_SERVICE_ACCOUNT_JSON),
│   │                  # sentry_dsn, cors_origins, timezone
│   ├── firebase.py    # init único do Admin SDK + get_db()/get_auth(); credencial em 3 níveis:
│   │                  # env JSON → arquivo local (dev) → ADC
│   └── security.py    # get_current_auth (Bearer→claims), require_restaurant, require_roles(*papeis)
├── routers/           # 18 routers finos: validação Pydantic → chamada de service
│   │                  #   (tenant: auth, usuarios, categorias, produtos, configuracoes, mesas,
│   │                  #    pedidos, pagamentos, cozinha, caixa, delivery, estoque, fornecedores,
│   │                  #    despesas, relatorios, restaurantes, publico)
│   │                  #   (plataforma: sistema — convites, guard donoUids, sem claim tenant)
├── services/
│   ├── base.py        # caminhos multi-tenant, stamps createdAt/updatedAt, normalização datas,
│   │                  # list_items em memória (sem índices compostos)
│   ├── calculos.py    # funções PURAS: total_pedido, agregar_consumo_receita, resumo_financeiro
│   └── *.py           # domínio: pedidos, caixa, mesas, estoque, delivery, despesas...
└── models/models.py   # modelos Pydantic camelCase espelhando os contratos da API
```

Fluxo padrão de uma requisição:

```
HTTP → router (Depends(require_roles)) → service (@transactional quando crítico)
     → base.py (Firestore) → resposta dict camelCase
```

### 2.2 Frontend (`frontend/src`)

```
src/
├── App.tsx            # rotas + guards RequireAuth/RequireNoAuth/RequireAuthFallback
├── context/           # AuthContext (onAuthStateChanged + /auth/me), ThemeContext (tema por uid)
  ├── hooks/             # useFirestore (13 hooks onSnapshot filtrados = fonte), useAlertas via useEstoque
├── lib/               # api.ts (BASE=VITE_API_URL + fetch+Bearer+ApiError), apiPublico.ts, csv.ts, format.ts,
│                      # impressora.ts (ESC/POS BT + fallback print), firebase.ts (SDK client)
├── components/        # layout/AppLayout (menu/badges/PageHeader), ui/index.tsx (design system)
└── pages/             # 19 páginas organizadas por módulo (inclui Plataforma — console do dono)
```

Estado: **TanStack Query** para escritas e telas frias; telas quentes leem de hooks snapshot (`useFirestore.ts`, sem `refetchInterval`); Context apenas para sessão e tema. Nenhuma store global adicional.

## 3. Segurança

| Camada | Mecanismo |
|---|---|
| Identidade | Firebase Auth (e-mail/senha); ID token ~1h |
| Autorização API | Claims `restaurantId`(obrigatório)+`papel` verificados a cada requisição; guards por papel. Plano da PLATAFORMA separado: `/api/sistema/*` usa guard `sistema/global.donoUids[]` (sem tenant) |
| Autorização banco | `firestore.rules`: acesso direto só se `token.restaurantId == restaurantId`; onboarding leitura própria; `convites/` e `sistema/` deny-by-default (só Admin SDK) |
| Rotas públicas | Cardápio digital (gate por configuração + rate limit 12/min/IP + payload estrito) e bytes da imagem do produto (`GET /publico/{rid}/imagens/{produto_id}` — fora do rate limit/gate de propósito: `<img>` não envia Authorization; foto é conteúdo público do menu) |
| Dados sensíveis | Preço sempre do servidor; service account fora do git; CORS whitelist |

## 4. Confiabilidade e concorrência

Pontos protegidos por transação Firestore (`@transactional`):
1. criar pedido ↔ ocupar mesa;
2. abrir sessão de caixa (query dentro da txn);
3. movimentação de estoque manual (saldo+mov);
4. baixa automática de ingredientes (mesma txn do status do item);
5. crédito de venda na sessão;
6. reserva do marcador de onboarding.

Convenções de integridade: `stamp_update` descarta `None` → limpeza de campo usa `DELETE_FIELD` explícito; idempotência via campos-marca (`baixadoEm`). Em TODA transação Firestore: **leitura 100% antes de escrita 100%** — a API proíbe ler um doc depois de escrever outro (`ReadAfterWriteError`, bug 10; a baixa agregada faz fase 1 = ler config+estoques, fase 2 = escrever tudo). Mutações que tocam o mesmo doc nunca disparam em paralelo do cliente — agrupar num endpoint bulk (cozinha). Exceções não tratadas passam FORA do CORS → middleware interno `_Erros500Json` devolve 500 JSON dentro da pilha (bug 9).

## 5. Performance

- Listagens in-memory (coleções pequenas), sem índices compostos;
- Snapshot filtrado por tela como fonte (zero polling); banner + recarregar em falha; persistência local cobre reaberturas;
- Service Worker NetworkFirst para GETs `/api/*` (timeout 4s, cache 24h, 200 entradas);
- Payload público do cardápio enxuto (sem ingredientes/custos);
- **Code-splitting por rota** (`React.lazy`) + chunks de vendor separados (react/firebase/query): o bundle inicial saiu de um único arquivo de ~790 kB para páginas de 2–27 kB carregadas sob demanda — relevante para o cardápio QR no 4G do cliente.

## 6. Escalabilidade e limites conhecidos

| Aspecto | Situação atual | Limite/gatilho de evolução |
|---|---|---|
| Coleção pedidos cresce indefinidamente | OK para piloto | Arquivar pedidos > 90 dias quando consultas pesarem |
| list_items carrega coleção inteira | aceitável (< poucos milhares docs) | Migrar para queries paginadas com índices |
| Rate limit público em memória | por instância | Trocar por limiter distribuído se houver réplica |
| Single instance uvicorn | dev/piloto | gunicorn -k uvicorn.workers.UvicornWorker em produção |

## 7. Diagrama físico

Ver `../02-modelagem/diagrama-componentes.md`, `diagrama-implantacao.md`, o diagrama de **produção** `../arquitetura-producao.svg` (12 integrações numeradas com o que trafega em cada uma) e o histórico local `../arquitetura-atual.svg`/`.png`.

## 8. Qualidade e operação

- pytest sobre `calculos.py` + validação de modelos (35 testes) — `requirements-dev.txt`;
- Suíte E2E de API **versionada em `scripts/e2e/`** (80 passos base + 13 de onboarding condicionais ao token do dono da plataforma, alvo padrão = produção) com cleanup automático;
- Tipagem estática TS no frontend (`tsc && vite build`);
- **CI GitHub Actions** (`.github/workflows/ci.yml`): pytest + tsc + build a cada push/PR;

- Erros 5xx reportáveis ao Sentry (integração env-gated `SENTRY_DSN`, inativa sem DSN);
- Erros HTTP padronizados em português com códigos coerentes (401/403/404/409/422).
