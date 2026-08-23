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

## Cenário alvo — produção planejada

```mermaid
flowchart LR
    U1["💻 Tablets/navegador da loja"] & U2["📱 Cliente (QR)"] --> FH["Firebase Hosting<br/>SPA estática + rewrites /api"]
    FH -->|"rewrite /api/*"| RN["Render / PaaS<br/>uvicorn FastAPI :8000<br/>variável SERVICE_ACCOUNT_JSON"]
    RN --> AUTH2[("Firebase Auth")]
    RN --> FS2[("Firestore")]
    U1 <-->|"Web Bluetooth (local)"| IMP2["Impressora térmica"]

    style FH fill:#fff7ed,stroke:#ea580c
```

### Requisitos de implantação por nó

| Nó | Artefato | Configuração necessária |
|---|---|---|
| Navegador da operação | Build estático do frontend | HTTPS obrigatório para Web Bluetooth; PWA instalável; apontar `/api` para o backend (proxy/rewrite) |
| Servidor de aplicação | `backend/` + `.venv` | Python 3.12; pacote **tzdata**; variáveis `PROJECT_ID`, `SERVICE_ACCOUNT_PATH` (ou segredo equivalente), `CORS_ORIGINS` com origens de produção; porta 8000 atrás de TLS no edge |
| Celular cliente | Rota pública `/m/:restaurantId/:mesaId` | Sem auth; rate limit ativo no backend; cardápio digital habilitado nas configurações |
| Impressora térmica | ESC/POS Bluetooth LE | Emparelhada com o SO do dispositivo que imprime; service UUID `18f0`; fallback janela print quando indisponível |
| Firebase | Auth + Firestore | Usuários com claims `{restaurantId, papel}`; **regras publicadas** (`firebase deploy --only firestore:rules`) |

### Considerações

- **Sem estado no backend** — toda persistência é Firestore; a API pode escalar horizontalmente sem sessão local.
- **TLS** — Web Bluetooth e Service Worker exigem contexto seguro (HTTPS ou localhost).
- **Custo** — plano Spark suporta o piloto; limites de leitura/escrita diários devem ser monitorados antes de escalar.
- **Backup/DR** — export programado do Firestore (recomendado antes do go-live).
