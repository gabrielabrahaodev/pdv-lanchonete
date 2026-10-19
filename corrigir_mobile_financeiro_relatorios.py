#!/usr/bin/env python3
"""Hotfix mobile-first para Financeiro e Relatórios do PDV Lanchoneta.

Roda na raiz do repositório. Valida TODOS os arquivos em memória antes de gravar,
cria backup temporário e aceita tanto classes antigas quanto algumas já responsivas.
"""
from __future__ import annotations

import re
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if not ((ROOT / "frontend/src/pages/financeiro/FinanceiroPage.tsx").is_file() and
        (ROOT / "frontend/src/pages/relatorios/RelatoriosPage.tsx").is_file()):
    candidates = [Path.cwd(), *Path.cwd().parents]
    ROOT = next((p for p in candidates if
                 (p / "frontend/src/pages/financeiro/FinanceiroPage.tsx").is_file() and
                 (p / "frontend/src/pages/relatorios/RelatoriosPage.tsx").is_file()), ROOT)

TARGETS = {
    "financeiro": ROOT / "frontend/src/pages/financeiro/FinanceiroPage.tsx",
    "relatorios": ROOT / "frontend/src/pages/relatorios/RelatoriosPage.tsx",
}


def once(text: str, pattern: str, replacement: str, label: str, *, flags: int = 0, required: bool = True) -> tuple[str, str]:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count == 0:
        if required:
            raise ValueError(f"não encontrei o trecho: {label}")
        return text, "já ajustado/ignorado: " + label
    return updated, "ajustado: " + label


