# Documento de Treinamento — PDV Lanchonete v2

Plano e material de treinamento para a equipe do restaurante. Formato: sessões curtas (30–45 min) com prática guiada no ambiente de teste.

---

## 1. Programa geral

| Sessão | Público | Duração | Objetivo |
|---|---|---|---|
| T-1 | Todos | 30 min | Visão geral, login, papéis, tema, navegação |
| T-2 | Caixa/Garçom | 45 min | Ciclo da venda: mesa→pedido→pagamento→caixa |
| T-3 | Cozinha | 20 min | KDS: fila, status, impressão de comanda |
| T-4 | Admin/Gerente | 45 min | Cadastros, estoque/receitas, financeiro, relatórios, usuários/config |
| T-5 | Todos (D+7) | 30 min | Dúvidas + casos reais da primeira semana |

## 2. T-1 — Visão geral (todos)

**Conteúdo:**
1. O que o sistema resolve (pedido → cozinha → pagamento → caixa → relatório).
2. Login com e-mail/senha; o que fazer se esquecer a senha (admin reseta em Configurações → Usuários).
3. Menu lateral; badge vermelho do estoque = itens abaixo do mínimo.
4. Tema claro/escuro é individual — configurar o seu.
5. Instalar como aplicativo (PWA) no tablet/celular.
6. Regra de ouro: **cada um usa sua conta** (as ações ficam registradas com seu nome).

**Prática:** cada trainee loga, troca o tema e instala o PWA.

## 3. T-2 — Caixa e garçom

**Conteúdo + demonstração:**
1. Abrir caixa com fundo de troco; por que só um caixa aberto.
2. Abrir pedido na mesa livre; adicionar itens com variação/observação.
3. Diferença entre remover item pendente ✖ e cancelar item/pedido.
4. Receber pagamento parcial; calcular troco no dinheiro; quitar.
5. O que acontece ao quitar: mesa libera sozinha, venda entra no caixa.
6. Sangria/suprimento; fechamento com contagem e diferença.

**Prática:** duplas simulam uma venda completa (Roteiro R-01 simplificado).

**Erros comuns:**
- "Mesa ocupada" = alguém já abriu pedido; abra pelo cartão amarelo.
- Valor de pagamento maior que o restante é bloqueado de propósito.

## 4. T-3 — Cozinha

**Conteúdo:**
1. As 3 colunas e o auto-refresh; não precisa apertar F5.
2. Fluxo dos botões: Iniciar preparo → Marcar pronto → Entregar.
3. Ao "Iniciar preparo" o sistema **baixa os ingredientes automaticamente** (quando o produto tem receita) — por isso a ordem importa.
4. 🖨 Imprimir comanda; o que fazer se a impressora falhar (o sistema oferece impressão pela janela).

**Prática:** processar pedidos criados pela turma do T-2.

## 5. T-4 — Administrador/Gerente

**Conteúdo:**
1. Produtos: preço-fonte da verdade; variações; **receita por 1 unidade** (base da baixa automática); inativo não aparece para vender.
2. Mesas: criar, reservar/inativar, gerar QR do cardápio.
3. Estoque: entrada (compras), saída, ajuste; mínimo dispara alerta; saldo pode ficar negativo (sistema não trava produção).
4. Financeiro: fornecedores; despesas por categoria e competência; marcar pago/reabrir; despesa NÃO mexe no caixa.
5. Relatórios: período, vendas por hora/forma, top produtos, resultado gerencial; exportar CSV.
6. Usuários: criar conta com papel correto; apenas admin cria gerentes/manipula admins; reset de senha.
7. Configurações: baixa automática ON/OFF; cardápio digital ON/OFF; teste de impressora; fuso/moeda.

**Prática:** cadastrar produto com receita real do cardápio da casa; lançar 2 despesas; gerar relatório do dia.

## 6. T-5 — Follow-up (após 1 semana)

Revisão dos fechamentos de caixa da semana, dúvidas de lançamento (ajustes × saídas), alinhamento sobre cancelamentos e estornos, coleta de melhorias.

## 7. Materiais de apoio

- Manual do usuário (`manual-usuario.md`) — entregar impresso/PDF.
- Cartão rápido de bolso do caixa:
```
MESA LIVRE → toque → monte pedido → CONFIRMAR
PAGAR → forma → valor → (troco) → REGISTRAR
QUITOU? mesa libera + vai pro caixa
COZINHA: Iniciar preparo ▸ Pronto ▸ Entregar
FECHOU O DIA? Sessão de caixa → Fechar (informar contagem)
```

## 8. Avaliação de aprendizado

Checklist prático individual (aprovar/reprovar):
- [ ] Abre pedido com observação e variação
- [ ] Recebe pagamento misto (PIX + dinheiro) e informa troco
- [ ] Cozinha avança status até entregue
- [ ] Gerente lança despesa e marca como paga
- [ ] Cada um ajustou seu tema e instalou o app
