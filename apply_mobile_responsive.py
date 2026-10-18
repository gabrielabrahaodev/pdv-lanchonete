#!/usr/bin/env python3
"""Aplica ajustes mobile-first no frontend do PDV Lanchonete.

Uso: salve este arquivo na raiz do repositório e execute:
    py apply_mobile_responsive.py

O script valida todos os trechos ANTES de modificar arquivos. Cria backup
fora do repositório e aborta se a versão local divergir demais da versão-alvo.
"""
from __future__ import annotations

import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
if not (ROOT / "frontend" / "src").is_dir() or not (ROOT / "backend").is_dir():
    candidates = [Path.cwd(), *Path.cwd().parents]
    ROOT = next((p for p in candidates if (p / "frontend" / "src").is_dir() and (p / "backend").is_dir()), ROOT)
if not (ROOT / "frontend" / "src").is_dir():
    print("ERRO: não encontrei a raiz do projeto (preciso ver frontend/src e backend).", file=sys.stderr)
    sys.exit(2)

# Cada edição é (trecho_antigo, trecho_novo). Todas são verificadas antes
# de qualquer escrita para evitar mudanças parciais em uma versão diferente.
EDITS: dict[str, list[tuple[str, str]]] = {
    "frontend/src/components/layout/AppLayout.tsx": [
        (
            'className="relative flex h-full"',
            'className="relative flex h-full min-h-0"',
        ),
        (
            'className="h-full min-w-0 flex-1 overflow-y-auto"',
            'className="h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"',
        ),
        (
            '''export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}''',
            '''export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex min-w-0 flex-col gap-3 sm:mb-6 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 pl-14 md:pl-0">
        <h1 className="break-words text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto md:shrink-0">{actions}</div>}
    </div>
  )
}''',
        ),
    ],
    "frontend/src/components/ui/index.tsx": [
        (
            'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold',
            'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold',
        ),
        (
            'className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"',
            'className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6 dark:bg-slate-900"',
        ),
    ],
    "frontend/src/pages/estoque/EstoquePage.tsx": [
        ('<div className="p-6">', '<div className="p-3 sm:p-6">'),
        ('<div className="overflow-x-auto">', '<div className="hidden overflow-x-auto sm:block">'),
        (
            r'''          </table>
          </div>
          {(itens.data ?? []).length === 0 && (''',
            r'''          </table>
          </div>
          <div className="space-y-3 p-3 sm:hidden">
            {(itens.data ?? []).map((item) => {
              const alerta = item.quantidadeAtual <= item.minimo
              return (
                <div key={item.id} className={`rounded-lg border p-3 ${alerta ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-500/5' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-slate-800 dark:text-slate-100">{item.nome}</p>
                      <p className={`mt-1 text-sm font-bold ${alerta ? 'text-rose-600' : 'text-emerald-600'}`}>
                        Saldo: {item.quantidadeAtual} {item.unidade}{alerta && ' ⚠️'}
                      </p>
                    </div>
                    <Button variant="secondary" className="shrink-0 !px-3 !text-xs" onClick={() => setMovItem(item)}>
                      Movimentar
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                    <span>Mínimo: {item.minimo} {item.unidade}</span>
                    <span>Custo médio: {brl(item.custoMedio)}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {(itens.data ?? []).length === 0 && (''',
        ),
        (
            '  const movimentacoes = useMovimentacoes(me?.restaurantId)\n',
            '  const movimentacoes = useMovimentacoes(me?.restaurantId)\n  const nomesEstoque = new Map<string, string>((estoqueQ.data ?? []).map((item) => [item.id, `${item.nome} (${item.unidade})`] as const))\n',
        ),
        (
            '<li key={m.id} className="flex items-center justify-between px-5 py-2.5 text-sm">',
            '<li key={m.id} className="flex min-w-0 items-start justify-between gap-2 px-3 py-2.5 text-sm sm:items-center sm:px-5">',
        ),
        (
            '''                <div>
                  <Badge value={m.tipo} />
                  <span className="ml-2 text-xs text-slate-500">{dataHora(m.criadoEm)}</span>
                </div>''',
            '''                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge value={m.tipo} />
                    <span className="text-[11px] text-slate-500">{dataHora(m.criadoEm)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {nomesEstoque.get(m.itemId) ?? `Item ${m.itemId}`}
                  </p>
                </div>''',
        ),
    ],
    "frontend/src/pages/relatorios/RelatoriosPage.tsx": [
        ('<div className="p-6">', '<div className="p-3 sm:p-6">'),
        (
            '''<div className="flex h-40 items-end gap-1">
            {Object.entries(r.vendasPorHora).map(([hora, valor]) => (
          <div key={hora} className="group flex flex-1 flex-col items-center justify-end" title={`${hora}h — ${brl(valor)}`}>
              <span className="mb-0.5 block text-[9px] font-bold tabular-nums text-brand-600">
                {valor > 0 ? brl(valor).replace('R$', '').trim() : ''}
              </span>
                <div
                  className="w-full rounded-t bg-brand-500 transition group-hover:bg-brand-600"
                  style={{ height: `${Math.max(2, (valor / maxHora) * 100)}%`, opacity: valor > 0 ? 1 : 0.15 }}
                />
                <span className="mt-1 text-[9px] text-slate-500">{hora}</span>
              </div>
            ))}
          </div>''',
            '''<div className="overflow-x-auto pb-1">
            <div className="flex h-36 min-w-[560px] items-end gap-1">
              {Object.entries(r.vendasPorHora).map(([hora, valor]) => (
                <div key={hora} className="group flex h-full min-w-0 flex-1 items-end justify-center" title={`${hora}h — ${brl(valor)}`}>
                  <div
                    className="w-full rounded-t bg-brand-500 transition group-hover:bg-brand-600"
                    style={{ height: `${Math.max(valor > 0 ? 3 : 1, (valor / maxHora) * 100)}%`, opacity: valor > 0 ? 1 : 0.15 }}
                  />
                </div>
              ))}
            </div>
            <div className="flex min-w-[560px] gap-1">
              {Object.keys(r.vendasPorHora).map((hora) => (
                <span key={hora} className="min-w-0 flex-1 text-center text-[9px] text-slate-500">{hora}</span>
              ))}
            </div>
          </div>''',
        ),
    ],
    "frontend/src/pages/financeiro/FinanceiroPage.tsx": [
        ('<div className="p-6">', '<div className="p-3 sm:p-6">'),
        ('<Card className="space-y-4 p-6">', '<Card className="space-y-4 p-4 sm:p-6">'),
        (
            '<div className="flex items-baseline justify-between rounded-xl bg-slate-50 p-4 dark:bg-slate-800">',
            '<div className="flex flex-col gap-1 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-baseline sm:justify-between dark:bg-slate-800">',
        ),
        (
            '<li key={cat} className="flex justify-between text-slate-600 dark:text-slate-300">',
            '<li key={cat} className="flex flex-col gap-1 text-slate-600 sm:flex-row sm:justify-between dark:text-slate-300">',
        ),
        (
            '<li className="flex justify-between border-t border-slate-100 pt-1.5 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">',
            '<li className="flex flex-col gap-1 border-t border-slate-100 pt-1.5 font-semibold text-slate-700 sm:flex-row sm:justify-between dark:border-slate-700 dark:text-slate-200">',
        ),
        ('<div className="flex items-baseline justify-between">', '<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">'),
        (
            '<li key={d.id} className="flex items-center gap-3 px-5 py-3">',
            '<li key={d.id} className="flex min-w-0 items-start gap-2 px-3 py-3 sm:items-center sm:gap-3 sm:px-5">',
        ),
        (
            '<div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">',
            '<div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-slate-800">',
        ),
        (
            '<li key={f.id} className="flex items-center gap-3 px-5 py-3">',
            '<li key={f.id} className="flex min-w-0 items-start gap-2 px-3 py-3 sm:items-center sm:gap-3 sm:px-5">',
        ),
        ('<div className="grid grid-cols-2 gap-3">', '<div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">'),
    ],
    "frontend/src/pages/relatorios/FechamentoCaixaPage.tsx": [
        ('<div className="p-6">', '<div className="p-3 sm:p-6">'),
        ('<Card className="mb-6 p-6">', '<Card className="mb-4 p-4 sm:mb-6 sm:p-6">'),
        (
            '<div className="mb-4 flex items-center justify-between">',
            '<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">',
        ),
    ],
    "frontend/src/pages/caixa/CaixaOverviewPage.tsx": [
        ('<div className="p-6">', '<div className="p-3 sm:p-6">'),
        (
            'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5',
            'grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5',
        ),
        ('<div className="flex items-start justify-between">', '<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">'),
    ],
    "frontend/src/pages/caixa/NovoPedidoPage.tsx": [
        ('<div className="flex-1 overflow-y-auto p-6">', '<div className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">'),
        (
            'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4',
            'grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4',
        ),
    ],
    "frontend/src/pages/caixa/PagamentoPage.tsx": [
        ('<div className="mx-auto max-w-2xl p-6">', '<div className="mx-auto w-full max-w-2xl p-3 sm:p-6">'),
        ('<div className="mt-4 flex justify-center gap-2">', '<div className="mt-4 flex flex-wrap justify-center gap-2">'),
        ('<div className="grid grid-cols-2 gap-3">', '<div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">'),
        ('<div className="flex gap-2">', '<div className="flex flex-wrap gap-2">'),
    ],
    "frontend/src/pages/caixa/MesaDetailPage.tsx": [
        ('<div className="mx-auto max-w-3xl p-6">', '<div className="mx-auto w-full max-w-3xl p-3 sm:p-6">'),
        ('<div className="mb-6 flex items-start justify-between">', '<div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">'),
        ('<div className="flex gap-2">', '<div className="flex flex-wrap gap-2">'),
    ],
    "frontend/src/pages/mesas/MesasPage.tsx": [
        ('<div className="p-6">', '<div className="p-3 sm:p-6">'),
        (
            'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6',
            'grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6',
        ),
        (
            '<div className="mt-3 flex items-center justify-between gap-1 text-xs font-semibold">',
            '<div className="mt-3 flex flex-col items-stretch justify-between gap-1 text-xs font-semibold min-[420px]:flex-row min-[420px]:items-center">',
        ),
    ],
    "frontend/src/pages/cozinha/CozinhaPage.tsx": [
        ('<div className="h-full overflow-y-auto bg-slate-900 p-5">', '<div className="h-full overflow-y-auto bg-slate-900 p-3 sm:p-5">'),
        (
            '<header className="mb-5 flex items-center justify-between">',
            '<header className="mb-5 flex flex-col gap-3 pl-14 sm:flex-row sm:items-center sm:justify-between sm:pl-0">',
        ),
    ],
    "frontend/src/pages/delivery/DeliveryPage.tsx": [
        ('<div className="p-6">', '<div className="p-3 sm:p-6">'),
        ('<div className="grid grid-cols-2 gap-3">', '<div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">'),
        ('<div className="flex items-center justify-between border-t border-slate-100 pt-3">', '<div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">'),
    ],
    "frontend/src/pages/produtos/ProdutosPage.tsx": [
        ('<div className="p-6">', '<div className="p-3 sm:p-6">'),
        ('<Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-64" />', '<Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full sm:w-64" />'),
        ('<Select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className="w-56">', '<Select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className="w-full sm:w-56">'),
        ('<div className="overflow-x-auto">\n          <table className="w-full min-w-[640px] text-sm">', '<div className="hidden overflow-x-auto sm:block">\n          <table className="w-full min-w-[640px] text-sm">'),
        (
            r'''        </table>
        </div>
        {lista.length === 0 && (''',
            r'''        </table>
        </div>
        <div className="space-y-3 p-3 sm:hidden">
          {lista.map((p) => (
            <article key={p.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex min-w-0 items-start gap-3">
                {p.temImagem ? (
                  <img src={urlImagemProduto(me?.restaurantId ?? '', p.id)} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                ) : (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm dark:bg-slate-800">🍽️</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="break-words font-semibold text-slate-800 dark:text-slate-100">{p.nome}</p>
                    <p className="shrink-0 font-bold text-brand-600">{brl(p.preco)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{(categorias.data ?? []).find((c) => c.id === p.categoriaId)?.nome ?? '—'}</p>
                  {p.variacoes?.length > 0 && <p className="mt-1 break-words text-xs text-slate-500">Variações: {p.variacoes.map((v) => v.nome).join(', ')}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button onClick={() => toggleAtivo.mutate(p)} disabled={toggleAtivo.isPending} className={`min-h-11 rounded-full px-3 py-1 text-xs font-bold ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                    {p.precisaPreparar === false && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700">Sem preparo</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link to={`/produtos/editar/${p.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-semibold text-brand-700 dark:bg-slate-800 dark:text-brand-300">Editar</Link>
                    <button onClick={() => window.confirm(`Excluir "${p.nome}"?`) && remover.mutate(p.id)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-rose-500 hover:bg-rose-50">Excluir</button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
        {lista.length === 0 && (''',
        ),
    ],
    "frontend/src/pages/produtos/ProdutoFormPage.tsx": [
        ('<div className="mx-auto max-w-3xl p-6">', '<div className="mx-auto w-full max-w-3xl p-3 sm:p-6">'),
        ('<Card className="space-y-4 p-6">', '<Card className="space-y-4 p-4 sm:p-6">'),
        ('<div className="grid grid-cols-2 gap-4">', '<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">'),
    ],
    "frontend/src/pages/produtos/CategoriasPage.tsx": [
        ('<div className="p-6">', '<div className="p-3 sm:p-6">'),
    ],
}


