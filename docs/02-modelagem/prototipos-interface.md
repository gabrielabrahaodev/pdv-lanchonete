# Protótipos de Interface (Wireframes / Mockups) — PDV Lanchonete v2

Wireframes textuais fiéis às telas implementadas (`frontend/src/pages`). Identidade visual: **laranja `#ea580c`** como cor de marca, fundo claro/escuro alternável por usuário, cartões arredondados, badges de status coloridos.

## 0. Shell do aplicativo (AppLayout)

```
┌──────────┬──────────────────────────────────────────────┐
│ 🍔 PDV   │  ☰ (mobile)                                  │
│          │                                              │
│ 🧾 Caixa │                                              │
│ 🍽️ Mesas │              <conteúdo da página>            │
│ 🍔 Produtos│                                            │
│ 🏷️ Categorias│                                          │
│ 📦 Estoque②│                                            │
│ 👨‍🍳 Cozinha│                                             │
│ 🛵 Delivery                                            │
│ 📊 Relatórios                                          │
│ 💰 Financeiro                                          │
│ ⚙️ Configurações                                       │
│ 🔑 Plataforma  ← só para dono da plataforma            │
│          │                                              │
│ 👤 Nome  │                                              │
│ [admin]  │                                              │
│ Sair     │                                              │
└──────────┴──────────────────────────────────────────────┘
  ▲ menu colapsável («); drawer no mobile; badge vermelho ②
    = itens de estoque abaixo do mínimo
```

## 1. Login

```
┌────────────────────────────────────┐
│            🍔 (logo)               │
│        PDV Lanchonete              │
│  ┌──────────────────────────────┐  │
│  │ E-mail                       │  │
│  ├──────────────────────────────┤  │
│  │ Senha                        │  │
│  └──────────────────────────────┘  │
│         [ Entrar ]  (laranja)      │
└────────────────────────────────────┘
```

## 2. Seleção/Criação de restaurante (onboarding por convite)

```
┌────────────────────────────────────────────────┐
│  Bem-vindo! Configure seu restaurante:         │   ← acessada pelo link do convite:
│  ┌──────────────────────────────────────────┐  │     /select-restaurant?t=CÓDIGO
│  │ Nome do restaurante                      │  │     (sem convite válido → bloqueado)
│  ├──────────────────────────────────────────┤  │
│  │ Quantidade de mesas:                     │  │
│  │ (Sem salão)(6)(12✓)(24)(Outro → [__])    │  │
│  └──────────────────────────────────────────┘  │
│         [ Criar e começar ]                    │
│  ⓘ Você se tornará administrador.              │
└────────────────────────────────────────────────┘
```

## 3. Caixa — mapa de mesas (home)

```
┌─ Caixa ────────────── [Sessão de caixa] [Abrir caixa] ─┐
│ 2 mesa(s) ocupada(s) de 12                             │
│ ┌────────────────────────────────────────────────────┐ │
│ │ ● Caixa aberto desde 23/08 10:02   Fundo R$200,00  │ │
│ │ Vendas R$182,40 · Recebido R$182,40 · Sangrias R$0 │ │
│ └────────────────────────────────────────────────────┘ │
│ ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐     │
│ │Mesa 1  ││Mesa 2🟡││Mesa 3  ││Mesa 4  ││Mesa 5  │ …   │
│ │ livre  ││ocupada ││ livre  ││ livre  ││ livre  │     │
│ │iniciar→││abrir → ││        ││        ││        │     │
│ └────────┘└────────┘└────────┘└────────┘└────────┘     │
│   (cartão ocupado em âmbar; clique abre o pedido)      │
└────────────────────────────────────────────────────────┘
```

## 4. Novo pedido / Detalhe da mesa

```
┌─ Mesa 2 — Pedido aberto ───────────── R$ 42,90 ────────┐
│ Categorias: [Lanches][Bebidas][Porções][Sobremesas]    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│ │X-Burguer │ │Coca lata │ │Batata frita│               │
│ │R$ 22,00  │ │R$ 6,00   │ │R$ 14,90   │               │
│ │ [+ Add]  │ │ [+ Add]  │ │ [+ Add]   │               │
│ └──────────┘ └──────────┘ └──────────┘                 │
│ ── Itens do pedido ──                                  │
│ 1x X-Burguer (com cheddar) — "sem cebola"  R$22,00 ✖   │
│ 2x Coca lata                               R$12,00 ✖   │
│ 1x Batata frita 🔥preparo                  R$14,90     │
│ ───────────────────────────────────────────────────    │
│ Total: R$ 48,90      [Ir para pagamento]               │
└────────────────────────────────────────────────────────┘
   ✖ = remover (apenas itens pendentes)
```

## 5. Pagamento

