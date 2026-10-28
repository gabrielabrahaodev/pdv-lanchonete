# Fornecedores — gestão e CRUD

Base: master e PR #17 (custos comerciais), em PR encadeada. `/fornecedores` reutiliza coleção e endpoints existentes. Rota e menu exigem perfil financeiro; escrita mantém admin/gerente/caixa. Busca local por nome/documento/contato, ativos/inativos, tabela desktop, cartões mobile e detalhes. Campos opcionais compatíveis: nome fantasia, WhatsApp, endereço, condição de pagamento, prazo em dias (0–365).

Exclusão consulta vínculos limitados em estoque, reposição, despesas e movimentos em transação. Vínculos impedem exclusão; prefira desativar. Criação/vínculo de insumos e despesas valida fornecedor ativo no tenant dentro da transação, assim como reposição. Contatos de WhatsApp usam o campo específico, com fallback para telefone. Recebimentos preservam o fornecedor histórico.

Financeiro carrega fornecedores somente no formulário de insumos, usuários somente no de folha. Chaves com tenant e papel, TTL 2 min; invalidar `fornecedores` após mutações. Não alterar dados produtivos.
