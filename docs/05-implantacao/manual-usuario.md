# Manual do Usuário — PDV Lanchonete v2

Guia do dia a dia para **administrador, gerente, caixa, garçom e cozinha**. Acesso pelo navegador (Chrome/Edge recomendado). O app pode ser instalado como aplicativo (PWA) pelo menu do navegador.

---

## 1. Entrar no sistema

1. Abra o endereço do sistema e informe **e-mail** e **senha**.
2. Se for seu primeiro acesso sem restaurante, você precisa do **link de convite** enviado pelo dono da plataforma (`…/select-restaurant?t=CÓDIGO`). Pelo link, informe o **nome da lanchonete** e a **quantidade de mesas** (chips rápidos: 6 · 12 · 24 ou outro). Você se torna administrador automaticamente.
3. Para sair, use **Sair** no rodapé do menu lateral.

> Sem convite válido a criação é bloqueada — solicite o link ao dono da plataforma.

> Seu tema (claro/escuro) é individual: escolha em **Configurações → Aparência**.

## 2. Caixa — o coração do sistema

A tela inicial (**Caixa**) mostra todas as mesas e o resumo do caixa aberto.

### Abrir e fechar o caixa
- **Abrir caixa**: botão no topo; informe o fundo de troco. Só existe um caixa aberto por vez.
- **Fechar**: em *Sessão de caixa* (ou Relatórios → Fechamento), use **Fechar caixa** informando quanto há no gaveta. O sistema mostra o **esperado** (fundo + recebido + suprimentos − sangrias) e a **diferença**.
- **Suprimento/Sangria**: entradas/saídas de dinheiro com observação.

### Abrir pedido
1. Clique numa mesa **livre**.
2. Escolha produtos pelas categorias; toque em **+ Add**. Use variações (ex.: tamanho) e observações ("sem cebola").
3. Confirme. A mesa fica 🟡 **ocupada** e os itens vão para a cozinha como *Pendente*.

### Gerenciar o pedido
- Mesa ocupada abre o **pedido em andamento**: adicione mais itens a qualquer momento.
- Itens **pendentes** podem ser removidos (✖). Itens já em preparo/prontos não.
- **Cancelar pedido inteiro**: só quando está aberto e sem pagamentos.

### Receber pagamento
1. No pedido, clique em **Ir para pagamento**.
2. Escolha a forma: 💵 Dinheiro · ⚡ PIX · 💳 Crédito · 🏦 Débito.
3. Informe o **valor**. Em dinheiro, pode informar o valor recebido para o sistema calcular o **troco**.
4. Pode receber em partes (ex.: metade PIX, metade dinheiro). Quando a soma cobrir o total, o pedido fica **pago**, a mesa libera sozinha e a venda entra no caixa.
5. Ao quitar, aparece a opção de imprimir o **recibo**.

## 3. Cozinha (KDS)

Tela escura com 3 colunas: **⏳ Pendente · 🔥 Em preparo · 🔔 Pronto**. Atualiza sozinha em tempo real (só itens que precisam de preparo aparecem).
- **Iniciar preparo** → move para preparo *(e baixa os ingredientes da receita do estoque, se configurado)*.
- **Marcar pronto** → move para pronto.
- **Entregar** → finaliza o item.
- 🖨 imprime a comanda do cartão.

## 4. Produtos e Categorias

- Lista com busca/filtro por categoria; **Novo produto** abre o formulário.
- Campos principais: nome, categoria, preço, ativo, estoque mínimo.
- 📷 **Foto**: selecione um arquivo no formulário (o app comprime automaticamente); a foto aparece nas listagens e no cardápio QR.
- **Variações**: opções com preço adicional (ex.: "Extra bacon +R$5").
- **Receita (ingredientes)**: por 1 unidade do produto, quantos itens de estoque gasta (ex.: pão 0,15 kg). É o que permite a baixa automática.
- **Categorias**: tela própria no menu (ícone emoji, ordem de exibição, ativa/inativa). Não é possível excluir uma categoria que ainda tem produtos vinculados.

