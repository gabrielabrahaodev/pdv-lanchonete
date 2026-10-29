# Estoque: piloto visual reversível

Base master `3fed252835d7513947b2641aafafae972eec1579`.
Branch `feat/estoque-visual-piloto`. Alteração de apresentação da tela `/estoque`.
Sem mudança de backend, schema, regras Firestore ou operações produtivas durante desenvolvimento.

## O que avaliar

- Desktop: lista aproveita a largura, números à direita, ações compactas e cores de alerta leves.
- Celular: busca, filtros e CSV reunidos; botões de toque com pelo menos44px,
  quantidade/unidade/custo legíveis e ações na mesma linha.
- Resumo: ativos, alertas e arquivados do conjunto carregado, independente dos filtros.
- Atividade recente acessível em Últimas movimentações, abaixo da lista.
- Mesmo cadastro/movimentação/histórico com regras e permissões existentes.

## Rodar no Windows (PowerShell)

Na raiz Git, pasta `python`:

```powershell
git fetch origin
git switch feat/estoque-visual-piloto
git pull --ff-only
```

Primeiro terminal, backend:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Mantenha aberto. Segundo terminal, a partir da raiz `python`:

```powershell
cd frontend
npm ci
npm run dev
```

Abra http://localhost:5173/estoque com seu login. O backend precisa responder na8000;
sem ele, `/api/auth/me` falha e o restaurante não carrega. `/ready` permite verificar
a conexão do backend com o Firebase configurado.

Use um ambiente de teste para operações de escrita. Frontend/backend locais podem
estar configurados para os dados reais; a branch não cria uma cópia do banco.
Para avaliar só aparência, navegue, busque e filtre sem confirmar lançamentos.

## Voltar ao visual anterior

Pare o frontend com Ctrl+C; da raiz Git, com árvore limpa:

```powershell
git switch master
```

Inicie novamente `npm run dev` em frontend. Isso desfaz a escolha do visual; não
estorna operações normais confirmadas no banco. Não é necessário reset, limpeza ou migração.

## Verificações automatizadas

- TypeScript, build Vite/PWA e suítes frontend existentes.
- `npm run test:estoque:ui`, com Playwright1.51.1 temporário (mesmo runner do CI).
- Componentes e roteador reais; Auth/Firestore/API simulados, sem credencial ou rede externa.
-320/360/390/430/768/1024/1440px, claro/escuro, nomes longos, saldo negativo e arquivados.
- Busca/filtros, vazio, CSV apenas da seleção, botões de toque, ausência de overflow da página.
- Histórico consultado só ao abrir, edição do item e atividade recente expansível.
- Entrada2kg/R$16: payload comercial mantido; falha simulada e repetição com mesma chave/corpo.
- Arquivar mantém PATCH ativo:false; cadastro mantém POST original; papel garçom sem ações de gestão.

Teste visual automatizado não substitui sua aprovação do desenho. A PR deve permanecer
em rascunho até você testar. Nenhum deploy está autorizado por este piloto.

## Resultado local

TypeScript/build PWA aprovados. Passaram os44 testes frontend existentes (incluindo
Wiki/CRLF), o verificador de chunks da Wiki e o novo teste de interface com CI=true.
UI verificada nas7 larguras acima e em ambos os temas, com asserções de filtros,
CSV, histórico, permissões, criação/arquivamento simulados e repetição idempotente.
Conferida a árvore sintática das operações de Cadastro/Movimentar contra a master:
estado, requests e callbacks preservados; diferenças de formatação não mudam a lógica.
O aviso preexistente de chunk Firebase maior que500kB permanece.

Capturas foram inspecionadas após estabilizar as transições de tema. CI remoto deve
ser conferido na PR; aprovação visual pessoal e homologação com dados de teste ficam
para o usuário. Nenhum teste desta implementação gravou no Firebase real.


A PR #30 também foi estendida às demais telas, por solicitação do usuário. O roteiro geral está em `docs/04-testes/visual-sistema.md`; a branch de teste e os dois terminais continuam os mesmos.
