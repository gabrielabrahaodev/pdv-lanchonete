# Correção — erro 500 na paginação de despesas

Relato: `/api/despesas/pagina?limit=50&status=&categoria=` retornava `Erro interno: TypeError` após integração do BI.

Reproduzido com SDK real no emulador, usando a mesma rota HTTP: `BaseCollectionReference.order_by() takes 2 positional arguments but 3 were given`. O helper compartilhado passava direção posicional. Sem filtro de datas, `col` é CollectionReference, cujo argumento direction é keyword-only; com filtros, Query pode aceitar formato diferente. Corrigido para `order_by(field, direction=...)`, compatível com ambos. Outros usos de order_by no backend já usavam keyword.

Não era índice ausente, Security Rules ou aviso de lazy loading de imagens. Nenhum dado/índice/credencial precisa ser alterado.

O fake da coleção agora também exige keyword-only, para não mascarar a incompatibilidade. Teste HTTP unitário cobre filtros vazios e cursor; novo `scripts/e2e/despesas_paginacao_emulator.py` usa SDK real e valida primeira/próxima página, filtros vazios/por status, datas e tenant diferente. Adicionado ao CI.

Validação local: 271 pytest passaram; cenário HTTP no emulador passou. Homologar Despesas sem filtro, com status/categoria e próxima página. O helper compartilhado também atende pedidos, movimentos e sessões paginadas. Sem merge/deploy automático; publicar backend apenas após aprovação.
