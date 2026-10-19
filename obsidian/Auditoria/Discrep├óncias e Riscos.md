---
title: Discrepâncias e Riscos
tags: [auditoria, riscos, bugs]
severity: high
---

# Discrepâncias e Riscos

> [!danger] A — 500 nos relatórios agregados (confirmado no código remoto)
> **Fonte:** `backend/app/services/relatorios_service.py`, função `_resumo_por_agregados`, próximo à linha 69 no commit analisado.
>
> **Código:** `snaps = db.get_all(*refs) if refs else []`. A biblioteca Firestore Python espera uma coleção de referências em um único argumento (`db.get_all(refs)`), não referências desempacotadas como dezenas de parâmetros. O trace reportado na conversa mostrou `Client.get_all() ... but 33 were given` em período mensal.
>
> **Correção recomendada:** mudar a chamada para `list(db.get_all(refs)) if refs else []`; proteger documento ausente com `(s.to_dict() or {}).get(...)`; escrever teste de regressão cobrindo período longo e snapshots inexistentes.
>
> **Estado:** o snapshot remoto consultado ainda contém a chamada incorreta. A correção pode existir somente no clone local; verificar `git diff` e commit antes de fechar o incidente.

## B — Comentário de agregados contradiz serviço de backfill

`agregados_service.py` diz “SEM backfill”; `backfill_service.py` e `scripts/reconstruir_agregados.py` implementam reconstrução dry-run / `--apply`. Atualizar comentário ou decisão oficial. Backfill usa `ZoneInfo("America/Sao_Paulo")` fixo, mas relatório usa `settings.timezone`; isso pode criar cobertura inconsistente se configuração muda.

## C — Backfill de agregado precisa ser operado com cautela

`reconstruir()` lista histórico e reescreve docs agregados e marcador `agregadoDesde` em apply. Antes de aplicar:
- executar dry-run;
- conferir pedidos considerados, despesas, movimentos, dias/meses;
- garantir que a competência de vendas/despesas é correta;
- confirmar timezone e que não há gravação concorrente que depois cause diferença.

## D — Agregados e custo real de leitura

O caminho de resumo por agregado não é necessariamente uma ou duas leituras totais: lê um documento por dia em lote e percorre coleções de produtos/categorias/estoque. O endpoint `GET /relatorios/agregado` usa `resumo_agregado`, que também lista estoque para custo médio e outras coleções. Não prometer custo fixo independente do período sem medir.

## E — Cardápio QR: requisito antigo x código atual

Documento de regra RN-21 descreve envio de pedidos pelo QR, mas `routers/publico.py` expõe a rota de pedido com status 410; README/manual de usuário dizem QR é só leitura e o pedido é feito pelo atendente. Atualizar documento de regra/testes para não vender funcionalidade desativada.

## F — Esquema lógico antigo x rules atuais

Um trecho de `docs/02-modelagem/esquema-logico-banco-dados.md` resume `allow read, write` no tenant; `firestore.rules` atual permite `read` se claim coincide e define `allow write: if false`. Para comportamento efetivo, confiar no arquivo rules e testes do emulador; corrigir o diagrama/descrição antiga.

## G — Local checkout pode diferir do branch remoto

A saída local compartilhada na conversa mostra `RelatoriosPage.tsx` com `horas = Object.entries(...).sort(...)`, cálculo `alturaPx` e root `p-3 sm:p-6`, além de `FinanceiroPage` com layout responsivo e classes dark. A versão remota da branch consultada ainda tem código de relatório mais antigo. Não sobrescrever esses arquivos locais com cópia remota sem revisar `git diff`.

## H — Qualidade de dados do estoque

Consumo da ficha técnica multiplica `qtd` sem conversão universal de unidade. Unidade errada (por exemplo, ficha usa gramas e estoque está em kg) pode causar consumo muito alto, saldo irreal e CMV inflado. Seeds precisam ter IDs de lote, valores plausíveis, unidade consistente e dry-run/cleanup seguro.

## I — Resultado gerencial não é lucro contábil

Fórmula é `faturamento - despesas cadastradas`; CMV fica informativo. Custos não registrados, tributos/taxas e outras despesas ausentes podem tornar o resultado incompleto. Custo médio atual torna CMV histórico aproximado.

## J — Outras verificações que merecem prioridade

- `resumo()` escolhe agregado quando o início é >= `agregadoDesde`; confirmar que todas as datas pedidas têm cobertura, e tratar documentos de dia inexistentes.
- Dados históricos sem `fechadoEm` podem não entrar na query por esse campo, ainda que o serviço depois tente fallback para `criadoEm`.
- Campos de mapa incrementados via caminhos pontilhados supõem IDs/chaves sem ponto no nome; IDs gerados são seguros, mas não aceitar chaves arbitrárias sem validação.
- Rate limit do cardápio é descrito como memória por processo; em múltiplas instâncias pode não ser global.
- A demonstração local do projeto incluiu movimentações de estoque com quantidade fora de escala; revisar/restaurar dados somente por lote identificado, jamais limpar dados reais indiscriminadamente.

## Processo para fechar um risco

1. Criar ticket/nota com impacto e reprodução.
2. Identificar source path e teste que reproduz.
3. Corrigir regra e escrever teste de regressão.
4. Rodar suíte + TypeScript + build + emulator rules.
5. Revisar `git diff`, commit na branch apropriada e PR.
6. Atualizar esta nota com commit, evidência e status.
