# Documento de Levantamento de Requisitos — PDV Lanchonete v2

Registro de **como** os requisitos foram levantados: técnicas aplicadas, entrevistas simuladas com os papéis da operação, observação do processo atual e priorização. Serve como trilha de auditoria entre o problema de negócio e o `documento-requisitos.md`.

---

## 1. Contexto e método

| Aspecto | Descrição |
|---|---|
| Negócio estudado | Lanchonete de pequeno porte (salão + balcão + delivery) |
| Processo anterior | Comandas em papel, caixa manual no fim do dia, estoque "de cabeça", sem histórico financeiro |
| Técnicas de elicitação | Entrevistas estruturadas por papel; observação in loco do fluxo de atendimento (shadowing); análise de concorrentes (PDVs tradicionais); prototipação evolutiva (versão Flutter → v2 web); validação incremental com o dono |
| Restrições descobertas | Custo zero inicial, uso simultâneo em 2–3 dispositivos, internet instável no salão |

## 2. Entrevistas por papel (síntese)

### Dono / Administrador
- **Dores:** não sabia o lucro real; fechamento de caixa nunca batia; compras sem registro.
- **Pedidos capturados:** relatório diário/mensal (RF-090/091), DRE simples (RF-091), controle de despesas e fornecedores (RF-080/081), sessão de caixa auditável com diferença contada (RF-043), múltiplos papéis com senhas próprias (RF-006/008).
- **Decisões de produto registradas:** despesa NÃO entra no caixa (RN-12); cancelamento pós-baixa NÃO estorna estoque (RN-08); saldo de estoque pode ficar negativo para não travar a produção.

### Operador de Caixa
- **Dores:** demora para lançar pedidos, erro de conta manual, troco errado.
- **Capturado:** mapa rápido de mesas (RF-110), pagamento parcial por formas mistas (RF-040/041), cálculo de troco na tela (RF-040), recibo impresso (RF-113), abertura com fundo de troco (RF-043).

### Garçom
- **Dores:** idas repetidas ao balcão para anotar; conflito de mesa (dois garçons no mesmo pedido).
- **Capturado:** lançamento direto por mesa (UC-03), proteção transacional anti-duplicidade (RF-031), alteração de status da mesa permitida ao garçom (RN-02).

### Cozinha
- **Dores:** comandas de papel se perdem; não sabe ordem dos pedidos.
- **Capturado:** KDS com 3 colunas e auto-refresh (RF-050/051), botão de imprimir comanda (RF-113), baixa automática de ingredientes ao iniciar preparo (RF-034).

### Cliente
- **Capturado:** cardápio pelo celular via QR na mesa, sem instalar nada (RF-100..102); pedido chega direto na fila.

## 3. Observação do processo (shadowing) — achados

1. Pico de atendimento concentra-se em ~3h; telas críticas precisam responder < 1s → polling leve + cache (RNF-007).
2. Erros mais comuns: item digitado errado (→ remoção só de pendentes, RN-06) e troco (→ campo valor recebido).
3. Estoque: receita fixa por produto simplifica a baixa (RN-10: ingredientes por 1 unidade).
4. Impressão térmica Bluetooth já disponível no balcão → ESC/POS via Web Browser (RF-113).

## 4. Requisitos emergentes de tecnologia (restrições aceitas)

| Achado | Decisão |
|---|---|
| Sem servidor próprio | Firebase (Auth + Firestore) plano Spark |
| Multi-dispositivo | Web app responsivo + PWA (RF-115) |
| Internet instável no salão | Cache NetworkFirst das leituras (RF-115); escrita offline fica fora do escopo desta fase |
| Claims do Firebase valem só no próximo token | Refresh forçado após onboarding/troca de papel (RF-005) |
| Windows como estação principal | Backend roda local (uvicorn :8000) na fase de desenvolvimento; produção planejada (Render) |

## 5. Priorização (MoSCoW)

- **Must:** login/papéis, mesas/pedidos/itens, KDS, pagamentos/caixa, produtos/categorias, relatório resumo, regras anti-corrida.
- **Should:** estoque com receita e baixa automática, financeiro + DRE, delivery manual, cardápio digital público, tema por usuário, CSV, impressão Bluetooth, PWA leitura offline.
- **Could:** realtime total via onSnapshot, QR por mesa, teste de impressora nas configurações.
- **Won't (esta fase):** integração automática iFood/Goomer, gateway de pagamento, NFC-e, app nativo, fila offline de escrita.

## 6. Validação

Cada grupo de requisitos foi verificado contra o sistema implementado:
- Suíte E2E de API (34 casos, todos PASS) cobrindo auth, CRUDs, pedido→cozinha→pagamento→caixa, estoque, delivery, relatórios e configurações;
- Testes manuais B1/M4 (pagamento minimalista 201; plataforma inválida no delivery 422);
- Testes manuais do cardápio digital e onboarding;
- pytest (23 testes) sobre as fórmulas do domínio.

Detalhes em `../04-testes/`.