def fallback_edit(rel: str, idx: int, content: str) -> str | None:
    """Adapta diferenças de formatação conhecidas sem sobrescrever a página inteira."""
    import re

    # Se a versão local já resolve o nome do item por outro índice, não crie
    # um mapa redundante que poderia ficar sem uso no TypeScript.
    if rel == "frontend/src/pages/estoque/EstoquePage.tsx" and idx == 4:
        if "itemPorId" in content or "const nomeItem" in content or "itemMovimentado" in content:
            return content

    # Algumas versões locais já têm outra implementação responsiva do histórico
    # de estoque. Ajuste somente a classe do item de lista se necessário.
    if rel == "frontend/src/pages/estoque/EstoquePage.tsx" and idx == 5:
        match = re.search(r'(<li key={m\.id} className=")([^"]*)(">)', content)
        if not match:
            return None
        current = match.group(2)
        target = "flex min-w-0 items-start justify-between gap-2 px-3 py-2.5 text-sm sm:items-center sm:px-5"
        if current == target or ("min-w-0" in current and "items-start" in current and "gap-2" in current):
            return content
        return content[:match.start(2)] + target + content[match.end(2):]

    # Em versões locais, o JSX da movimentação tem nomeação/indentação diferente.
    # Se o nome já é renderizado, considere resolvido; caso contrário insira-o
    # depois da data da movimentação, sem substituir o bloco envolvente.
    if rel == "frontend/src/pages/estoque/EstoquePage.tsx" and idx == 6:
        if "nomesEstoque.get(m.itemId)" in content or "nomeItem" in content or "itemMovimentado" in content:
            return content
        pattern = re.compile(r'(?m)^(?P<indent>\s*)<span className="[^"\n]*">\{dataHora\(m\.criadoEm\)\}</span>')
        match = pattern.search(content)
        if not match:
            return None
        indent = match.group("indent")
        if "itemPorId" in content:
            name_expr = '{itemPorId.get(m.itemId)?.nome ?? `Item: ${m.itemId}`}'
        else:
            name_expr = '{nomesEstoque.get(m.itemId) ?? `Item: ${m.itemId}`} '
        addition = (
            match.group(0)
            + "\n"
            + indent
            + '<span className="mt-1 block max-w-[12rem] truncate text-xs font-semibold text-slate-700 dark:text-slate-200">'
            + name_expr.strip()
            + '</span>'
        )
        return content[:match.start()] + addition + content[match.end():]

    # Algumas cópias já receberam a correção do gráfico, mas usam variáveis
    # auxiliares (horas/alturaPx) em vez do JSX antigo esperado pela substituição.
    if rel == "frontend/src/pages/relatorios/RelatoriosPage.tsx" and idx == 2:
        if "horas.map(([hora, rawValor])" in content and "alturaPx" in content:
            return content
        if "min-w-[560px]" in content and "maxHora" in content:
            return content

    return None


