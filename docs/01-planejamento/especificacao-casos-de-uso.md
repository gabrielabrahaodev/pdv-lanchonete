# Especificação de Casos de Uso — PDV Lanchonete v2

Especificação textual dos casos de uso principais. Os diagramas estão em `../02-modelagem/diagrama-casos-de-uso.md`.

**Atores:**
- **Atendente/Operador de Caixa** (papel `caixa`) — também cobre `admin` e `gerente` (superconjuntos de permissão).
- **Garçom** (`garcom`)
- **Cozinheiro** (`cozinha`)
- **Administrador/Gerente** (`admin`, `gerente`)
- **Cliente** (não autenticado — cardápio digital)
- **Sistema Externo de Delivery** (iFood/Goomer/WhatsApp — registro manual hoje)
- **Dono da Plataforma** (sem tenant — gera/revoga convites em `/plataforma`)

---

## UC-01 — Realizar login

| Campo | Descrição |
|---|---|
| Ator principal | Qualquer usuário com conta |
| Pré-condições | Conta criada no Firebase Auth |
| Fluxo básico | 1. Usuário acessa `/login`. 2. Informa e-mail/senha. 3. Firebase Auth valida. 4. App busca `GET /auth/me`. 5. Se possui `restaurantId` → vai para `/caixa`; senão → `/select-restaurant` (onboarding). |
| Fluxos alternativos | A1: credenciais inválidas → mensagem de erro, permanece na tela. A2: usuário sem restaurante → tela de criação do estabelecimento (UC-02). |
| Pós-condições | ID token ativo; contexto do usuário carregado. |

## UC-02 — Criar primeiro restaurante (onboarding por convite)

| Campo | Descrição |
|---|---|
| Ator principal | Usuário sem claim `restaurantId`, com link de convite do dono da plataforma |
| Pré-condições | Autenticado; convite válido (`?t=CÓDIGO`, uso único, expira 7 dias) |
| Fluxo básico | 1. Abrir o link `/select-restaurant?t=CÓDIGO`. 2. Informar nome do restaurante e quantidade de mesas (chips 6·12·24 ou outro). 3. `POST /api/restaurantes/primeiro {token, nome, quantidadeMesas}`. 4. Sistema valida o convite e, numa ÚNICA transação, cria doc raiz + configurações + coleções + mesas + doc admin, marca o marcador completo e consome o convite (`usadoEm`). 5. Define claims `{restaurantId, papel:"admin"}`. 6. Frontend força refresh do token e recarrega `/auth/me`. |
| Fluxos alternativos | A1: já possui restaurante (claim válido) → 409. A2: retry com marcador completo e claim ausente → auto-cura: reemite claims e devolve o MESMO restaurante. A3: convite ausente/expirado/usado/revogado → 403. A4: dono da plataforma cria sem convite; bootstrap do zero semeia o primeiro dono. |
| Pós-condições | Restaurante operacional; usuário é `admin`; convite consumido. |

## UC-03 — Abrir pedido em mesa

| Campo | Descrição |
|---|---|
| Ator principal | Operador de caixa / Garçom |
| Pré-condições | Autenticado; mesa existe e não está `ocupada` |
| Fluxo básico | 1. Em **Caixa**, clicar no cartão da mesa livre. 2. Tela **Novo Pedido**: escolher produtos por categoria (com variação e observação opcional) e quantidade. 3. Confirmar → `POST /api/pedidos?mesa_id=...&tipo=local`. 4. Servidor resolve preços, grava pedido `aberto` e ocupa a mesa **na mesma transação**. |
| Fluxos alternativos | A1: mesa ocupada entre leitura e commit → 409 "Mesa X já está ocupada". A2: produto inativo/variação inexistente → 404/409. |
| Pós-condições | Pedido `aberto`; mesa `ocupada` com `pedidoAtivoId`; itens `pendente` visíveis no KDS. |

## UC-04 — Gerenciar pedido (adicionar/remover itens)