```
┌─ Pagamento — Mesa 2 ───────────────────────────────────┐
│ Total do pedido: R$ 48,90                              │
│ Já pago: R$ 20,00          Restante: R$ 28,90          │
│                                                        │
│ [💵 Dinheiro] [⚡ PIX] [💳 Crédito] [🏦 Débito]          │
│ Valor: [ 28,90 ]                                       │
│ Recebido: [ 30,00 ]   Troco: R$ 1,10                   │
│                                                        │
│ Pagamentos: PIX R$20,00 (14:32)                        │
│                                                        │
│ [Registrar pagamento]        (quitado → 🖨 recibo + volta ao mapa)
└────────────────────────────────────────────────────────┘
```

## 6. Cozinha — KDS

```
┌─ 👨‍🍳 Cozinha — KDS ────────────────── [7 pedidos ativos] ┐
│ UM CARTÃO POR MESA (todas as seções no mesmo cartão):   │
│ ┌────────────────────┐  ┌────────────────────┐           │
│ │ Mesa 4      19:02🖨 │  │ Mesa 2      18:55  │           │
│ │ 2x X-Burger        │  │ 1x Hot dog  ⏳pend │           │
│ │   "sem cebola"     │  │ 1x X-Bacon  🔥prep │           │
│ │ 1x Coca       ⏳pend│  │ 2x Milkshake🔥prep │           │
│ │ [Iniciar preparo]  │  │ [Marcar pronto]    │           │
│ └────────────────────┘  └────────────────────┘           │
└─────────────────────────────────────────────────────────┘
  tema escuro fixo; tempo real (snapshot filtrado); 🖨 imprime comanda;
  botão avança TODOS os itens selecionados em 1 chamada (bulk)
```

## 7. Produtos (lista + formulário)

```
Lista: busca + filtro categoria | [Novo produto]
┌──────────────────────────────────────────────────┐
│ [🖼] X-Burguer · Lanches · R$22,00 · 2 variações ✓│
│ [🖼] Coca lata · Bebidas · R$6,00                │
│  ▲ thumbnail quando temImagem; placeholder senão │
└──────────────────────────────────────────────────┘

Formulário:
┌─ Produto ────────────────────────────────────────┐
│ Nome [____] Categoria [Lanches ▾] Preço [22,00]  │
│ Foto: [Escolher arquivo…] (preview) [Remover]    │
│ Ativo [x] Estoque mín. [0]                       │
│ Variações:  (nome, preço adicional, ativo)  [+ ] │
│ Receita (por 1 un.): item estoque ▾ qtd [0,15kg] │
│                                    [+ ingrediente]│
│                              [Salvar] [Cancelar] │
└──────────────────────────────────────────────────┘
  upload comprimido no cliente na MESMA mutation do salvar
```

## 8. Mesas (gestão)

```
┌─ Mesas — 2 ocupada(s) ──────────────── [Nova mesa] ───┐
│ Mesa 01 [livre]   Mesa 02 [ocupada]  Mesa 03 [livre]  │
│  [QR 📱]          [QR 📱]            [QR 📱]           │
│ status ▾ (reservada/inativa…)          [excluir]      │
│ ┌ Modal QR: cardápio — Mesa 02 ─────────────────┐     │
│ │  ▓▓▒▒ QR CODE ▒▒▓▓   https://app/m/rest_01/mesa_02 │
│ │  link copiável · [Baixar PNG]                  │     │
│ └───────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────┘
```

## 9. Estoque

```
┌─ Estoque — 14 item(ns) ──── filtro: [só alertas ☐] ───┐
│ Pão brioche · kg · 4,5/10 min ⚠️   [Entrada][Saída]   │
│ Carne bovina · kg · 12,0/5 ok      [Entrada][Saída]   │
│ Queijo cheddar · kg · 1,2/2  ⚠️    [Entrada][Saída]   │
│                                        [Exportar CSV] │
│ Movimentações recentes: saida 0,45 kg pão — pedido #… │
└───────────────────────────────────────────────────────┘
   modal movimentar: tipo(entrada/saída/ajuste)+qtd+obs
```

## 10. Delivery

```
┌─ Delivery — 3 pedido(s) em andamento ── [Novo delivery]┐
│ Colunas por status: Pendente | Confirmado | Preparo |  │
│ Pronto | Entregue                                      │
│ ┌──────────────────────────────┐                       │
│ │ ext_9f… · iFood · Maria S.   │                       │
│ │ 1x Combo burger R$39,90      │                       │
│ │ [Confirmar] [Cancelar]       │                       │
│ └──────────────────────────────┘                       │
└────────────────────────────────────────────────────────┘
   plataforma restrita a ifood/goomer/whatsapp/proprio
```

## 11. Financeiro