def fix_financeiro(src: str) -> tuple[str, list[str]]:
    log: list[str] = []
    def edit(pat: str, rep: str, label: str, flags: int = 0, required: bool = True):
        nonlocal src
        src, msg = once(src, pat, rep, label, flags=flags, required=required)
        log.append(msg)

    # Conteúdo geral e grids não podem impor largura mínima ao viewport.
    edit(r'(<div className=")[^"]*("\s*>\s*<PageHeader title="Financeiro")',
         r'\1min-w-0 w-full max-w-full overflow-x-hidden p-3 sm:p-6\2', 'container da página')
    edit(r'<div className="grid (?:gap-6|min-w-0 gap-4 sm:gap-6|min-w-0 w-full max-w-full gap-4 sm:gap-6) lg:grid-cols-2">',
         '<div className="grid min-w-0 w-full max-w-full gap-4 sm:gap-6 lg:grid-cols-2">', 'grid principal')
    edit(r'<div className="(?:min-w-0 )?lg:col-span-2">', '<div className="min-w-0 lg:col-span-2">', 'coluna de despesas', required=False)
    edit(r'<Card className="(?:min-w-0 )?space-y-4 (?:p-6|p-4 sm:p-6)">',
         '<Card className="min-w-0 space-y-4 p-4 sm:p-6">', 'card do resumo mensal')
    edit(r'<div className="[^"]*rounded-xl bg-slate-50 [^"]*dark:bg-slate-800">',
         '<div className="flex min-w-0 flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-baseline sm:justify-between sm:p-4 dark:bg-slate-800">',
         'linha de receita', flags=0)
    edit(r'<li key=\{cat\} className="[^"]*">',
         '<li key={cat} className="flex min-w-0 flex-col gap-1 text-slate-600 sm:flex-row sm:justify-between dark:text-slate-300">',
         'linha de despesas por categoria')
    edit(r'<li className="[^"]*border-t border-slate-100 pt-1\.5 font-semibold text-slate-700[^"]*">',
         '<li className="flex min-w-0 flex-col gap-1 border-t border-slate-100 pt-1.5 font-semibold text-slate-700 sm:flex-row sm:justify-between dark:border-slate-700 dark:text-slate-200">',
         'linha total de despesas')
    edit(r'<div className="(?:flex items-baseline justify-between|flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between|flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between)">',
         '<div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">',
         'linha do resultado')
    edit(r'<span className=\{`text-3xl font-extrabold \$\{positivo \? \'text-emerald-600 dark:text-emerald-400\' : \'text-rose-600 dark:text-rose-400\'\}`}\s*>',
         '<span className={`break-words text-2xl font-extrabold tabular-nums sm:text-3xl ${positivo ? \'text-emerald-600 dark:text-emerald-400\' : \'text-rose-600 dark:text-rose-400\'}`}>',
         'valor do resultado', required=False)

    # Cabeçalho/controles das despesas: em telas estreitas ocupam linhas próprias.
    edit(r'<div className="[^"]*border-b border-slate-100 (?:px-5 py-4|px-3 py-4|px-3 py-3) [^"]*dark:border-slate-800">',
         '<div className="flex min-w-0 flex-col items-stretch gap-2 border-b border-slate-100 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-5 sm:py-4 dark:border-slate-800">',
         'cabeçalho da lista de despesas', required=False)
    # Duas listas suspensas de filtro: largura total no celular.
    src, n = re.subn(r'className="!w-auto !py-1\.5 !text-xs"',
                     'className="w-full !py-2 !text-xs sm:!w-auto sm:!py-1.5"', src)
    log.append(f"ajustados: filtros de despesas ({n})" if n else "filtros de despesas já ajustados/ignorados")

    # Reconstrói cada linha de despesa como cartão no celular; mantém os handlers originais.
    expense_pattern = r'<li key=\{d\.id\} className="[^"]*">\s*<div className="min-w-0 flex-1">.*?</li>'
    expense_replacement = '''<li key={d.id} className="flex min-w-0 flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-slate-700 dark:text-slate-200">{d.descricao}</p>
                <p className="break-words text-xs text-slate-500">
                  {labelCategoria(d.categoria)} · competência {dataHora(d.data)}
                  {d.status === 'pago' && ` · paga em ${dataHora(d.pagoEm)}`}
                </p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:shrink-0 sm:justify-end">
                <Badge value={d.status} />
                <span className={`shrink-0 text-sm font-bold tabular-nums ${d.status === 'pago' ? 'text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
                  {brl(d.valor)}
                </span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {d.status === 'pendente' ? (
                    <button onClick={() => pagar.mutate(d.id)} disabled={pagar.isPending} className="min-h-9 text-xs font-semibold text-emerald-600 hover:underline disabled:opacity-50">Marcar paga</button>
                  ) : (
                    <button onClick={() => reabrir.mutate(d.id)} disabled={reabrir.isPending} className="min-h-9 text-xs font-semibold text-sky-600 hover:underline disabled:opacity-50">Reabrir</button>
                  )}
                  <button onClick={() => abrirEdicao(d)} className="min-h-9 text-xs font-semibold text-brand-600 hover:underline">Editar</button>
                  <button onClick={() => window.confirm(`Excluir "${d.descricao}"?`) && excluir.mutate(d.id)} className="min-h-9 text-xs font-semibold text-rose-400 hover:text-rose-600">Excluir</button>
                </div>
              </div>
            </li>'''
    edit(expense_pattern, expense_replacement, 'estrutura responsiva das linhas de despesas', flags=re.S)

    # Fornecedores: deixar conteúdo e ações quebrarem sem empurrar a página para a direita.
    edit(r'<li key=\{f\.id\} className="[^"]*">',
         '<li key={f.id} className="flex min-w-0 flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:px-5">',
         'linha de fornecedor')
    edit(r'<div className="grid grid-cols-2 gap-3">',
         '<div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">',
         'formulário responsivo de fornecedor', required=False)
    # Modais de despesas: aceitar um campo por linha em telas muito estreitas.
    src, n = re.subn(r'<div className="grid grid-cols-2 gap-3">',
                     '<div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">', src)
    log.append(f"ajustados: grids de formulários ({n})" if n else "grids de formulários já ajustados/ignorados")
    return src, log


