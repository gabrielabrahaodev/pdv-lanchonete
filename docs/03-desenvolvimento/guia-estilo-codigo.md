# Guia de Estilo de Código — PDV Lanchonete v2

Padrões observados e obrigatórios no repositório. Novo código deve seguir este guia; revisões devem cobrar a aderência.

---

## 1. Backend (Python 3.12 / FastAPI)

### 1.1 Formatação
- Indentação de **4 espaços**; aspas duplas nas strings quando interpoladas, simples aceitas em literais curtos (padrão atual: mistura com predominância de duplas).
- Docstrings em português no topo de cada módulo explicando responsabilidade (`"""Pedidos: criação, itens e fechamento — preços sempre resolvidos no servidor."""`).
- Type hints modernos: `str | None`, `list[dict]`, `dict[str, Any]`; `from __future__ import annotations` em todos os módulos.
- Sem linting configurado no repo ainda — recomenda-se `ruff check app tests` + `ruff format` antes de commitar.

### 1.2 Arquitetura de arquivos
- **Router fino**: valida entrada (Pydantic/Depends), extrai `auth.restaurant_id/auth.uid`, delega ao service. Sem regra de negócio no router.
- **Service** concentra regras; funções module-level (não classes), estilo funcional do projeto.
- **base.py** é o único ponto de acesso bruto ao Firestore dos services.

### 1.3 Padrões obrigatórios
| Situação | Padrão |
|---|---|
| Transação | decorator `@transactional` do SDK Python; leitura via `next(iter(t.get(ref)), None)`; **fase 1 lê TODOS os docs, fase 2 executa TODAS as escritas** (Firestore proíbe ler depois de escrever — bug 10) |
| Criar doc | `stamp_create({...})` + `restaurantId` explícito no payload |
| Atualizar doc | `stamp_update({campos não-None})`; limpar campo → `DELETE_FIELD` |
| IDs | `new_id("prefixo_")` |
| Erros | `HTTPException(status, "mensagem clara em pt-BR")` — 409 conflitos de estado, 422 validação |
| Retorno | sempre reler o documento pós-operação (`obter(...)`) para resposta consistente |
| Lógica matemática | extrair para `calculos.py` (pura, testável) |
| Operação concorrida | transação própria (`abrir caixa`, `credit_sessao`) ou endpoint BULK quando o cliente dispararia N mutações no mesmo doc (cozinha) |

### 1.4 Modelos Pydantic
- Herdar `CamelModel`; campos opcionais `Optional[x] = None` para PATCH parcial.
- Validações declarativas (`Field(gt=0)`, `Literal[...]`) em vez de ifs manuais.
- Create/Update separados por entidade (`ProductCreate`, `ProductUpdate`).

### 1.5 Testes
- pytest sobre lógica pura apenas (sem Firestore); classes de teste agrupando cenários; nomes descritivos `test_soma_itens_nao_cancelados`.
- Rodar: `.venv\Scripts\python -m pytest tests -q`.

## 2. Frontend (TypeScript / React 18)

### 2.1 Estilo
- **Sem ponto-e-vírgula**, aspas simples, indentação 2 espaços, arrow functions, template literals.
- Componentes função + hooks; sem class components.
- Nomes: arquivos `PascalCase.tsx` para páginas/componentes, `camelCase.ts` para libs/hooks/contexto auxiliar.
- Tipos centralizados em `src/types/index.ts`; DTOs locais permitidos em libs específicas (ex.: `FilaItem` no KDS).

### 2.2 Dados e estado
- Toda chamada à API passa por `api<T>()` (nunca fetch cru); erros tratados como `ApiError`.
- Hooks de leitura em `hooks/useFirestore.ts` (um por tela, filtro de campo único, sem `refetchInterval`); escritas via `api()` sem `invalidate` (echo do snapshot cobre).
- Mutations invalidam chaves relacionadas no `onSuccess`, têm **`onError` visível obrigatório** em fluxo crítico (falha silenciosa parece "botão morto" — bug 11) e, quando dependem de estado volável, **revalidam no servidor dentro do `mutationFn`** em vez de confiar em cache react-query.
- Sem polling: novidade chega por evento; falha de listener vira banner + recarregar.

### 2.3 UI
- Design system próprio em `components/ui/index.tsx`: `Button, Card, Badge, Modal, Input, Select, Field, LoadingScreen, ErrorState, EmptyState...` — usar estes componentes, não recriar.
- Tailwind utilitário; cores de marca via classe `brand-*`; dark mode SEMPRE em par: `text-slate-700 dark:text-slate-200`.
- Ícones = emojis do menu padrão do projeto (🧾 🍔 📦 👨‍🍳 🛵 📊 💰 ⚙️).
- Acessibilidade básica: botões de ícone recebem `title` e `aria-label`.

### 2.4 Regras de negócio no cliente
O frontend NÃO duplica regras críticas: preços, totais, quitação e baixa de estoque são do servidor. Cálculos exibidos no cliente (troco, restante) são apenas auxiliares visuais.

## 3. Scripts TS Admin (`scripts/`)
- Node + firebase-admin; config central `CONFIG.serviceAccountPath`.
- Operações idempotentes (get-or-create) e logs claros por etapa.

## 4. Commits e revisão
- Mensagens curtas no imperativo, em português ou inglês consistente (`fix: pagamento minimalista 201`, `feat: baixa automática por receita`).
- Todo PR deve: passar `pytest -q`, `tsc && vite build` (frontend) e, se mexeu em fluxo core, rodar a suíte E2E de API. Regra permanente: **validar em localhost antes de qualquer deploy/push** (push em `master` dispara Render).
- Proibido commitar: `.env`, `service-account.json`, logs (`*.out.log`, `*.err.log`, `server.pid`), `node_modules`, `dist`, `.venv`.
- Dependências do stack GCP/Firebase: **pin exato** no `requirements.txt`; atualizar só em janela controlada com E2E contra produção logo depois (bug 12).

## 5. Documentação
- Novos endpoints/módulos: atualizar `design-tecnico.md` (tabela de endpoints) e `documento-requisitos.md`.
- Mudança de regra de negócio: atualizar `documento-regras-negocio.md` na mesma mudança.