```
┌─ Financeiro ──────────────────────────────────────────┐
│ Abas/Seções: Despesas | Fornecedores | Resumo do mês  │
│ Filtros: período · status(pendente/pago) · categoria  │
│ ┌──────────────────────────────────────────────┐      │
│ │ Conta de luz · conta_fixa · R$320,00 · venc 10/09 │  │
│ │ [Marcar pago]                          [editar]    │  │
│ └──────────────────────────────────────────────┘      │
│ Resumo: insumo R$1.240 · folha R$3.100 · fixa R$860   │
│                                   [Exportar CSV]      │
└───────────────────────────────────────────────────────┘
```

## 12. Relatórios

```
┌─ Relatórios — vendas do período ──────────────────────┐
│ De [01/08/2026] até [23/08/2026]      [Consultar]     │
│ Cards: Faturamento · Ticket médio · Pedidos           │
│ Gráfico barras: vendas por hora (00h…23h)             │
│ Por forma de pagamento: pix 42% · crédito 31% …       │
│ Top produtos: 1º X-Burger (87) · 2º Coca (64) …       │
│ Bloco financeiro: despesas por categoria · CMV est.   │
│                   resultado gerencial                 │
│                                       [Exportar CSV]  │
└───────────────────────────────────────────────────────┘
```

## 13. Fechamento de caixa

```
┌─ Fechamento de caixa ─────────────────────────────────┐
│ Sessão ATUAL (desde 10:02):                           │
│ esperado = 200,00+1.284,50+150,00−300,00 = R$1.334,50 │
│ Valor contado: [ ____ ]  Diferença prevista: —        │
│ [Suprimento] [Sangria]           [Fechar caixa]       │
│ ─ Histórico ─                                         │
│ #sessao_x · fechada ontem 22:04 · diferença −R$2,00   │
└───────────────────────────────────────────────────────┘
```

## 14. Configurações

```
┌─ Configurações ───────────────────────────────────────┐
│ Aparência:  [☀️ Claro ✓] [🌙 Escuro]  (por usuário)    │
│ Restaurante: nome · moeda[BRL] · timezone[São Paulo]  │
│ Impressora: tipo[bluetooth] endereço[__] [Testar 🖨]   │
│ Baixa automática de estoque [x ON/OFF]                │
│ Cardápio digital [x ON/OFF]                           │
│ Usuários: lista (nome·papel·email) [Adicionar usuário]│
│           papel ▾ · senha provisória · ativo [x]      │
└───────────────────────────────────────────────────────┘
```

## 15. Cardápio digital público (cliente, mobile-first)

```
┌─────────────────────────────┐
│ Lanchonete do Zé      🍔    │
│ Mesa 02                     │
│ [Lanches][Bebidas][…]       │
│ ┌─────────────────────────┐ │
│ │[🖼] X-Burger  a partir  │ │
│ │              de R$22,00 │ │ ← "a partir de" quando há variações;
│ │ descrição curta         │ │   foto pública do produto (temImagem)
│ └─────────────────────────┘ │
│ Chame o atendente para pedir│
└─────────────────────────────┘
  somente leitura, sem login; pedidos pelo QR desativados (410)
```

## 16. Plataforma (console do dono)

```
┌─ 🔑 Plataforma ────────────────────────────────────────┐
│ [Gerar convite]                                        │
│ Link copiável: …/select-restaurant?t=Ab3xY…  [copiar]  │
│ ─ Convites ─                                           │
│ Ab3xY… · ativa · expira 30/08   [📋 link] [revogar]  │
│ K9mPq… · usada por rest_7f2c · 25/08                   │
│ R2vLt… · expirada                                      │
└────────────────────────────────────────────────────────┘
   fora do layout da loja; guard sistema/global.donoUids;
   convite = uso único, expira em 7 dias
```

## 17. Categorias

```
┌─ Categorias ─────────────────────────── [Nova categoria]┐
│ 🍔 Lanches    ordem 1  [ativa]  [editar] [excluir]      │
│ 🥤 Bebidas    ordem 2  [ativa]  [editar] [excluir]      │
│ 🍟 Porções    ordem 3  [inativa][editar]                │
└─────────────────────────────────────────────────────────┘
   ícone emoji · ordem de exibição no cardápio/PDV ·
   exclusão BLOQUEADA se houver produtos vinculados (409)
```

## Estados de interface padronizados

| Estado | Componente | Aparência |
|---|---|---|
| Carregando | `LoadingScreen` | Spinner central |
| Erro | `ErrorState` | Ícone ⚠️ + mensagem da API + botão tentar novamente |
| Vazio | `EmptyState` | Ícone ilustrativo + orientação ("Nenhuma mesa cadastrada — crie em Mesas.") |
| Status | `Badge` | cores: livre=verde, ocupada=âmbar, pago=verde, cancelado=vermelho, alerta=rosa |

## Tema escuro

Todas as telas possuem paridade clara/escuro via classes Tailwind `dark:`; a escolha é individual (doc do usuário + cache localStorage por uid). O KDS nasce com fundo escuro fixo por ergonomia.
