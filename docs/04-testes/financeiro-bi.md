# Fornecedores, captura de lucratividade e Financeiro BI

## Base e dependências

Inspeção de 28/10/2026: master `e4293ca` contém PRs #14, #15 e #16 (reposição, foco e recebimento retroativo). PR #17 ainda aberto em `93910e5`; primeira branch parte desse head, sem mesclá-lo. Três PRs encadeadas: `feat/fornecedores-spark` → `feat/agregados-lucratividade` → `feat/financeiro-bi`. Não usar branch antiga de UI, não fazer merge/deploy. Alterações locais anteriores foram preservadas em outro worktree.

## Implementação

1. Fornecedores em tela independente; campos compatíveis, detalhes, busca, situação, tabela desktop/lista mobile. Exclusão transacional bloqueia vínculos de estoque, reposição, despesas e movimentos. Vínculo novo exige fornecedor ativo no tenant. Auxiliares de despesa carregados sob demanda. Paginação limitada mesmo com filtros, cursor sempre avança. CSV explicita exportação da página.
2. Captura por produto/variação na quitação, mesma transação e evento determinístico existente. Rateio do total por maiores restos. Custos diretos em escala 10^8, receita em centavos, Decimal. Snapshot reaproveita leituras de consumo/FEFO; produzir não reconhece venda. Desconhecido/baixa off não vira zero. Mantém campos legados e histórico.
3. BI Python com autorização financeira, período validado, lote de agregados diários e cache de 30s segmentado por tenant/papel. Dashboard com visão geral, receitas, despesas, contas, resultado, lucratividade e previsibilidade. Gráficos responsivos e tabelas, filtros, rankings, cobertura e alertas explicáveis. Sem Supabase, banco auxiliar ou serviço analítico pago.

## Validação local executada

- **270 pytest passaram**, com um aviso de depreciação de Starlette/TestClient da dependência existente.
- **36 testes frontend passaram** (7 precificação, 10 unidades/custos, 3 segurança, 10 cardápio, 3 reposição e 3 foco).
- TypeScript e build Vite/PWA passaram; aviso preexistente de bundle Firebase acima de 500 kB.
- Firestore Rules e os três scripts existentes de produção, balcão e evolução passaram no emulador `demo-p0a`/127.0.0.1:8680.
- Novo `scripts/e2e/bi_emulator.py` passou: 40 produzidos/25 vendidos, pagamento concorrente único, custo histórico preservado, reserva não confundida com entrega. Adicionado ao CI.
- UI com API/identidade simuladas: 320/390/768/1024/1440 px, claro/escuro, seções sem overflow horizontal, auxiliares lazy, seleção de produto e foco estável no modal fornecedor. Não é E2E autenticado.
- GitHub Actions: consultar a execução de cada PR; aprovação local não implica aprovação no CI.

Runner UI reproduzível: instalar Playwright externamente ou em ambiente de testes, iniciar `npm run dev` em frontend e executar `PLAYWRIGHT_MODULE=/caminho/node_modules/playwright node frontend/tests/financeiro-bi-ui.cjs`. Harness local em `frontend/tests/browser/financeiro-bi.html`. Nenhuma credencial ou acesso produtivo no teste.

## Estimativas Spark

Cenário: 62 produtos, 500 vendas/semana, 20 aberturas/dia, não medido em produção.

| Leitura para apenas um período | 7 dias | 30 dias | 90 dias |
|---|---:|---:|---:|
| Pedidos individuais | 500 | 2.143 | 6.429 |
| Documento dia/produto, todos os 62/dia | 434 | 1.860 | 5.580 |
| Agregados diários | 7 | 30 | 90 |
| Mensais, por calendário | 1–2 | 1–2 | 3–4 |
| Painel implementado (inclui anterior e 56 dias para previsão) | 56 | 60 | 180 |
| Painel ×20 aberturas sem cache | 1.120 | 1.200 | 3.600 |

Autenticação, menu global de estoque, consultas auxiliares, fotos, regras/reconexões, contas a pagar e despesas não estão incluídos nessa linha analítica. Contas até 201 documentos, páginas de despesa 50+cursor. Evolução selecionada reutiliza cache de fontes quando contida no intervalo, senão lê dias do período; React Query reutiliza filtros por 30s. Não se pressupõe taxa de acerto de cache.

Escritas analíticas da venda: continua atualizando dois agregados + evento já existente, não um novo documento por item. Campos crescem nos mesmos documentos. Diário/mensal ainda são pontos de contenção, exigindo monitoramento. Snapshot por item/lote vai nos documentos existentes. Rascunho de isenção de índices para mapas BI em `firestore.indexes.json`; não aplicado na produção.

Fonte oficial: https://firebase.google.com/docs/firestore/quotas — free tier compartilhado pelo projeto (50 mil leituras/dia, 20 mil escritas/dia), documento até 1 MiB. Não garante que vários restaurantes caberão na quota; medir uso total. Ver detalhes em `obsidian/Financeiro-Otimizacao-Firestore.md`.

## Limitações que exigem homologação

- Vendas antigas sem snapshots ficam sem margem confiável; sem backfill automático.
- Custo sob pedido é congelado quando há consumo efetivo conhecido; pagamento anterior ao preparo permanece desconhecido no agregado. Referência teórica usa custo/receita no consumo; não estima perdas não medidas. Antecipado usa rendimento previsto versus realizado do lote.
- Reserva atribuída à venda não confirma entrega; conferência existente continua obrigatória.
- Categoria, nome e meta do último evento podem prevalecer nos metadados agregados. Valores históricos de receita/custo não são recalculados pelo cadastro.
- Compras por fornecedor individualizadas só contam eventos que tenham o novo mapa. Histórico sem mapa não é reconstruído.
- Margem parcial calcula apenas parcela de receita com custo conhecido. Ranking é explicitamente de lucro/margem cobertos.
- Despesas de categoria insumo são consideradas compras e separadas do CMV; categorias incorretas afetam resultado. Taxas/tributos/indiretos não alocados não estão completos.
- Relatórios legados preservados; o novo resultado gerencial não é lucro líquido contábil nem fluxo bancário.
- Previsão estatística simples e cenários hipotéticos, sem garantir resultados; histórico insuficiente desabilita previsão. Apenas vencimentos conhecidos nas despesas; sem inventar recorrência ou saldo inicial.
- Sem novo endpoint de estorno: sistema atual não suporta reversão financeira arbitrária. Não simular estorno cancelando item pago.
- Páginas filtradas de despesas podem retornar vazias com próxima página para manter leitura limitada sem novos índices compostos.
- Homologação autenticada e PWA real, revisão contábil com cliente/contador e medição de quotas produtivas seguem pendentes.

## Homologação e implantação

Seguir `obsidian/Financeiro-Plano-de-Testes.md`: CRUD e vínculos; recebimento retroativo kg/g e débito exato; pagar/reabrir sem romper origem; produção40/venda25; pedido preparado versus sem custo; alteração posterior de receita/custo; filtros e rankings; previsão insuficiente e suficiente; roles/tenant; celular, desktop e escuro.

Validar PR #17 e depois as três novas PRs em ordem. Configuração de índices proposta precisa de revisão/publicação separada, sem migração de dados; não há necessidade de inicializar valores fictícios. Publicação coordenada frontend/backend somente após homologação e autorização. Nenhum merge, deploy, backfill ou dado produtivo foi executado.
