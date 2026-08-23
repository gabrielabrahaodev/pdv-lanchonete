# Diagrama de Casos de Uso — PDV Lanchonete v2

> Renderizável em GitHub/GitLab/VS Code (Mermaid). A especificação textual detalhada está em `../01-planejamento/especificacao-casos-de-uso.md`.

```mermaid
flowchart LR
    subgraph Sistema PDV Lanchonete
        UC01([UC-01 Realizar login])
        UC02([UC-02 Criar primeiro restaurante])
        UC03([UC-03 Abrir pedido em mesa])
        UC04([UC-04 Gerenciar pedido/itens])
        UC05([UC-05 Preparar itens na cozinha KDS])
        UC06([UC-06 Registrar pagamento])
        UC07([UC-07 Quitar pedido])
        UC08([UC-08 Operar caixa abrir/sangria/fechar])
        UC09([UC-09 Gerenciar cadastros produtos/mesas])
        UC10([UC-10 Gerenciar estoque])
        UC11([UC-11 Registrar despesas/fornecedores])
        UC12([UC-12 Consultar relatórios/DRE])
        UC13([UC-13 Pedir pelo cardápio digital])
        UC14([UC-14 Registrar delivery])
        UC15([UC-15 Configurar sistema/usuários])

        R1{{RN Baixa automática<br/>de estoque}}
        R2{{RN Crédito no caixa +<br/>liberação da mesa}}
        R3{{RN Preço resolvido<br/>no servidor}}
    end

    Admin([👤 Administrador/Gerente])
    Caixa([👤 Operador de Caixa])
    Garcom([👤 Garçom])
    Cozinha([👤 Cozinheiro])
    Cliente([👤 Cliente sem login])
    Ext([🛵 Plataforma Delivery])

    %% Relações principais
    Admin --- UC01
    Admin --- UC09
    Admin --- UC10
    Admin --- UC11
    Admin --- UC12
    Admin --- UC15
    Admin --- UC08

    Caixa --- UC01
    Caixa --- UC03
    Caixa --- UC04
    Caixa --- UC06
    Caixa --- UC08
    Caixa --- UC12
    Caixa --- UC14

    Garcom --- UC01
    Garcom --- UC03
    Garcom --- UC04
    Garcom --- UC14

    Cozinha --- UC01
    Cozinha --- UC05

    Cliente --- UC13

    Ext -. registra manualmente .-> UC14

    %% include/extend
    UC03 -. include .-> R3
    UC04 -. include .-> R3
    UC13 -. include .-> R3
    UC05 -. extend .-> R1
    UC06 -. extend .-> UC07
    UC07 -. include .-> R2
```

## Observações

- **Generalização de atores:** `Administrador` herda as capacidades de todos os demais papéis (matriz RN-02).
- **«include»** — preço sempre do servidor faz parte de qualquer lançamento de item (local, digital ou delivery).
- **«extend»** — a quitação (UC-07) é um desdobramento automático do pagamento (UC-06) quando o saldo cobre o total; a baixa de estoque (R1) dispara apenas na transição `pendente → preparo` e se a receita existir.
