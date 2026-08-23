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
        PAGES["Pages: Caixa · Mesas · Produtos · Estoque<br/>Cozinha KDS · Delivery · Relatórios<br/>Fechamento · Financeiro · Configurações · Cardápio"]
        CTX["Contexts: AuthContext · ThemeContext"]
        HOOKS["Hooks: useRealtime (onSnapshot)<br/>useAlertasEstoque"]
        RQ["TanStack Query<br/>(cache + polling 8–30s)"]
        LIBS["lib: api.ts (Bearer fetch) · apiPublico.ts<br/>csv.ts · format.ts · impressora.ts (ESC/POS BT)"]
        FBJS["Firebase JS SDK<br/>(Auth client + Firestore onSnapshot)"]
        PWA["Service Worker (Workbox)<br/>NetworkFirst GET /api/* · precache app shell"]
    end

    subgraph APIB["Componente: backend (FastAPI) — porta 8000"]
        direction TB
        MAIN["app.main<br/>CORS + lifespan + routers"]
        SEC["core.security<br/>verify_id_token · require_restaurant · require_roles"]
        PUB["routers.publico<br/>rate limit 12/min/IP + gate cardapioDigitalAtivo"]
        ROUTERS["Routers: auth · restaurantes · categorias · produtos<br/>mesas · pedidos · pagamentos · cozinha · estoque<br/>fornecedores · despesas · caixa · delivery · relatorios<br/>configuracoes · usuarios"]
        SERVICES["Services de domínio<br/>pedidos · caixa · estoque · mesas · delivery · despesas<br/>fornecedores · relatorios · usuarios · restaurantes · auth"]
        CALC["calculos.py<br/>lógica pura testável (total, receita, DRE)"]
        BASE["services.base<br/>caminhos multi-tenant, stamps, normalização datas"]
        CFG["core.config (pydantic-settings .env)<br/>core.firebase (Admin SDK init)"]
    end

    subgraph FIREBASE["☁️ Projeto Firebase: pdv-lanchonete-1fa79"]
        AUTH[("Firebase Auth<br/>usuários + custom claims")]
        FS[("Firestore<br/>restaurantes/{rid}/data/**<br/>onboarding/{uid}")]
        RULES["firestore.rules<br/>isolamento por tenant"]
    end

    SCRIPTS["Componente: scripts (TS Admin)<br/>init-firestore.ts · seed-data.ts · delete-all-collections.ts<br/>service-account.json (segredo local)"]

    %% Fluxos
    NAV -->|"HTTPS /api/* (proxy dev :5173→8000)"| MAIN
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

    style PWA fill:#fff7ed,stroke:#ea580c
    style RULES fill:#fef2f2,stroke:#dc2626
    style SCRIPTS fill:#f8fafc,stroke:#64748b
```

## Tabela de componentes

| Componente | Tecnologia | Responsabilidade | Interfaces expostas |
|---|---|---|---|
| **frontend** | React 18, Vite 5, Tailwind 4 | UI da operação e do cliente; PWA | HTTP `/api/*`; Firebase Auth JS; Web Bluetooth |
| **backend** | FastAPI, Python 3.12 | Regras de negócio, autorização, transações | REST `/api/*` (17 routers), `GET /health` |
| **Firebase Auth** | Serviço gerenciado | Identidade, ID tokens, claims | SDK client (login) e Admin (claims/usuários) |
| **Firestore** | Serviço gerenciado | Persistência multi-tenant | Caminho `restaurantes/{rid}/data/**` |
| **firestore.rules** | Rules v2 | Isolamento no acesso direto do cliente | Deploy `firebase deploy --only firestore:rules` |
| **scripts** | Node TS + firebase-admin | Provisionar/dados demo/limpar ambiente | CLI npm (`npm run init|seed`) |

## Pontos de integração notáveis

1. **Proxy de desenvolvimento** — o dev server do Vite repassa `/api` para `127.0.0.1:8000` (`vite.config.ts`); em produção o host deve fazer o mesmo mapeamento.
2. **Dois caminhos ao Firestore** — escritas SEMPRE pela API (Admin SDK); leituras em tempo real opcionais direto do cliente (restritas pelas rules; ausência não quebra o app).
3. **Impressão é 100% cliente** — o backend não imprime; o navegador fala com a impressora térmica Bluetooth.