| Campo | Descrição |
|---|---|
| Ator principal | Operador de caixa / Garçom |
| Pré-condições | Pedido aberto |
| Fluxo básico | 1. Abrir detalhe da mesa ocupada. 2. Adicionar item (`POST /pedidos/{id}/itens`) ou remover item pendente (`DELETE .../itens/{itemId}`). 3. Total recalculado no servidor (itens não cancelados). |
| Fluxos alternativos | A1: pedido não aberto → 409. A2: remover item já em preparo/pronto → 409 "só pendentes". |
| Pós-condições | Itens e total atualizados. |

## UC-05 — Preparar itens na cozinha (KDS)

| Campo | Descrição |
|---|---|
| Ator principal | Cozinheiro (papéis permitidos: admin/gerente/caixa/cozinha) |
| Pré-condições | Existem itens `pendente` em pedidos abertos |
| Fluxo básico | 1. Abrir **Cozinha (KDS)** — fila em tempo real (snapshot filtrado; banner se cair). 2. UM cartão POR MESA agrupando todos os itens do pedido (com variação/observação; itens sem preparo nem aparecem — nascem `entregue`). 3. Botão avança os itens do cartão em bloco via endpoint BULK (`PATCH /api/cozinha/pedidos/{pedido}/itens/status {itemIds[], novoStatus}`): `Iniciar preparo` → `Marcar pronto` → `Entregar`. 4. Opcional: 🖨 imprime a comanda do cartão (Bluetooth/fallback). |
| Regras associadas | RN-07 (baixa automática de ingredientes ao iniciar preparo), RN-08 (idempotência via `baixadoEm`). |
| Fluxos alternativos | A1: status inválido → 422. A2: produto removido/sem receita → preparo segue normalmente, sem baixa. |
| Pós-condições | Itens avançam de coluna; estoque debitado (quando aplicável). |

## UC-06 — Registrar pagamento

| Campo | Descrição |
|---|---|
| Ator principal | Operador de caixa |
| Pré-condições | Pedido aberto; sessão de caixa idealmente aberta |
| Fluxo básico | 1. Na mesa ocupada, abrir **Pagamento**. 2. Escolher forma (dinheiro/PIX/crédito/débito), informar valor (e recebido/troco no dinheiro). 3. `POST /api/pagamentos/{pedidoId}` `{tipo, valor}` → 201. 4. Repetir para pagamentos parciais se necessário. |
| Fluxos alternativos | A1: valor excede saldo → 422 com restante. A2: pedido não aberto → 409. A3: quitação → ver UC-07. |
| Pós-condições | Pagamentos registrados; ao quitar: pedido `pago`. |

## UC-07 — Quitar pedido (efeitos automáticos)

| Campo | Descrição |
|---|---|
| Gatilho | Soma dos pagamentos ≥ total − R$0,01 |
| Fluxo do sistema | 1. Pedido → `status=pago`, `fechadoEm`. 2. Venda creditada transacionalmente na sessão de caixa aberta (totalVendas, totalRecebido, vendasPorFormaPagamento, quantidadePorProduto). 3. Mesa liberada (`livre`, campos limpos com DELETE_FIELD). 4. Frontend oferece/imprime recibo (quando quitado) e volta ao mapa de mesas. |
| Pós-condições | Ciclo venda encerrado; relatórios refletem a venda. |

## UC-08 — Operar caixa (abrir/movimentar/fechar)

| Campo | Descrição |
|---|---|
| Ator principal | Operador de caixa |
| Fluxo básico | **Abrir**: informa fundo de troco → sessão `aberto` (transacional; 409 se já houver aberta). **Suprimento/Sangria**: valor > 0 com observação opcional. **Fechar**: informa valor contado (opcional) → resumo com esperado = inicial+recebido+suprimentos−sangrias e diferença. |
| Consulta relacionada | Fechamento histórico em Relatórios → Fechamento de Caixa (lista sessões). |
| Pós-condições | Sessão `fechado` com auditoria completa. |

## UC-09 — Gerenciar cadastros (categorias/produtos/mesas)

