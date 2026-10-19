---
title: Índice de Regras de Negócio
tags: [regras, negocio, indice]
---

# Índice de Regras de Negócio

Este índice contém as regras RN documentadas em `docs/01-planejamento/documento-regras-negocio.md`, conferidas contra os routers/services da branch analisada. Onde existe divergência, ela é marcada em [[Auditoria/Discrepâncias e Riscos]].

| ID | Regra | Referência |
|---|---|---|
| RN-01 | Todo dado autenticado é isolado por `restaurantId` do custom claim; cliente não pode escolher tenant arbitrário na API. | [[Regras de Negócio/Acesso, Tenancy e Papéis]] |
| RN-02 | Papéis e guards por módulo; admin tem restrições adicionais sobre contas admin. | [[Regras de Negócio/Acesso, Tenancy e Papéis]] |
| RN-03 | Onboarding por convite único, válido, não expirado e não revogado; consumo transacional; auto-cura de retry parcial. | [[Regras de Negócio/Onboarding e Convites]] |
| RN-04 | Uma mesa não aceita dois pedidos ativos; criação do pedido e ocupação da mesa são transacionais. | [[Regras de Negócio/Mesas, Pedidos e Cozinha]] |
| RN-05 | Número de mesa único; mesa ocupada não pode ser removida. | [[Regras de Negócio/Mesas, Pedidos e Cozinha]] |
| RN-06 | Estados de item: pendente, preparo, pronto, entregue, cancelado; só item pendente pode ser removido fisicamente; pedido só cancela aberto e sem pagamentos. | [[Regras de Negócio/Mesas, Pedidos e Cozinha]] |
| RN-07 | Consumo por ficha técnica e quantidade pedida; baixa ao iniciar preparo; item sem preparo é marcado entregue e baixa na criação. | [[Regras de Negócio/Estoque e Baixa Automática]] |
| RN-08 | `baixadoEm` evita baixa duplicada; cancelar após a baixa não estorna ingrediente automaticamente. | [[Regras de Negócio/Estoque e Baixa Automática]] |
| RN-09 | Preço e variação são resolvidos no servidor; produto/variação inativo não pode ser vendido. | [[Regras de Negócio/Produtos e Categorias]] |
| RN-10 | Total = soma de quantidade × preço unitário dos itens não cancelados, arredondado a 2 casas. | [[Regras de Negócio/Mesas, Pedidos e Cozinha]] |
| RN-11 | Pagamentos por dinheiro, pix, credito ou debito; valor positivo; não excede restante; quitação muda status e data. | [[Regras de Negócio/Pagamentos e Caixa]] |
| RN-12 | Na quitação, sessão recebe venda e mesa é liberada; sem sessão aberta, pedido ainda pode ser quitado. | [[Regras de Negócio/Pagamentos e Caixa]] |
| RN-13 | Uma sessão aberta por tenant; esperado = inicial + recebido + suprimentos − sangrias; despesas não movimentam caixa. | [[Regras de Negócio/Pagamentos e Caixa]] |
| RN-14 | Entrada soma, saída subtrai, ajuste substitui saldo; registro e saldo são transacionais e guardam saldo após movimento. | [[Regras de Negócio/Estoque e Baixa Automática]] |
| RN-15 | Alerta quando saldo ≤ mínimo. | [[Regras de Negócio/Estoque e Baixa Automática]] |
| RN-16 | Delivery tem transições restritas e timestamps de confirmação/pronto/entrega; estados entregues/cancelados são terminais. | [[Regras de Negócio/Delivery]] |
| RN-17 | Despesas são somadas por competência `data`, independente do status pago/pendente. Categorias são fixas. | [[Regras de Negócio/Financeiro, CMV e Resultado]] |
| RN-18 | Resultado gerencial = faturamento − totalDespesas; CMV estimado é informativo para evitar dupla contagem de compras lançadas como despesa. | [[Regras de Negócio/Financeiro, CMV e Resultado]] |
| RN-19 | Pagar grava `pagoEm`; reabrir remove `pagoEm` com `DELETE_FIELD`; pago/reabrir não alteram agregado por competência. | [[Regras de Negócio/Financeiro, CMV e Resultado]] |
| RN-20 | Cardápio público depende de `cardapioDigitalAtivo` e limita requisições por IP. | [[Regras de Negócio/Cardápio Digital, QR e Imagens]] |
| RN-21 | O documento de regra descreve pedidos via QR, mas código atual retorna 410 nessa rota; cardápio deve ser considerado leitura-only até decisão/alteração. | [[Regras de Negócio/Cardápio Digital, QR e Imagens]]; [[Auditoria/Discrepâncias e Riscos]] |
| RN-22 | Relatório considera pedido pago na janela por `fechadoEm`; fuso configurável; top produtos/categorias limitados a dez. | [[Regras de Negócio/Relatórios e Agregados]] |
| RN-23 | Fuso vem de `settings.timezone` com default `America/Sao_Paulo`; precisa de tzdata. | [[Regras de Negócio/Relatórios e Agregados]] |
| RN-24 | Tema claro/escuro é preferência individual do usuário e pode ser alterado por qualquer papel para si mesmo. | [[Regras de Negócio/Usuários e Configurações]] |
| RN-25 | Plataforma é separada de tenants; convites são administrados somente por UIDs globais autorizados. | [[Regras de Negócio/Plataforma e Administração Global]] |
| RN-26 | Imagem fica em documento separado por produto; limites de payload e tipos MIME; exclusão do produto remove imagem. | [[Regras de Negócio/Cardápio Digital, QR e Imagens]] |

## Invariantes que devem guiar mudanças

1. Backend é a autoridade para preço, pagamentos, status crítico e mutações de estoque.
2. Nunca aceitar `restaurantId` enviado pelo frontend como única fonte de autorização.
3. Em transação Firestore, fazer todas as leituras antes das escritas.
4. Eventos repetidos não podem duplicar faturamento, pagamento ou consumo.
5. Alterar uma regra exige atualizar este vault, docs do repo e teste de regressão.
6. Não inferir que comentário/doc está correto se o comportamento do código contradiz a especificação.