def fix_relatorios(src: str) -> tuple[str, list[str]]:
    log: list[str] = []
    def edit(pat: str, rep: str, label: str, flags: int = 0, required: bool = True):
        nonlocal src
        src, msg = once(src, pat, rep, label, flags=flags, required=required)
        log.append(msg)

    edit(r'(<div className=")[^"]*("\s*>\s*<PageHeader\s*\n\s*title="Relatórios")',
         r'\1min-w-0 w-full max-w-full overflow-x-hidden p-3 sm:p-6\2', 'container da página')
    edit(r'<div className="(?:grid gap-3 sm:grid-cols-2|grid min-w-0 grid-cols-1 gap-3 min-\[380px\]:grid-cols-2|grid min-w-0 grid-cols-1 gap-3 min-\[380px\]:grid-cols-2) xl:grid-cols-4">',
         '<div className="grid min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-2 xl:grid-cols-4">',
         'grade de indicadores')
    edit(r'<div className="(?:mt-6 grid gap-4|mt-4 grid min-w-0 gap-4 sm:mt-6|mt-4 grid min-w-0 w-full max-w-full gap-4 sm:mt-6) lg:grid-cols-2">',
         '<div className="mt-4 grid min-w-0 gap-4 sm:mt-6 lg:grid-cols-2">', 'grade dos gráficos')

    # Encontra o Card pelo título, mesmo se o h3 estiver dentro de um wrapper
    # (como na versão local compartilhada pelo usuário). Substitui somente esse Card.
    heading = re.search(r'<h3\b[^>]*>\s*Vendas por hora\s*</h3>', src, flags=re.I)
    if heading:
        card_start = src.rfind('<Card', 0, heading.start())
        card_end_start = src.find('</Card>', heading.end())
        if card_start < 0 or card_end_start < 0:
            raise ValueError('encontrei o título “Vendas por hora”, mas não consegui delimitar seu cartão')
        card_end = card_end_start + len('</Card>')
        replacement = r"""<Card className="min-w-0 w-full max-w-full overflow-hidden p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Vendas por hora</h3>
            <span className="text-xs text-slate-500">Deslize para ver todas as horas.</span>
          </div>
          {maxHora <= 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500">Sem vendas no período.</div>
          ) : (
            <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain pb-1">
              <div className="flex h-44 w-max min-w-full items-end gap-2 px-1 pb-1">
                {horas.map(([hora, rawValor]) => {
                  const valor = Number(rawValor) || 0
                  const alturaPx = valor > 0 ? Math.max(3, (valor / maxHora) * 124) : 2
                  return (
                    <div
                      key={hora}
                      className="flex h-full w-6 shrink-0 flex-col items-center justify-end"
                      title={`${hora}h — ${brl(valor)}`}
                      aria-label={`${hora} horas: ${brl(valor)}`}
                    >
                      <div className="flex h-[128px] w-full items-end justify-center">
                        <div
                          className="w-5 rounded-t bg-brand-500 transition-colors hover:bg-brand-600"
                          style={{ height: `${alturaPx}px`, opacity: valor > 0 ? 1 : 0.15 }}
                        />
                      </div>
                      <span className="mt-1 shrink-0 text-[10px] text-slate-500">{hora}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Card>"""
        src = src[:card_start] + replacement + src[card_end:]
        log.append('ajustado: gráfico de vendas por hora com rolagem interna')
    elif 'w-max min-w-full items-end gap-2' in src and 'Deslize para ver todas as horas.' in src:
        log.append('gráfico de vendas por hora já ajustado')
    else:
        raise ValueError('não encontrei o título “Vendas por hora” no cartão dos relatórios')

    # Long labels and amounts must be allowed to wrap inside the viewport.
    edit(r'<div className="mb-1 flex justify-between text-sm">',
         '<div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">',
         'rótulos de formas de pagamento', required=False)
    edit(r'<span className="w-32 truncate font-semibold text-slate-700">',
         '<span className="w-24 shrink-0 truncate font-semibold text-slate-700 sm:w-32">',
         'largura dos nomes no ranking', required=False)
    return src, log


def main() -> int:
    missing = [str(p) for p in TARGETS.values() if not p.is_file()]
    if missing:
        print("ERRO: não encontrei os arquivos esperados:", *missing, sep="\n - ", file=sys.stderr)
        return 2

    originals = {name: path.read_text(encoding="utf-8") for name, path in TARGETS.items()}
    try:
        changed: dict[str, str] = {}
        logs: dict[str, list[str]] = {}
        changed["financeiro"], logs["financeiro"] = fix_financeiro(originals["financeiro"])
        changed["relatorios"], logs["relatorios"] = fix_relatorios(originals["relatorios"])
    except ValueError as exc:
        print(f"Não apliquei alterações: {exc}\nNenhum arquivo foi modificado.", file=sys.stderr)
        return 3

    if all(changed[name] == originals[name] for name in originals):
        print("Os ajustes-alvo já parecem estar aplicados; nenhum arquivo foi alterado.")
        for name in logs:
            print(f"\n{name}:")
            for entry in logs[name]: print(f" - {entry}")
        return 0

    backup_root = Path(tempfile.mkdtemp(prefix="pdv-mobile-financeiro-backup-"))
    for name, path in TARGETS.items():
        backup_root.joinpath(path.name).write_text(originals[name], encoding="utf-8")

    # Write only after all edits and validations pass.
    for name, path in TARGETS.items():
        if changed[name] != originals[name]:
            temp = path.with_suffix(path.suffix + ".mobile-tmp")
            temp.write_text(changed[name], encoding="utf-8", newline="")
            temp.replace(path)

    print("Ajustes mobile aplicados aos arquivos:")
    for name, path in TARGETS.items():
        print(f"\n{path.relative_to(ROOT)}:")
        for entry in logs[name]: print(f" - {entry}")
    print(f"\nBackup original salvo em: {backup_root}")
    print("Próximo passo: entre em frontend e execute npm run build.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
