# Casos de Teste — PDV Lanchonete v2

Casos priorizados (P1–P4). Formato: pré-condições, passos, resultado esperado. Referências: RF/RNF do documento de requisitos; suíte API = casos automatizados.

## P1 — Dinheiro e integridade

### CT-001 · Abrir caixa duplicado (bloqueio transacional)
- **Pré:** sessão de caixa aberta existe.
- **Passos:** 1) `POST /api/caixa/abrir` com valor inicial.
- **Esperado:** 409 "Já existe uma sessão de caixa aberta". *(API)*

### CT-002 · Pedido em mesa ocupada (corrida)
- **Pré:** mesa com pedido ativo.
- **Passos:** `POST /api/pedidos?mesa_id=X` com 1 item válido.
- **Esperado:** 409 "Mesa X já está ocupada"; nenhum pedido criado. *(API)*

### CT-003 · Pagamento parcial até quitação
- **Pré:** pedido aberto total R$ 48,90; caixa aberto.
- **Passos:** 1) `POST /pagamentos/{id}` {pix, 20} → 201, status aberto. 2) {dinheiro, 28.90} → 201.
- **Esperado:** após passo 2: status=pago, fechadoEm preenchido; caixa soma totalVendas/totalRecebido/vendasPorFormaPagamento; mesa volta a livre sem pedidoAtivoId. *(API)*

### CT-004 · Pagamento acima do saldo
- **Pré:** restante R$ 8,90.
- **Passos:** `POST /pagamentos/{id}` {credito, 10}.
- **Esperado:** 422 informando restante R$ 8,90. *(API)*

### CT-005 · Pagamento minimalista (contrato B1)
- **Passos:** `POST /api/pagamentos/{id}` body exatamente `{tipo, valor}`.
- **Esperado:** **201** com id (`pag_*`) e criadoEm gerados no servidor. *(API/MAN)*

### CT-006 · Baixa automática ao iniciar preparo
- **Pré:** produto com receita (ex.: 0,15 kg pão/un), estoque pão=10 kg, flag ON.
- **Passos:** pedido com 2 un → KDS "Iniciar preparo".
- **Esperado:** saldo 9,70; movimentação `saida` com qtd 0,30 e pedidoId; item com baixadoEm. *(API)*

### CT-007 · Idempotência da baixa
- **Passos:** repetir PATCH para preparo (mesmo item já em preparo/baixado).
- **Esperado:** nova movimentação NÃO é criada; saldo inalterado.

### CT-008 · Flag OFF desliga a baixa
- **Passos:** PUT configurações `baixaEstoqueAutomatica:false`; novo item → preparo.
- **Esperado:** item vai a preparo; nenhuma movimentação/saldo alterado. *(API)*

## P2 — Segurança e papéis

### CT-010 · Sem token
- **Passos:** GET `/api/produtos` sem Authorization.
- **Esperado:** 401 "Token ausente ou malformado".

### CT-011 · Token expirado/inválido → 401 "Token inválido ou expirado". *(API)*

### CT-012 · Papel sem permissão
- **Pré:** login cozinha.
- **Passos:** POST `/api/pedidos`.
- **Esperado:** 403 "Acesso negado para o papel 'cozinha'".

### CT-013 · Cozinha muda status de item (permitido)
- **Esperado:** 200/201 conforme endpoint; fila atualiza.

### CT-014 · Somente admin cria gerente
- **Passos:** criar usuário papel=gerente autenticado como caixa.
- **Esperado:** 403. Como admin → 201 + claims gravados.

### CT-015 · Onboarding único
- **Passos:** 2× `POST /restaurantes/primeiro` (mesma conta; segunda com token refreshed).
- **Esperado:** 2ª chamada → 409 (claim ou marcador). *(MAN)*

## P3 — Operação

### CT-020 · Fluxo completo salão (roteiro R-01)
- Mesa livre→pedido→2 itens→preparo→pronto→entregue→pagamentos→pago→caixa→fechamento com diferença zero→relatório reflete venda. *(API E2E)*

### CT-021 · Cancelar pedido com pagamento
- **Esperado:** 409 "Pedido com pagamentos registrados — estorne-os antes".

### CT-022 · Cancelar pedido aberto sem pagamento
- **Esperado:** status cancelado + mesa liberada.

### CT-023 · Remover item não pendente → 409.

### CT-024 · Máquina de estados delivery
- Passos: pending→confirmed→preparing→ready→delivered; tentar delivered→confirmed.
- Esperado: sequência 200 e transição final 409. Plataforma "uber" na criação → **422**. *(API/MAN)*

### CT-025 · Movimentação de estoque ajuste/saída/entrada grava saldoApos correto (transacional). *(API)*

### CT-026 · Despesas: pagar e reabrir
- POST /{id}/pagar → pagoEm preenchido; PATCH ativoPago:false → pagoEm removido. *(API)*

### CT-027 · Relatório resumo
- Pré: vendas e despesas no período.
- Esperado: faturamento=ticket×pedidos; por hora no fuso SP; financeiro: despesasPorCategoria+totalDespesas+cmvEstimado+resultadoGerencial coerentes. *(API)*

## P4 — UX/integrações

### CT-030 Cardápio público: mesa livre cria pedido; ocupada adiciona (`adicionadoA`); cardápio off → 403; 13ª req/min → 429; 31 itens → 422. *(MAN/API público)*
### CT-031 QR da mesa abre `/m/{rid}/{mesaId}` funcional no celular.
### CT-032 Impressão: comanda Bluetooth ok; sem BT → janela print; cancelar seleção não imprime nada.
### CT-033 Tema por usuário: escolha persiste após logout/login em outro dispositivo; cada uid independente.
### CT-034 CSV: abrir no Excel pt-BR mantém colunas (separador ;) e acentuação (BOM).
### CT-035 PWA: build+preview instala; modo avião serve telas/cacheadas (leituras); escritas falham graciosamente.
### CT-036 Alertas de estoque: badge conta itens ≤ mínimo e some ao repor.