## 5. Mesas

- Criar mesa (número único) e mudar status: livre/ocupada/reservada/inativa.
- 📱 **QR do cardápio**: gera QR Code da mesa para o cliente pedir sozinho (baixe o PNG e cole na mesa).

## 6. Estoque

- Cadastre insumos com unidade (kg, un, L…), mínimo e custo médio.
- **Movimentar**: Entrada (compras), Saída, Ajuste (correção de inventário). Cada movimento guarda quem/quando/quanto e o saldo resultante.
- O badge vermelho no menu mostra itens **abaixo do mínimo**.
- Exporte a lista em CSV se precisar no Excel.

## 7. Delivery

- **Novo delivery**: plataforma (iFood/Goomer/WhatsApp/Próprio), dados do cliente e itens.
- Avanço do status: Pendente → Confirmado → Preparo → Pronto → Entregue (cancelável até entregar).

## 8. Financeiro

- **Fornecedores**: cadastro básico de quem você compra.
- **Despesas**: categoria (insumo, folha, conta fixa, outra), data (competência), vencimento e valor.
  - **Marcar pago** quando quitar; dá para reabrir depois.
  - Despesas NÃO entram no movimento do caixa — servem para o resultado gerencial.

## 9. Relatórios

- Informe período → faturamento, ticket médio, nº de pedidos, vendas por hora, formas de pagamento, top produtos/categorias.
- Bloco financeiro: despesas por categoria, CMV estimado e **resultado gerencial**.
- Fechamento de caixa histórico com diferenças registradas.
- Botões de **exportar CSV** onde houver lista/tabela.

## 10. Configurações

| Opção | Para quê |
|---|---|
| Aparência | Tema claro/escuro (individual) |
| Restaurante/moeda/fuso | Identidade e formato |
| Impressora | Tipo/endereço Bluetooth + **teste de impressão** |
| Baixa automática de estoque | Liga/desliga a dedução por receita |
| Cardápio digital | Liga/desliga o menu público por QR |
| Usuários | Criar/editar equipe e papéis (admin/gerente); senha provisória; redefinir senha |

## 11. Papéis — quem pode o quê

| Ação | Admin | Gerente | Caixa | Garçom | Cozinha |
|---|---|---|---|---|---|
| Vender/pagar/caixa | ✅ | ✅ | ✅ | — | — |
| Lançar pedidos | ✅ | ✅ | ✅ | ✅ | — |
| KDS/status itens | ✅ | ✅ | ✅ | — | ✅ |
| Produtos/mesas (cadastros) | ✅ | ✅ | ✅ | — | — |
| Estoque/configurações/usuários | ✅ | ✅ | — | — | — |

## 12. Problemas comuns

| Situação | O que fazer |
|---|---|
| "Mesa X já está ocupada" | Outra pessoa abriu pedido — abra pela mesa (cartão amarelo) |
| "Valor excede o saldo do pedido" | Confira pagamentos já registrados; valor maior que restante não passa |
| Não imprime via Bluetooth | Use Chrome/Edge; pareie a impressora; se falhar, o sistema abre opção de impressão pela janela |
| Cardápio QR não abre | Verifique se o cardápio digital está ativo nas Configurações |
| Fui deslogado / erro de permissão | Token expira ~1h — faça login novamente; após troca de papel, relogue |
| Quero cadastrar uma nova lanchonete | Precisa de convite do dono da plataforma (link `?t=CÓDIGO`) |

---

## 13. Dono da plataforma (console separado)

Operadores da plataforma NÃO pertencem a uma loja. Em `/plataforma` eles geram
convites de provisionamento (link copiável com código), veem o status de cada
convite (ativa/usada/expirada/revogada) e podem revogá-los. Convites são de uso
único e expiram em 7 dias.
