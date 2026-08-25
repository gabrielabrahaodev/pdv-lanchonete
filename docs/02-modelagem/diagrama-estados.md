# Diagramas de Estados — PDV Lanchonete v2

## 1. Pedido (`Order.status`)

```mermaid
stateDiagram-v2
    [*] --> aberto : criar pedido (mesa livre)
    aberto --> pago : quitação<br/>(Σ pagamentos ≥ total − R$0,01)
    aberto --> cancelado : cancelar (sem pagamentos)
    pago --> [*]
    cancelado --> [*]

    note right of aberto
        Itens podem ser adicionados;
        itens pendentes removidos;
        total recalculado no servidor.
        Efeitos da quitação: crédito no
        caixa + mesa liberada.
    end note
```

## 2. Item do pedido (`OrderItem.status`)

```mermaid
stateDiagram-v2
    [*] --> pendente : item adicionado
    pendente --> preparo : KDS "Iniciar preparo"<br/>→ baixa de ingredientes (RN-07)
    preparo --> pronto : KDS "Marcar pronto"
    pronto --> entregue : KDS "Entregar"
    pendente --> cancelado : cancelar item
    preparo --> cancelado : cancelar (não estorna estoque)
    entregue --> [*]
    cancelado --> [*]

    note right of pendente
        Remoção física do pedido
        permitida APENAS aqui.
        baixadoEm marca idempotência
        da baixa automática.
    end note
```

## 3. Mesa (`Mesa.status`)

```mermaid
stateDiagram-v2
    [*] --> livre : criar mesa / onboarding
    livre --> ocupada : abrir pedido (transacional)
    livre --> reservada : garçom reserva
    reservada --> ocupada : abrir pedido
    reservada --> livre : liberar
    ocupada --> livre : pagamento quitado<br/>ou cancelamento do pedido
    livre --> inativa : desativar (admin)
    inativa --> livre : reativar

    note right of ocupada
        Mesa guarda pedidoAtivoId e garcomId;
        ao liberar, campos são removidos
        explicitamente (DELETE_FIELD).
        Mesa inativa rejeita pedidos do cardápio digital (409).
    end note
```

## 4. Sessão de caixa (`CashRegisterSession.status`)

```mermaid
stateDiagram-v2
    [*] --> aberto : POST /caixa/abrir<br/>(409 se já houver aberta)
    aberto --> aberto : suprimento (+)<br/>sangria (−)<br/>vendas quitadas creditam
    aberto --> fechado : POST /caixa/fechar<br/>resumo {esperado, contado, diferença}
    fechado --> [*]

    note right of aberto
        Uma única sessão aberta por tenant,
        garantida em transação.
        esperado = inicial + recebido +
        suprimentos − sangrias
    end note
```

## 5. Delivery (`DeliveryOrder.status`) — máquina com transições restritas

```mermaid
stateDiagram-v2
    [*] --> pending : criar delivery
    pending --> confirmed : confirmar (confirmadoEm)
    confirmed --> preparing : preparar
    preparing --> ready : marcar pronto (prontoEm)
    ready --> delivered : entregar (entregueEm)
    delivered --> [*]

    pending --> cancelled : cancelar
    confirmed --> cancelled : cancelar
    preparing --> cancelled : cancelar
    ready --> cancelled : cancelar
    cancelled --> [*]

    note right of delivered
        Estados terminais: delivered e cancelled.
        Qualquer outra transição → 409.
    end note
```

## 6. Autenticação no frontend (`AuthContext`)

```mermaid
stateDiagram-v2
    [*] --> carregando : app inicia (onAuthStateChanged)
    carregando --> deslogado : sem fbUser
    carregando --> logadoSemTenant : fbUser e !me.restaurantId
    carregando --> logadoCompleto : fbUser e me.restaurantId
    deslogado --> carregando : login()
    logadoSemTenant --> logadoCompleto : onboarding por convite OK (?t=CÓDIGO) +<br/>refresh do token + /auth/me
    logadoCompleto --> deslogado : logout()
    logadoSemTenant --> deslogado : logout()

    logadoCompleto : rotas protegidas (/caixa ...)
    logadoSemTenant : rota /select-restaurant — EXIGE convite válido<br/>(sem ?t= ou convite inválido → 403)
    deslogado : rotas públicas (/login, /m/:rid/:mesa)
```

## 7. Convite de provisionamento (`convites/{token}`)

```mermaid
stateDiagram-v2
    [*] --> ativa : dono da plataforma gera<br/>POST /api/sistema/convites
    ativa --> usada : consumida no onboarding<br/>(usadoEm/usadoPorUid na mesma transação)
    ativa --> revogada : DELETE /api/sistema/convites/{token}
    ativa --> expirada : expiraEm passou (+7 dias)
    usada --> [*]
    revogada --> [*]
    expirada --> [*]

    note right of ativa
        Uso único: a validação e o consumo acontecem
        dentro da transação de criação do restaurante
        (impossível usar duas vezes, nem em corrida).
        Qualquer estado ≠ ativa → 403 no onboarding.
    end note
```
