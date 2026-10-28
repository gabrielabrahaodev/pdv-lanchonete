# Modal compartilhado — estabilidade do foco (2026-10-28)

## Incidente

Na tela **Financeiro → Fornecedores → Novo fornecedor**, digitar em CPF/CNPJ, telefone, e-mail ou observações levava o cursor de volta para **Nome** depois de cada alteração.

## Causa raiz

Em `frontend/src/components/ui/index.tsx`, o componente `Modal` possui um efeito responsável pelo autofocus inicial e pelo trap de teclado. O efeito dependia de `[open, onClose]`. Nos formulários, o pai cria `onClose={() => setAberto(false)}` dentro do render; como o `onChange` dos inputs provoca render novamente, a função `onClose` ganha outra identidade e reinicia o efeito, que agenda `focus()` no primeiro input.

## Correção

- O autofocus e o gerenciamento do listener de teclado só reagem ao estado `open`.
- A função de fechamento fica acessível em `onCloseRef.current`, atualizada a cada render, inclusive para Escape. Isso impede callback obsoleto.
- Preservados fechamento no backdrop, armadilha de tabulação, scroll lock do body e foco inicial ao abrir.
- Regressão estática TypeScript AST executada no CI para impedir `onClose` voltar à lista de dependências inadvertidamente.

## Homologação

1. Abrir Financeiro → + Fornecedor; preencher Nome, CPF/CNPJ, Telefone, E-mail e Observações, digitando vários caracteres em cada um. Confirmar que o foco permanece no campo digitado.
2. Editar fornecedor existente e repetir o teste.
3. Repetir em **Estoque → Novo insumo**, **Configurações** e outros modais que usam o componente compartilhado.
4. Verificar foco inicial ao abrir; Tab/Shift+Tab permanecem dentro do modal; Escape fecha; clique no fundo fecha.
5. Testar desktop/mobile, tema claro/escuro, sem atualizar banco até o usuário confirmar Salvar.

A correção é restrita ao frontend e não altera fornecedores, dados ou APIs.
