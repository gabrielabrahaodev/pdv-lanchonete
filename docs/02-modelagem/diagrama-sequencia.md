# Diagramas de Sequência — PDV Lanchonete v2

Cenários principais com os atores reais do sistema: **Frontend (React)**, **API (FastAPI)**, **Serviço de domínio**, **Firestore** e, quando aplicável, **Firebase Auth/Impressora**.

---

## 1. Login e carregamento do contexto

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário
    participant FE as Frontend (React)
    participant FA as Firebase Auth
    participant API as API FastAPI
    participant FS as Firestore

    U->>FE: e-mail + senha
    FE->>FA: signInWithEmailAndPassword
    FA-->>FE: ID token (+ claims restaurantId/papel)
    FE->>FA: onAuthStateChanged dispara
    FE->>API: GET /api/auth/me (Bearer token)
    API->>FA: verify_id_token(token)
    API->>FS: ler restaurante + configurações + perfil
    API-->>FE: {uid, papel, restaurantId, perfil, configuracoes}
    alt sem restaurantId
        FE->>U: tela /select-restaurant (onboarding)
    else com restaurantId
        FE->>U: redireciona para /caixa
    end
```

## 2. Abrir pedido em mesa (transação anti-corrida)

```mermaid
sequenceDiagram
    autonumber
    actor G as Garçom/Caixa
    participant FE as Frontend
    participant API as API POST /api/pedidos
    participant PS as pedidos_service
    participant FS as Firestore

    G->>FE: seleciona mesa livre e itens
    FE->>API: POST /pedidos?mesa_id=... (itens[])
    API->>PS: criar(rid, uid, mesa_id, tipo, itens)
    PS->>PS: resolve preço no servidor (produto+variação)
    PS->>FS: BEGIN TRANSACTION
    PS->>FS: get(mesa)
    alt mesa ocupada
        FS-->>PS: status=ocupada
        PS-->>API: 409 Mesa já está ocupada
        API-->>FE: 409
    else mesa livre
        PS->>FS: set(pedido {status aberto, total})
        PS->>FS: update(mesa {ocupada, pedidoAtivoId, garcomId})
        FS-->>PS: commit OK
        PS-->>API: pedido criado
        API-->>FE: 201 Order
    end
```

## 3. Iniciar preparo no KDS — bulk com baixa automática AGREGADA

```mermaid
sequenceDiagram
    autonumber
    actor C as Cozinheiro
    participant FE as Frontend (KDS)
    participant API as PATCH /cozinha/pedidos/{id}/itens/status (BULK)
    participant PS as cozinha_service / pedidos_service
    participant FS as Firestore

    C->>FE: "Iniciar preparo" no cartão (vários itens da mesa)
    FE->>API: PATCH {itemIds[], novoStatus:"preparo"} — 1 chamada
    API->>PS: atualizar_status_itens_bulk(...)
    PS->>FS: BEGIN TRANSACTION
    PS->>FASE 1 — LEITURAS: get(pedido) + itens selecionados
    PS->>FS: get(configuracoes).baixaEstoqueAutomatica
    alt flag ON e itens pendentes sem baixadoEm
        PS->>PS: consumo agregado = Σ receita × qtd por itemId (_consumo_produto)
        Note over PS,FS: FASE 2 — ESCRITAS (leitura 100% antes de escrita 100%, bug 10)
        loop cada ingrediente afetado (uma leitura/escrita por item)
            PS->>FS: set(movimentação saida {qtd, saldoApos, pedidoId})
            PS->>FS: update(estoque saldo = atual − consumo agregado)
        end
        Note over PS,FS: saldo pode ficar negativo; ingrediente inexistente é ignorado
        PS->>FS: update(itens[].baixadoEm = agora) ← idempotência
    else flag OFF ou já baixados
        Note over PS,FS: apenas troca o status
    end
    PS->>FS: update(itens[].status=preparo)
    FS-->>PS: commit
    PS-->>FE: 200 pedido atualizado
