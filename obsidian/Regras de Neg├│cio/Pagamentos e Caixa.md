---
title: Pagamentos e Caixa
tags: [regras, pagamentos, financeiro, caixa]
---

# Pagamentos e Caixa

## Pagamento do pedido

- Tipos aceitos: `dinheiro`, `pix`, `credito`, `debito`.
- Valor deve ser maior que zero.
- Pode haver vários pagamentos parciais no pedido aberto.
- O saldo é recalculado dentro da transação a partir dos pagamentos já gravados; pagamento que excede restante mais tolerância → 422.
- Tolerância está definida em `TOLERANCIA = 0.009`; documento de regra/usuário descreve o arredondamento como aproximadamente R$ 0,01.
- Quitação: total pago acumulado alcança total do pedido, dentro da tolerância; grava status `pago` e `fechadoEm`.
- Ao quitar: agrega venda diária/mensal, credita sessão de caixa aberta (se existe) e libera mesa na mesma operação transacional do fluxo principal.
- Pedido sem sessão de caixa aberta ainda pode ser quitado, mas não soma na sessão inexistente.
- `X-Idempotency-Key` é opcional; repetição da mesma chave deve retornar conflito e não duplicar pagamento. Eventos de agregação de venda também têm marcador determinístico `venda:{pedidoId}`.

## Sessão de caixa

- Apenas uma sessão `aberto` por tenant, protegida por transação.
- Campos centrais: fundo inicial, totalVendas, totalRecebido, suprimentos, sangrias, vendas por forma e quantidades por produto.
- Suprimento/sangria exigem valor positivo e gravam observação, tipo, usuário e timestamp.
- Esperado em caixa = valorInicial + totalRecebido + suprimentos − sangrias.
- Fechamento persiste esperado, valor contado (opcional) e diferença = contado − esperado (se informado), e muda status para `fechado`.
- Despesas do módulo financeiro não alteram a sessão de caixa (decisão atual). Não confundir resultado por competência com saldo contado da gaveta.

## Integridade

- Pagamento é transacional e faz todas as leituras antes das escritas.
- Duas tentativas concorrentes precisam revalidar saldo na transação; a segunda não pode quitar além do total.
- Uma venda quitada deve gerar só um evento de agregação.

Fontes: `backend/app/services/caixa_service.py`, `mesas_service.py`, `agregados_service.py`, routers `pagamentos.py`/`caixa.py`.
