# Diagrama de Atividades — PDV Lanchonete v2

## 1. Atividade principal: ciclo da venda no salão (mesa)

```mermaid
flowchart TD
    A([Início do expediente]) --> B{Caixa aberto?}
    B -- Não --> C[Abrir caixa<br/>fundo de troco]
    B -- Sim --> D
    C --> D[Cliente senta / chama atendente]
    D --> E[Mesa livre?]
    E -- Não --> F[Abrir pedido ativo da mesa]
    E -- Sim --> G[Criar novo pedido<br/>lançar itens]
    F --> H
    G --> H[Lançamento de itens:<br/>produto, variação, obs, qtd]
    H --> I{Mais itens?}
    I -- Sim --> H
    I -- Não --> J[Itens entram como PENDENTE]
    J --> K[/Cozinha vê cartão no KDS/]

    K --> L{Iniciar preparo?}
    L -- Sim --> M[Baixa automática de ingredientes<br/>se receita e flag ativos]
    M --> N[Item EM PREPARO]
    L -- Aguardando --> L
    N --> O[Item PRONTO]
    O --> P[Item ENTREGUE ao cliente]

    P --> Q[Solicitar pagamento]
    Q --> R[Registrar pagamento:<br/>dinheiro/pix/crédito/débito]
    R --> S{Soma ≥ total − 0,01?}
    S -- Não --> R
    S -- Sim --> T[PEDIDO PAGO]
    T --> U[Crédito na sessão de caixa<br/>transacional]
    T --> V[Mesa liberada]
    V --> W{Fim do expediente?}
    W -- Não --> D
    W -- Sim --> X[Fechar caixa:<br/>esperado × contado × diferença]
    X --> Y([Fim])

    H -. item pendente pode ser removido .-> H
    Q -. cliente pede pelo QR .-> Z[Cardápio digital adiciona<br/>itens ao pedido ativo]
    Z --> J
```

## 2. Cancelamento de pedido

```mermaid
flowchart TD
    A([Solicitação de cancelamento]) --> B{Pedido aberto?}
    B -- Não --> X1[409 — não cancelável]
    B -- Sim --> C{Possui pagamentos?}
    C -- Sim --> X2[409 — estorne os pagamentos antes]
    C -- Não --> D[status = cancelado<br/>fechadoEm = agora]
    D --> E[Liberar mesa<br/>DELETE_FIELD pedidoAtivoId/garcomId]
    E --> F([Pedido cancelado])
```

## 3. Movimentação de estoque manual

```mermaid
flowchart TD
    A([Operação de estoque]) --> B{Tipo}
    B -- Entrada --> C[saldo += qtd]
    B -- Saída --> D[saldo −= qtd]
    B -- Ajuste --> E[saldo = qtd informada]
    C --> F[Gravar movimentação com saldoApos<br/>transacional]
    D --> F
    E --> F
    F --> G{saldo ≤ mínimo?}
    G -- Sim --> H[(Alerta: badge no menu Estoque)]
    G -- Não --> I([Fim])
    H --> I
```

## 4. Fluxo do delivery

```mermaid
flowchart TD
    A([Pedido externo chega]) --> B[Registrar delivery<br/>ifood/goomer/whatsapp/proprio]
    B --> C[PENDING]
    C -->|confirmar| D[CONFIRMED]
    D -->|preparar| E[PREPARING]
    E -->|pronto| F[READY]
    F -->|entregar| G[DELIVERED]
    C -.->|cancelar| X[CANCELLED]
    D -.->|cancelar| X
    E -.->|cancelar| X
    F -.->|cancelar| X
    G --> H([Fim])
    X --> H
```

> Transições fora dessas setas são rejeitadas pelo backend (409) — ver RN-16.

## 5. Impressão (decisão em tempo real)

```mermaid
flowchart TD
    A([Usuário clica imprimir]) --> B{Web Bluetooth disponível?}
    B -- Não --> F[Fallback: janela print]
    B -- Sim --> C[requestDevice]
    C -- cancelado --> X1([Cancelado])
    C -- ok --> D{Service 18f0 + Char 2af1?}
    D -- Sim --> E[Enviar payload em chunks de 180B]
    D -- Não, varre serviços --> E2[Primeira característica write]
    E2 -- não encontrada --> F
    E --> G([Impresso via Bluetooth])
    F --> H([Impresso via janela])
```