```

> A rota antiga `PATCH .../itens/{itemId}/status` delega ao bulk. NUNCA disparar N PATCHes paralelos (contenção de transação — bug 9).

## 4. Pagamento que quita o pedido

```mermaid
sequenceDiagram
    autonumber
    actor X as Operador de Caixa
    participant FE as Frontend (PagamentoPage)
    participant API as POST /api/pagamentos/{pedidoId}
    participant CS as caixa_service
    participant FS as Firestore

    X->>FE: forma + valor (+ recebido p/ troco)
    FE->>API: {tipo:"pix", valor: 42.90}
    API->>CS: registrar_pagamento(...)
    CS->>FS: get(pedido) → status aberto
    CS->>CS: valida tipo; valor ≤ restante+0,01
    CS->>FS: update(pedido.pagamentos += pagamento)
    alt soma ≥ total − 0,01
        CS->>FS: update(pedido.status=pago, fechadoEm)
        CS->>FS: BEGIN TRANSACTION (sessão caixa)
        CS->>FS: query sessoes_caixa where status==aberto
        CS->>FS: update(totalVendas+, totalRecebido+, porForma+, qtdePorProduto+)
        FS-->>CS: commit
        CS->>FS: update(mesa: livre, DELETE_FIELD pedidoAtivoId/garcomId)
    end
    CS-->>API: pedido atualizado
    API-->>FE: 201 (status pago?)
    opt quitado
        FE->>FE: oferece recibo → imprimir() [Bluetooth ESC/POS | janela]
        FE->>X: volta ao mapa de mesas
    end
```

## 5. Pedido pelo cardápio digital (cliente na mesa)

```mermaid
sequenceDiagram
    autonumber
    actor CL as Cliente (celular)
    participant FE as CardapioPage (/m/:rid/:mesa)
    participant API as /api/publico/*
    participant FS as Firestore

    CL->>FE: escaneia QR da mesa
    FE->>API: GET /publico/{rid}/cardapio
    API->>API: rate limit (12/min/IP) + gate cardapioDigitalAtivo
    API->>FS: categorias + produtos ativos
    API-->>FE: cardápio enxuto
    CL->>FE: monta carrinho e envia
    FE->>API: POST /publico/{rid}/mesas/{mesa}/pedido {itens[1..30]}
    API->>FS: get(mesa)
    alt mesa livre
        API->>API: pedidos_service.criar(usuario="cardapio_digital")
    else mesa ocupada com pedidoAtivoId
        API->>API: adicionar_item() ao pedido ativo
    else mesa inativa
        API-->>FE: 409
    end
    API-->>FE: 201 {pedidoId, adicionadoA}
```

## 6. Onboarding por convite (criação do primeiro restaurante)

```mermaid
sequenceDiagram
    autonumber
    actor A as Novo usuário (admin)
    participant OW as Dono da Plataforma (/plataforma)
    participant FE as SelectRestaurantPage?t=CÓDIGO
    participant API as POST /api/restaurantes/primeiro {token}
    participant RS as restaurantes_service
    participant FS as Firestore
    participant FA as Firebase Auth Admin

    OW->>FS: POST /api/sistema/convites → cria convites/{token}<br/>(expira 7d; guard sistema/global.donoUids)
    A->>FE: abre link com convite + nome + quantidade de mesas
    FE->>API: payload {token, nome, quantidadeMesas}
    API->>RS: criar_primeiro(auth, payload)
    RS->>FS: TRANSACTION única (leituras 100% antes das escritas)
    alt claim restaurantId presente (token novo)
        RS->>RS: marcador completo? → AUTO-CURA:<br/>reemite claims e devolve MESMO restaurante
        RS-->>FE: 200 {restaurantId} (mesmo)
    else sem convite válido e não é dono/bootstrap
        RS-->>API: 403 (ausente/expirado/usado/revogado)
    else convite válido
        RS->>FS: lê marcador + convite + estado
        RS->>FS: set(doc raiz + configurações + docs-pai<br/>+ mesas numeradas + doc admin)
        RS->>FS: set(onboarding/{uid} completo) + update(convite.usadoEm/usadoPorUid)
        FS-->>RS: commit (reuso impossível nem em corrida)
        RS->>FA: set_custom_user_claims(uid, {restaurantId, papel=admin})
        RS-->>FE: 201 {restaurantId}
        FE->>FA: getIdToken(true) — refresh forçado
        FE->>API: GET /auth/me novamente
    end
```

## 7. Fechamento do caixa

```mermaid
sequenceDiagram
    autonumber
    actor X as Caixa/Admin
    participant FE as FechamentoCaixaPage
    participant API as POST /api/caixa/fechar
    participant CS as caixa_service
    participant FS as Firestore

    X->>FE: informar valor contado
    FE->>API: {valorContado}
    API->>CS: fechar()
    CS->>FS: buscar sessão aberta
    CS->>CS: esperado = inicial+recebido+suprimentos−sangrias
    CS->>FS: update(status=fechado, resumoFechamento{esperado, contado, diferença})
    CS-->>FE: sessão fechada
    FE-->>X: exibe diferença de caixa
```
