---
title: Guia para IA e Desenvolvedores
tags: [agentes, ia, desenvolvimento]
---

# Guia para IA e Desenvolvedores

## Antes de mudar código

1. Leia [[00 - Início]], [[Regras de Negócio/Índice de Regras]], a nota de domínio e [[Auditoria/Discrepâncias e Riscos]].
2. Verifique branch, HEAD e estado local (`git status --short`, `git diff`). Não assuma que o branch remoto e o clone são idênticos.
3. Encontre regra no backend service e guard no router. Não inferir regra com base apenas na UI.
4. Identifique efeitos colaterais: pedido, estoque, agregado, caixa, mesa, despesas e eventos idempotentes.
5. Escreva teste de regressão antes/depois para dinheiro, autorização, estados ou agregados.

## Regras de arquitetura que não devem ser quebradas

- Firebase ID token é a identidade; `restaurantId` e papel vêm de custom claims.
- Isolamento tenant deve ser validado no backend e nas regras Firestore.
- Não expor `FIREBASE_SERVICE_ACCOUNT_JSON`, `service-account.json`, `.env`, `token.txt`, credenciais de cliente ou dados reais.
- Tudo que afeta pagamentos/estoque deve manter transação e fazer todas as leituras antes das escritas.
- Use o SDK Python transacional documentado; não copiar `db.run_transaction` de exemplos Node sem verificar API.
- Em limpeza de campo usar `DELETE_FIELD` quando campo deve sumir do documento.
- Preço final vem do servidor; não confiar em preço total do browser.
- Idempotência é parte da regra, não melhoria cosmética.
- Receita de ingrediente deve usar a mesma unidade do item de estoque.
- Mudança de schema deve ser aditiva e tolerar documentos históricos com campo ausente.
- Não declarar build/teste/deploy bem-sucedido sem executar/verificar.

## Testes mínimos antes de PR

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests -q
cd ..\frontend
npm ci
npx tsc --noEmit
npm run build
```

Também rodar emulator rules e smoke/E2E conforme ambiente disponível. Depois conferir `git diff --check`, revisar alterações e documentar o resultado.

## Atualização do vault

Ao modificar regra de negócio, atualizar no mesmo PR:
- nota de domínio em `Regras de Negócio/`;
- fluxo de processo relevante;
- modelo de dados/API se contrato mudou;
- teste e rastreabilidade;
- [[Auditoria/Discrepâncias e Riscos]] se achado foi fechado ou surgiu outro.

## Formato de nota de regra

- ID e frase imperativa.
- Motivação/efeito esperado.
- Origem de verdade no código.
- Endpoints/roles afetados.
- Exceções e erros HTTP.
- Testes de regressão necessários.

## Wiki de uso — manutenção de telas novas

Nova tela/aba operacional deve incluir artigo estático, campos e efeitos das ações,
palavras-chave, mapeamento de rota/seção e AjudaContextual. Rodar `npm run wiki:indice`
e `npm run test:wiki` em frontend. Atualizar fontes no manifesto e conferir relacionados.
Ver [[Wiki-Central-de-Ajuda]]. Não armazenar artigos no Firestore ou expor dados reais na documentação.
