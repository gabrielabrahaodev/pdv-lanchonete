# Financeiro — arquitetura BI

PRs encadeadas: fornecedores/Spark → agregados por produto → BI. Base inclui PR #17 ainda não mesclada. Nenhum deploy, migração ou merge automático.

Firestore é fonte; Python calcula e React apresenta. Sem Supabase, Redis, pandas ou serviço pago. `/bi/visao-geral?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&horizonte=7|30|90` retorna indicadores, comparativo anterior de mesma duração, evolução diária, produtos e previsão em uma chamada. Datas civis inclusivas; usar fuso da competência existente (`settings.timezone`, padrão São Paulo). Janela máxima 366 dias.

Lê referências diárias em lote (`get_all`), começando no mínimo entre comparação anterior e 56 dias de histórico; portanto uma consulta 7 dias pode ler 56 referências, 30 dias 60, 90 dias 180. Essas são estimativas superiores por janela, não cobrança medida. Não varre pedidos/ingredientes/produtos. Previsão e indicadores reutilizam resultado. Endpoints de seção compartilham cache Python por restaurante, papel, início/fim/horizonte, TTL 30 s e máximo 64 entradas; autorização via perfil ativo ocorre antes do acesso ao cache. Não constitui cache de credenciais. React Query também segmenta tenant/papel e período, TTL 30 s. Não há polling.

Contas pendentes são consulta separada lazy, status único com máximo 201 documentos (200 retornados + sinal de truncamento), sem datas inventadas. Despesas pagas/pendentes completas continuam na navegação por páginas. Auxiliares de fornecedores/categorias só nas seções que precisam deles.

APIs: `/bi/visao-geral`, `/evolucao`, `/despesas`, `/fornecedores`, `/previsao`, `/contas-a-pagar`, `/produtos`, `/produtos/ranking`, `/produtos/{id}`, `/produtos/{id}/evolucao`. Rotas estáticas antes das dinâmicas. Admin, gerente e caixa; tenant sempre deriva do token/perfil validado, nunca de query do usuário. Rules não enfraquecidas.

O cache de fontes também reutiliza um intervalo mais amplo já lido ao consultar evolução de produto dentro dele, segmentado por tenant/papel e TTL. Datas, variação e produto continuam filtros explícitos; nenhuma cache key aceita tenant fornecido pelo cliente.