| Campo | Descrição |
|---|---|
| Ator principal | Administrador/Gerente/Caixa |
| Fluxo básico | CRUD completo via telas Produtos (formulário com receita de ingredientes, variações e FOTO local comprimida no cliente), Categorias (tela própria com ícone/ordem/ativo; exclusão bloqueada com produto vinculado) e Mesas (nova mesa; QR Code por mesa). Listagens exibem thumbnail quando o produto tem imagem. |
| Regras associadas | RN-05 (número de mesa único), RN-10 (receita por 1 unidade), RN-26 (imagem). |
| Pós-condições | Cadastros refletidos imediatamente nos pedidos e cardápios. |

## UC-10 — Gerenciar estoque

| Campo | Descrição |
|---|---|
| Ator principal | Administrador/Gerente |
| Fluxo básico | Criar/editar itens (unidade, mínimo, custo médio); registrar movimentação `entrada`/`saida`/`ajuste` (transacional, registra `saldoApos`); consultar movimentações; exportar CSV. Badge de alertas no menu quando `quantidadeAtual ≤ minimo`. |
| Pós-condições | Saldo atualizado e auditável. |

## UC-11 — Registrar despesa e fornecedor

| Campo | Descrição |
|---|---|
| Ator principal | Administrador/Gerente/Caixa |
| Fluxo básico | Cadastrar fornecedor; lançar despesa (categoria insumo/folha/conta_fixa/outra, competência, vencimento); marcar como paga (`/{id}/pagar`) ou reabrir (`ativoPago:false`); filtrar/exportar CSV. |
| Regras associadas | RN-12 (despesas não mexem no caixa), RN-13 (competência pela data). |

## UC-12 — Consultar relatórios

| Campo | Descrição |
|---|---|
| Ator principal | Administrador/Gerente/Caixa |
| Fluxo básico | Informar período → resumo com faturamento, ticket médio, vendas por hora (gráfico), por forma de pagamento, top produtos/categorias, bloco financeiro (despesas por categoria, CMV estimado, resultado gerencial). Exportação CSV. |

## UC-13 — Pedir pelo cardápio digital (Cliente)

| Campo | Descrição |
|---|---|
| Ator principal | Cliente na mesa (sem login) |
| Pré-condições | Cardápio digital ativo; QR da mesa válido |
| Fluxo básico | 1. Escanear QR → `/m/{rid}/{mesaId}`. 2. Navegar categorias/produtos, montar carrinho (qtd, variação, obs). 3. Enviar → `POST /api/publico/{rid}/mesas/{mesa}/pedido`. 4. Mesa livre → cria pedido; mesa ocupada → adiciona ao pedido ativo. 5. Confirmação visual. |
| Fluxos alternativos | A1: cardápio off → 403. A2: mais de 12 req/min → 429. A3: mesa inativa → 409. |
| Pós-condições | Itens entram `pendente` no fluxo normal (UC-05). |

## UC-14 — Registrar delivery

| Campo | Descrição |
|---|---|
| Ator principal | Operador de caixa / Garçom (registro manual de plataformas) |
| Fluxo básico | Novo delivery (plataforma ifood/goomer/whatsapp/proprio, cliente, itens) → status avança conforme máquina de estados (confirmar→preparar→pronto→entregar; cancelar até entregar). |

## UC-15 — Configurar o sistema

| Campo | Descrição |
|---|---|
| Ator principal | Administrador/Gerente |
| Fluxo básico | Editar configurações (nome, moeda, timezone, impressora, baixa automática de estoque, cardápio digital); testar impressora; gerenciar usuários/papéis (admin/gerente); cada usuário define seu tema. |

## UC-16 — Gerenciar convites da plataforma

| Campo | Descrição |
|---|---|
| Ator principal | Dono da Plataforma (guard `sistema/global.donoUids`) |
| Pré-condições | UID listado como dono; sem tenant |
| Fluxo básico | 1. Logar e cair direto no console `/plataforma`. 2. **Gerar convite** → link copiável `…/select-restaurant?t=CÓDIGO` (enviado manualmente ao novo lojista). 3. Acompanhar lista com status computado (ativa/usada/expirada/revogada). 4. Revogar convite indesejado (`DELETE /api/sistema/convites/{token}`). |
| Fluxos alternativos | A1: admin de tenant tenta gerar convite → 403 (separação de planos). A2: convite expira em 7 dias automaticamente. |
| Pós-condições | Novo lojista consegue criar seu restaurante pelo link (UC-02). |
