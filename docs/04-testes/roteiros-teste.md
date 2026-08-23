# Roteiros de Teste — PDV Lanchonete v2

Sequências de execução ponta a ponta combinando os casos de teste (`casos-teste.md`). Cada roteiro indica ambiente, atores e evidências a coletar.

## Roteiro R-01 — Ciclo completo de venda no salão (crítico)

**Ambiente:** backend+frontend rodando; caixa FECHADO; estoque com pão 10 kg; produto "X-Burger" com receita 0,15 kg/un e preço conhecido.
**Atores:** operador caixa (admin), cozinha.

| # | Ação | Resultado esperado | Evidência |
|---|---|---|---|
| 1 | Login admin@restaurante.com | vai a /caixa | screenshot |
| 2 | Abrir caixa (fundo R$ 200) | card "Caixa aberto" aparece | — |
| 3 | Mesa 1 → Novo pedido: 2× X-Burger (obs "sem cebola") + 2× bebida | total = soma correta; mesa fica 🟡 ocupada | print pedido |
| 4 | Conferir Firestore/API: itens `pendente` | presentes na fila do KDS | API GET /cozinha/fila |
| 5 | Cozinha: Iniciar preparo dos X-Burgers | saldo pão −0,30 kg; movimentação saida c/ pedidoId; item `preparo` | print estoque/movs |
| 6 | Marcar pronto → Entregar | cartões migram de coluna até sumirem da fila | — |
| 7 | Pagamento: PIX 20,00 | restante atualiza; pedido continua aberto | print |
| 8 | Pagamento: dinheiro 28,90 (recebido 30) | quita; recibo oferecido; mesa volta livre; caixa credita venda | print recibo+caixa |
| 9 | Sangria 50,00 · Suprimento 20,00 | totais refletem | — |
| 10 | Fechar caixa com contagem exata | diferença 0,00 no resumo | print fechamento |
| 11 | Relatórios do dia | faturamento inclui a venda; formas de pagamento corretas | CSV exportado |

**Critério de aprovação:** todos os passos sem erro; números batendo em caixa, relatório e estoque.

## Roteiro R-02 — Cardápio digital (cliente)

| # | Ação | Esperado |
|---|---|---|
| 1 | Mesas → QR da Mesa 3 → baixar PNG | PNG legível com URL /m/{rid}/mesa_03 |
| 2 | Celular: escanear e navegar | categorias/produtos ativos, sem login |
| 3 | Adicionar itens + observação, enviar | tela de confirmação com nº do pedido |
| 4 | No PDV: mesa 3 ocupada com pedido novo (usuário cardapio_digital) | itens visíveis no KDS |
| 5 | Repetir envio com mesa ocupada | itens somam ao MESMO pedido (adicionadoA) |
| 6 | Configurações: desligar cardápio digital; recarregar página pública | 403 "Cardápio digital desativado" |
| 7 | Reativar; disparar >12 requisições/min | 429 amigável |

## Roteiro R-03 — Estoque e alertas

| # | Ação | Esperado |
|---|---|---|
| 1 | Criar item "Teste QA" (un., mín. 10, custo 5,00) | aparece na lista |
| 2 | Entrada 8 | saldo 8; badge de alertas incrementa (8≤10) |
| 3 | Saída 15 | saldo −7 (permitido); movimentação registra saldoApos |
| 4 | Ajuste 25 | saldo 25; badge some |
| 5 | Exportar CSV | colunas/acentos ok no Excel |

## Roteiro R-04 — Papéis e permissões

Para cada usuário do seed (gerente, caixa, garcom, cozinha): logar e verificar menu visível × tentativas diretas de URL/ação fora do papel.
- garçom: cria pedido; NÃO vê Financeiro/Configurações; tentativa direta → 403 tratada na UI.
- cozinha: opera KDS; não cria pedidos.
- caixa: tudo operacional, sem gestão de usuários/estoque/config.

## Roteiro R-05 — Delivery

Criar delivery whatsapp → confirmar → preparar → pronto → entregar; conferir timestamps; tentar transição após entregue (409); criar com plataforma inválida (422).

## Roteiro R-06 — Impressão

Com impressora Bluetooth pareada: KDS 🖨 (comanda), pagamento quitado (recibo), Configurações (teste). Sem BT disponível: repetir e validar fallback janela print. Cancelar o diálogo do navegador não deve disparar fallback.

## Roteiro R-07 — PWA/offline

`npm run build && npm run preview` → instalar pelo ícone do navegador → navegar por telas já visitadas → modo avião: leituras servidas do cache; escrita exibe erro claro; voltar a online retoma polling.

## Evidências e rastreabilidade

Cada roteiro executado gera registro no `relatorios-teste.md` (data, executor, resultado, defeitos abertos) e alimenta o documento de homologação.
