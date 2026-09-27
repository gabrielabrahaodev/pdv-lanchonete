# Diagrama de Implantação (Deployment) — PDV Lanchonete v2

## Cenário atual — desenvolvimento local (implementado)

```mermaid
flowchart LR
    subgraph WS["Estação Windows do restaurante (desenvolvimento/operação)"]
        subgraph BR["Navegador Chrome/Edge"]
            SPA["SPA React (dev server Vite :5173)<br/>Service Worker PWA"]
        end
        IMP["🖨️ Impressora térmica<br/>ESC/POS Bluetooth"]
        subgraph PY["Processo Python 3.12"]
            UV["uvicorn app.main:app :8000"]
            ENV[".env<br/>PROJECT_ID · SERVICE_ACCOUNT_PATH · CORS_ORIGINS"]
            SA["scripts/service-account.json<br/>(chave Admin, fora do git)"]
        end
    end

    subgraph GCP["Google Firebase / GCP — projeto pdv-lanchonete-1fa79"]
        AUTH[("Firebase Auth")]
        FS[("Firestore<br/>região padrão do projeto<br/>plano Spark")]
    end

    CLIENTE["📱 Celular do cliente<br/>mesma rede/local"]

    SPA -->|"proxy /api → 127.0.0.1:8000"| UV
    SPA -->|"signInWithEmailAndPassword"| AUTH
    SPA -.->|"onSnapshot (opcional)"| FS
    SPA <-->|"Web Bluetooth GATT"| IMP
    CLIENTE -->|"GET/POST /api/publico/* via proxy"| UV
    UV -->|"Admin SDK + certificado SA"| FS
    ENV --> UV
    SA --> UV
```

## Cenário atual — produção (ATIVO desde 2026-08-23)

```mermaid
flowchart LR
    subgraph LOJA["Nós da loja"]
        U1["💻 Tablets/PC da operação<br/>Chrome/Edge — PWA instalado"]
        IMP["🖨️ Impressora térmica<br/>ESC/POS Bluetooth"]
        U2["📱 Celular do cliente<br/>QR do cardápio"]
    end

    FH["Firebase Hosting<br/>pdv-lanchonete-1fa79.web.app<br/>SPA estática + PWA (sem rewrite /api)"]
    RN["Render free tier<br/>pdv-lanchonete-dwiw.onrender.com<br/>uvicorn FastAPI<br/>env FIREBASE_SERVICE_ACCOUNT_JSON + CORS_ORIGINS"]

    GHA["GitHub Actions<br/>ci.yml: pytest+tsc+build a cada push/PR"]
    MON["cron-job.org<br/>GET /health 06–20h BRT"]
    GH["Repo GitHub privado<br/>push em master → auto-deploy Render"]

    AUTH2[("Firebase Auth")]
    FS2[("Firestore<br/>projeto pdv-lanchonete-1fa79")]

    U1 -->|"HTTPS"| FH
    U2 -->|"HTTPS rota pública /m/:rid/:mesa"| FH
    FH -.->|"VITE_API_URL embutido no build"| RN
    U1 & U2 -->|"chamadas diretas https://…onrender.com/api/*"| RN
    U1 <-->|"Web Bluetooth (local)"| IMP
    RN --> AUTH2
    RN --> FS2
    GH --> RN
    GH --> FH
    MON --> RN
    GHA --> GH

    style FH fill:#fff7ed,stroke:#ea580c
    style RN fill:#f0fdf4,stroke:#16a34a
```

## Cenário de desenvolvimento local (implementado)

```mermaid
flowchart LR
    subgraph WS["Estação Windows do restaurante (desenvolvimento/operação)"]
        subgraph BR["Navegador Chrome/Edge"]
            SPA["SPA React (dev server Vite :5173)"]
        end
        IMP2["🖨️ Impressora térmica"]
        subgraph PY["Processo Python 3.12"]
            UV["uvicorn app.main:app :8000<br/>(sem --reload; reiniciar após mudanças)"]
            ENV[".env<br/>PROJECT_ID · SERVICE_ACCOUNT_PATH · CORS_ORIGINS"]
            SA["scripts/service-account.json<br/>(chave Admin, fora do git)"]
        end
    end

    AUTH1[("Firebase Auth")]
    FS1[("Firestore")]

    SPA -->|"proxy /api → 127.0.0.1:8000"| UV
    SPA -->|"signInWithEmailAndPassword"| AUTH1
    SPA -.->|"onSnapshot (opcional)"| FS1
    SPA <-->|"Web Bluetooth GATT"| IMP2
    UV -->|"Admin SDK + certificado SA"| FS1
    ENV --> UV
    SA --> UV
```

### Requisitos de implantação por nó

| Nó | Artefato | Configuração necessária |
|---|---|---|
| Navegador da operação | Build estático do frontend | HTTPS obrigatório para Web Bluetooth; PWA instalável; dev usa proxy `/api`, produção chama a Render por URL (`VITE_API_URL` no build) |
| API na Render | `backend/` (free tier, dorme ~15 min) | Python 3.12; **tzdata**; envs `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON completo), `CORS_ORIGINS=https://pdv-lanchonete-1fa79.web.app`; dependências com **pin exato** (bug 12); `/health` GET+HEAD |
| Celular cliente | Rota pública `/m/:restaurantId/:mesaId` | Sem auth; rate limit ativo no backend; cardápio digital habilitado nas configurações |
| Impressora térmica | ESC/POS Bluetooth LE | Emparelhada com o SO do dispositivo que imprime; service UUID `18f0`; fallback janela print quando indisponível |
| Firebase | Auth + Firestore + Hosting | Usuários com claims `{restaurantId, papel}`; **regras publicadas**; Authorized Domains com `pdv-lanchonete-1fa79.web.app` |
| CI/CD e monitoramento | GitHub Actions + cron-job.org | `ci.yml` (pytest+tsc+build), keep-alive GET `/health` 06–20h BRT |

### Considerações

- **Sem estado no backend** — toda persistência é Firestore; a API pode escalar horizontalmente sem sessão local.
- **TLS** — Web Bluetooth e Service Worker exigem contexto seguro (HTTPS ou localhost).
- **Custo** — plano Spark suporta o piloto; limites de leitura/escrita diários devem ser monitorados antes de escalar.

- **Smoke pós-deploy** — `/health` é estático: sondar também um endpoint que LEIA Firestore (ex.: cardápio público).
