# Visual do sistema — PR #30

## Testar no Windows

Na raiz Git (pasta `python`), com alterações locais salvas:

```powershell
git fetch origin
git switch feat/estoque-visual-piloto
git pull --ff-only
```

Terminal 1, partindo da raiz:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

Terminal 2, partindo da raiz:

```powershell
cd frontend
npm ci
npm run dev
```

Abrir http://localhost:5173. O backend precisa estar disponível em 8000: `ECONNREFUSED` no proxy indica que ele não iniciou. Use as credenciais locais existentes; nenhuma configuração Firebase foi modificada.

## Avaliação

- Comparar Caixa, Mesas, Produtos/cadastro/precificação, Categorias, Produção, Estoque, Reposição e históricos, Cozinha, Delivery, Financeiro, Relatórios, Fornecedores, Minha conta, Configurações, Wiki e Plataforma.
- Em celular: rótulos dos registros, textos longos, ações sem rolagem horizontal, filtros com quebra natural e comanda sempre acessível pela barra fixa. Desktop: tabelas compactas e hierarquia das ações.
- Alternar claro/escuro. Abrir formulário, digitar, fechar com Escape e conferir que foco/comportamento continuam corretos.
- Conferir a tela de pagamento e as seções do Financeiro. Fórmulas e regras permanecem iguais.
- Login/convite e cardápio público conservam finalidade e isolamento próprios.

## Validação automatizada

`npm run test:visual:ui`, com `PLAYWRIGHT_MODULE` apontando para Playwright 1.51.1 e Chromium instalado. O CI reutiliza a instalação temporária dos testes Wiki, sem dependência nova.

Teste usa componentes e rotas reais, Auth/API/listeners simulados e bloqueia rede externa. Percorre 27 telas em 320/390/768/1024/1440px nos dois temas, verifica a rota efetiva, overflow, ausência de controles interativos aninhados, adaptação de Categorias, edição no modal e comanda móvel/lateral. Fixtures incluem cadastros, sessão aberta/fechada, fila e delivery histórico. Não usa o banco real. Complementa os testes existentes de Estoque (operações simuladas e retry idempotente), Wiki (rotas/rascunhos/abas/PWA), foco e cálculos.

A inspeção automatizada não substitui aprovação visual nem homologação com dados/dispositivo do cliente.

## Voltar ao visual anterior

Parar o frontend, voltar à raiz e executar `git switch master`. Reiniciar o frontend. Isso troca o código visual; vendas e movimentos que você confirmou no banco continuam registrados.

Resultados locais: TypeScript/build PWA, 44 testes existentes, Estoque UI e Wiki UI aprovados. Varredura visual das 27 telas passou nas cinco larguras nos dois temas. Comparação AST confirma as mesmas chamadas API, mutations, queries e efeitos nos 27 arquivos de telas alterados. Nenhuma escrita real no Firebase.