def apply_file(rel: str, edits: list[tuple[str, str]], changed: dict[Path, str], errors: list[str]) -> None:
    path = ROOT / rel
    if not path.is_file():
        errors.append(f"Arquivo não encontrado: {rel}")
        return
    original = path.read_text(encoding="utf-8")
    content = original
    for idx, (old, new) in enumerate(edits, start=1):
        count = content.count(old)
        if count == 0:
            # Idempotência: se o trecho novo já existe, a edição foi aplicada antes.
            if new in content:
                continue
            fallback = fallback_edit(rel, idx, content)
            if fallback is not None:
                content = fallback
                continue
            errors.append(f"{rel}: edição {idx} não encontrou o trecho esperado")
            continue
        # Troca todas as ocorrências exatas do trecho; alguns formulários
        # repetem o mesmo grid (por exemplo, dois modais financeiros).
        content = content.replace(old, new)
    if content != original:
        changed[path] = content


def main() -> int:
    planned: dict[Path, str] = {}
    errors: list[str] = []
    for rel, edits in EDITS.items():
        apply_file(rel, edits, planned, errors)

    if errors:
        print("Não apliquei alterações porque alguns trechos não correspondem à sua versão local:")
        for error in errors:
            print(f" - {error}")
        print("Nenhum arquivo foi modificado. Confira a branch e a versão dos arquivos antes de tentar novamente.")
        return 1

    backup_root = Path(tempfile.mkdtemp(prefix="pdv-mobile-backup-"))
    for path in planned:
        rel = path.relative_to(ROOT)
        backup = backup_root / rel
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, backup)

    for path, content in planned.items():
        with path.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)

    print(f"Raiz: {ROOT}")
    print(f"Arquivos atualizados: {len(planned)}")
    for path in sorted(planned):
        print(f" - {path.relative_to(ROOT)}")
    print(f"Backup dos arquivos originais: {backup_root}")
    print("\nPróximo passo: cd frontend ; npm run build")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
