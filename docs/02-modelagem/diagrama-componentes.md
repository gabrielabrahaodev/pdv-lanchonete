# Diagrama de Componentes — PDV Lanchonete v2

```mermaid
flowchart TB
    subgraph Clientes["🖥️ Clientes"]
        NAV["Navegador interno<br/>(Chrome/Edge — operação)"]
        MOB["Celular do cliente<br/>(cardápio via QR)"]
    end

    subgraph SPA["Componente: frontend (SPA React 18 + TS) — porta 5173 / build estático"]
        direction TB
        ROUTES["AppRouter<br/>(rotas protegidas + públicas)"]
        LAYOUT["AppLayout (menu, badges, realtime hook)"]
        PAGES["Pages: Caixa · Mesas · Produtos · Categorias · Estoque<br/>Cozinha KDS · Delivery · Relatórios<br/>Fechamento · Financeiro · Configurações · Cardápio<br/>Plataforma (dono)"]
        CTX["Contexts: AuthContext · ThemeContext"]
        HOOKS["Hooks: useFirestore<br/>(13, filtrados por tela)"]
        RQ["TanStack Query<br/>(escritas + telas frias)<br/>+ snapshot fonte (quentes)"]
        LIBS["lib: api.ts (Bearer fetch) · apiPublico.ts<br/>csv.ts · format.ts · impressora.ts (ESC/POS BT)<br/>imagem.ts (compressão + URL pública) · qrcode"]
        FBJS["Firebase JS SDK<br/>(Auth client + Firestore onSnapshot)"]
        PWA["Service Worker (Workbox)<br/>NetworkFirst GET /api/* · precache app shell"]
    end

    subgraph APIB["Componente: backend (FastAPI) — porta 8000"]
        direction TB
        MAIN["app.main<br/>CORS + lifespan + routers"]
        SEC["core.security<br/>verify_id_token · require_restaurant · require_roles"]
        PUB["routers.publico<br/>rate limit 12/min/IP + gate cardapioDigitalAtivo"]
        SIS["routers.sistema<br/>convites da plataforma — guard sistema/global.donoUids"]
        ROUTERS["Routers: auth · restaurantes · categorias · produtos (+imagem)<br/>mesas · pedidos · pagamentos · cozinha (bulk) · estoque<br/>fornecedores · despesas · caixa · delivery · relatorios<br/>configuracoes · usuarios · publico · sistema"]
        SERVICES["Services de domínio<br/>pedidos · caixa · estoque · mesas · delivery · despesas<br/>fornecedores · relatorios · usuarios · restaurantes<br/>auth · convites · categorias · produtos · configuracoes"]
        CALC["calculos.py<br/>lógica pura testável (total, receita, DRE)"]
        BASE["services.base<br/>caminhos multi-tenant, stamps, normalização datas"]
        CFG["core.config (pydantic-settings .env)<br/>core.firebase (Admin SDK init)"]
    end

    subgraph FIREBASE["☁️ Projeto Firebase: pdv-lanchonete-1fa79"]
        AUTH[("Firebase Auth<br/>usuários + custom claims")]
        FS[("Firestore<br/>restaurantes/{rid}/data/**<br/>onboarding/{uid} · sistema/global · convites/{token}")]
        RULES["firestore.rules<br/>isolamento por tenant"]
    end

    SCRIPTS["Componente: scripts (TS Admin)<br/>init-firestore.ts · seed-data.ts · delete-all-collections.ts<br/>promover-dono · limpar-onboarding-qa · service-account.json (segredo local)"]

    GHACTIONS["GitHub Actions<br/>ci.yml (pytest+tsc+build)"]

    %% Fluxos
    NAV -->|"HTTPS /api/* (proxy dev :5173→8000; prod: VITE_API_URL direto)"| MAIN
    MOB -->|"rota pública /m/:rid/:mesa"| PAGES
    NAV -->|"Auth REST direto"| AUTH
    MOB -->|"/api/publico/* sem token"| PUB

    ROUTES --> LAYOUT --> PAGES
    PAGES --> RQ
    RQ --> LIBS
    CTX --> LIBS
    HOOKS --> FBJS
    PWA -. cache offline .-> LIBS

    MAIN --> SEC
    MAIN --> PUB
    MAIN --> SIS
    SEC --> ROUTERS
    ROUTERS --> SERVICES
    SERVICES --> CALC
    SERVICES --> BASE
    BASE --> CFG
    CFG -->|"Admin SDK (certificado)"| FS
    SEC -->|"verify_id_token"| AUTH
    FBJS -->|"onSnapshot (se rules publicadas)"| RULES
    RULES --> FS
    SCRIPTS -->|"Admin SDK"| FS
    SCRIPTS --> AUTH
    GHACTIONS -->|"CI roda pytest/tsc/build"| NAV
    GHACTIONS -->|"export JSON diário"| FS

    style PWA fill:#fff7ed,stroke:#ea580c
    style RULES fill:#fef2f2,stroke:#dc2626
    style SCRIPTS fill:#f8fafc,stroke:#64748b
```

## Tabela de componentes

| Componente | Tecnologia | Responsabilidade | Interfaces expostas |
|---|---|---|---|
| **frontend** | React 18, Vite 5, Tailwind 4 | UI da operação e do cliente; PWA | HTTP `/api/*`; Firebase Auth JS; Web Bluetooth |
| **backend** | FastAPI, Python 3.12 | Regras de negócio, autorização, transações | REST `/api/*` (18 routers), `GET/HEAD /health` |
| **Firebase Auth** | Serviço gerenciado | Identidade, ID tokens, claims | SDK client (login) e Admin (claims/usuários) |
| **Firestore** | Serviço gerenciado | Persistência multi-tenant + plataforma (`sistema/global`, `convites`) | Caminho `restaurantes/{rid}/data/**` |
| **firestore.rules** | Rules v2 | Isolamento no acesso direto do cliente | Deploy `firebase deploy --only firestore:rules` |
| **scripts** | Node TS + firebase-admin | Provisionar/dados demo/limpar ambiente/gestão de donos | CLI npm (`npm run init|seed|promover-dono|limpar-onboarding-qa`) |
| **GitHub Actions** | Workflows YAML | CI (pytest+tsc+build) | Push/PR |

## Pontos de integração notáveis

1. **Proxy de desenvolvimento** — o dev server do Vite repassa `/api` para `127.0.0.1:8000` (`vite.config.ts`). Em produção NÃO há rewrite (exigiria Blaze): o frontend chama a URL direta da Render via `VITE_API_URL` embutido no build + CORS.
2. **Dois caminhos ao Firestore** — escritas SEMPRE pela API (Admin SDK); leituras em tempo real opcionais direto do cliente (restritas pelas rules; ausência não quebra o app).
3. **Impressão é 100% cliente** — o backend não imprime; o navegador fala com a impressora térmica Bluetooth.
4. **Imagem do produto** — bytes públicos fora do rate limit/gate (`<img>` não envia Authorization).
