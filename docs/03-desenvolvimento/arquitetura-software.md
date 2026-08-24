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
| AD-7 | Tempo real como otimização, não dependência | `onSnapshot` invalida caches; ausência degrada para polling — o app nunca quebra |
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
├── routers/           # 17 routers finos: validação Pydantic → chamada de service
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
├── hooks/             # useRealtime (onSnapshot→invalidateQueries), useAlertasEstoque
├── lib/               # api.ts (BASE=VITE_API_URL + fetch+Bearer+ApiError), apiPublico.ts, csv.ts, format.ts,
│                      # impressora.ts (ESC/POS BT + fallback print), firebase.ts (SDK client)
├── components/        # layout/AppLayout (menu/badges/PageHeader), ui/index.tsx (design system)
└── pages/             # 16 páginas organizadas por módulo
```

Estado: **TanStack Query** para dados do servidor (chaves por recurso, polling 8–30s); Context apenas para sessão e tema. Nenhuma store global adicional.

## 3. Segurança

| Camada | Mecanismo |
|---|---|
| Identidade | Firebase Auth (e-mail/senha); ID token ~1h |
| Autorização API | Claims `restaurantId`(obrigatório)+`papel` verificados a cada requisição; guards por papel |
| Autorização banco | `firestore.rules`: acesso direto só se `token.restaurantId == restaurantId`; onboarding leitura própria |
| Rotas públicas | Apenas cardápio digital: gate por configuração + rate limit 12/min/IP + validações estritas de payload |
| Dados sensíveis | Preço sempre do servidor; service account fora do git; CORS whitelist |

## 4. Confiabilidade e concorrência

Pontos protegidos por transação Firestore (`@transactional`):
1. criar pedido ↔ ocupar mesa;
2. abrir sessão de caixa (query dentro da txn);
3. movimentação de estoque manual (saldo+mov);
4. baixa automática de ingredientes (mesma txn do status do item);
5. crédito de venda na sessão;
6. reserva do marcador de onboarding.

Convenções de integridade: `stamp_update` descarta `None` → limpeza de campo usa `DELETE_FIELD` explícito; idempotência via campos-marca (`baixadoEm`).

## 5. Performance

- Listagens in-memory (coleções pequenas), sem índices compostos;
- Cache react-query com `staleTime` (produtos 60s) e `refetchInterval` (mesas 15s, KDS 8s, caixa 30s);
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

Ver `../02-modelagem/diagrama-componentes.md`, `diagrama-implantacao.md` e imagem `../arquitetura-atual.png`.

## 8. Qualidade e operação

- pytest sobre `calculos.py` + validação de modelos (23 testes) — `requirements-dev.txt`;
- Suíte E2E de API **versionada em `scripts/e2e/`** (35 casos, alvo padrão = produção) com cleanup automático;
- Tipagem estática TS no frontend (`tsc && vite build`);
- **CI GitHub Actions** (`.github/workflows/ci.yml`): pytest + tsc + build a cada push/PR;
- **Backup diário** do Firestore via Actions (`.github/workflows/backup.yml`) commitado em `backups/`;
- Erros 5xx reportáveis ao Sentry (integração env-gated `SENTRY_DSN`, inativa sem DSN);
- Erros HTTP padronizados em português com códigos coerentes (401/403/404/409/422).
