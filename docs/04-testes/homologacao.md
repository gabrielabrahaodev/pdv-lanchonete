# Documento de Homologação — PDV Lanchonete v2

Registro formal da validação funcional pelo usuário/negócio antes do go-live no cliente piloto.

---

## 1. Identificação

| Campo | Valor |
|---|---|
| Sistema | PDV Lanchonete v2 |
| Versão homologada | 2.0.0 (marcos M1–M4 concluídos) |
| Ambiente | Desenvolvimento local validado contra projeto Firebase real (`pdv-lanchonete-1fa79`) |
| Homologador responsável | Dono/Administrador da lanchonete |
| Acompanhamento | Analista/QA |
| Data prevista | Após execução dos roteiros R-01..R-07 |

## 2. Objetivo

Confirmar, sob a ótica do negócio, que os fluxos operacionais diários funcionam conforme esperado: abrir o dia, atender mesas, produzir na cozinha, receber pagamentos, fechar o caixa, repor estoque e consultar resultados.

## 3. Roteiro de homologação (checklist de aceite)

### Dia-a-dia da operação
- [ ] **HA-01** Login com minha senha funciona; vejo meu papel correto.
- [ ] **HA-02** Abro o caixa com fundo de troco; só um caixa abre por vez.
- [ ] **HA-03** Lanço pedido numa mesa livre em menos de 30s; mesa fica ocupada.
- [ ] **HA-04** Cozinha recebe os itens; preparo avança pendente→preparo→pronto→entregue.
- [ ] **HA-05** Ao iniciar preparo, ingredientes baixam sozinhos (quando produto tem receita).
- [ ] **HA-06** Recebo pagamento parcial e depois quito; troco calculado certo no dinheiro.
- [ ] **HA-07** Ao quitar: mesa libera sozinha e venda entra no caixa.
- [ ] **HA-08** Faço sangria/suprimento; fecho caixa com contagem; vejo diferença.
- [ ] **HA-09** Relatório do período bate com meu controle manual (faturamento, formas, top produtos).
- [ ] **HA-10** Resultado gerencial (faturamento − despesas) faz sentido para mim.

### Cadastros e gestão
- [ ] **HA-11** Cadastro/edito produtos com variações e receita de ingredientes.
- [ ] **HA-12** Crio mesa nova e gero QR do cardápio por mesa.
- [ ] **HA-13** Registro entrada de compra no estoque; alerta aparece quando fica abaixo do mínimo.
- [ ] **HA-14** Lanço despesas (insumo/folha/conta fixa) e marco como pagas; reabro quando preciso.
- [ ] **HA-15** Registro um pedido de delivery e avanço até entregue.

### Segurança e preferências
- [ ] **HA-16** Garçom/cozinha/caixa acessam só o que lhes cabe (testes com as contas criadas).
- [ ] **HA-17** Cada usuário escolhe tema claro/escuro e mantém sua escolha.

### Extras
- [ ] **HA-18** Cliente pede pelo QR na mesa e o pedido cai na fila corretamente.
- [ ] **HA-19** Impressão da comanda/recibo funciona (ou fallback aceitável sem impressora).
- [ ] **HA-20** Exporto CSVs e abro no Excel sem quebrar acentos/colunas.

## 4. Critérios de aceite

- **Aprovação:** ≥ 95% dos itens marcados OK e nenhum item P1 (HA-01..HA-08, HA-16) reprovado.
- Itens reprovados geram defeitos (S1–S3) e nova rodada apenas nos itens afetados + regressão R-01.

## 5. Registro de execução

| Item | Resultado | Observação |
|---|---|---|
| HA-01..HA-20 | ⬜ preencher em homologação | — |

*(Tabela a ser assinada durante a sessão de homologação. Testes automatizados prévios: 23/23 unitários, 34/34 API, manuais B/M aprovados — ver relatorios-teste.md.)*

## 6. Pendências conhecidas NÃO bloqueantes para aceite

1. `firestore.rules` ainda não publicadas → banner vermelho de tempo real (sem ele as telas não atualizam sozinhas). Publicar antes do go-live multi-dispositivo.
2. Deploy em produção (Render/Firebase Hosting) pendente — homologação pode ocorrer em ambiente local controlado.
3. Integração automática iFood/Goomer fora de escopo desta fase (registro manual).

## 7. Termo

Homologado o escopo acima, o sistema está **aprovado para implantação piloto**, condicionado às pendências listadas serem tratadas conforme plano de implantação (`05-implantacao/plano-implantacao.md`).

| Assinatura digital | Papel | Data |
|---|---|---|
| ____________________ | Dono/Homologador | ___/___/______ |
| ____________________ | QA/Analista | ___/___/______ |
