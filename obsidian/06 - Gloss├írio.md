---
title: Glossário
tags: [glossario, dominio]
---

# Glossário

| Termo | Significado no projeto |
|---|---|
| Tenant / `restaurantId` | Restaurante que isola dados e contexto do usuário. |
| Dono da plataforma | UID presente em `sistema/global.donoUids[]`; não pertence a um restaurante. |
| Pedido ativo | Pedido de status `aberto` associado à mesa via `pedidoAtivoId`. |
| Quitação | Momento em que pagamentos acumulados atingem o total dentro da tolerância. |
| Sessão de caixa | Turno de caixa com fundo, recebimentos, suprimentos, sangrias e fechamento. |
| Receita/ficha técnica | Lista de ingredientes (`itemId`, `qtd`) consumidos por unidade de produto. Não confundir com receita financeira. |
| Baixa automática | Saída de estoque vinculada à preparação/registro do item, conforme `baixaEstoqueAutomatica`. |
| KDS | Kitchen Display System: fila da cozinha por mesa/pedido. |
| CMV estimado | Saídas de estoque associadas a pedido × custo médio atual. Indicador, não custo contábil histórico exato. |
| Competência | Data pela qual relatório classifica despesa (`data`), independentemente de paga/pendente. |
| Resultado gerencial | `faturamento - totalDespesas`, no modelo atual. |
| Agregado | Documento pré-computado diário ou mensal para relatórios, atualizado por incrementos. |
| Backfill | Reconstrução dos agregados a partir do histórico já existente. Há serviço/CLI, apesar de comentário antigo dizer “SEM backfill”. |
| `DELETE_FIELD` | Transformação Firestore para remover campo (não apenas gravar `null`). Usada para limpar referências e `pagoEm`. |
| ID token | Token Firebase Auth enviado no bearer header e verificado pelo backend. |
| PWA | Aplicação instalável no navegador, com service worker e cache do app shell. |
| ID de idempotência | Chave opcional de requisição para impedir repetição de pagamento; eventos agregados também usam marcadores determinísticos. |
