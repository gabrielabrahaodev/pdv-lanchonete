import type { ButtonHTMLAttributes } from 'react'
import { AlertTriangle, Archive, Check, CircleX } from 'lucide-react'
import type { InventoryItem } from '../../types'

/** Estados específicos do Estoque, alinhados ao padrão visual compartilhado. */
export function BotaoEstoque({
  destaque = false,
  ativo = false,
  realce = false,
  somenteIcone = false,
  compacto = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  destaque?: boolean
  ativo?: boolean
  realce?: boolean
  somenteIcone?: boolean
  compacto?: boolean
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center ${compacto ? 'gap-1.5 text-xs' : 'gap-2 text-sm'} rounded-xl border ${somenteIcone ? 'px-0' : compacto ? 'px-2' : 'px-3'} font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-9 lg:min-w-9 lg:rounded-lg ${
        destaque
          ? 'border-brand-700 bg-brand-700 text-white hover:border-brand-800 hover:bg-brand-800'
          : ativo
            ? 'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-900/25 dark:text-brand-200'
            : realce
              ? 'border-brand-200 bg-brand-50/40 text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:bg-slate-900 dark:text-brand-300 dark:hover:bg-slate-800'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
      } ${className}`}
    />
  )
}

export function SituacaoEstoque({ item }: { item: InventoryItem }) {
  const arquivado = item.ativo === false
  const alerta = !arquivado && item.quantidadeAtual <= item.minimo
  const zerado = alerta && item.quantidadeAtual <= 0
  const Icone = arquivado
    ? Archive
    : zerado
      ? CircleX
      : alerta
        ? AlertTriangle
        : Check
  const texto = arquivado
    ? 'Arquivado'
    : zerado
      ? 'Sem saldo'
      : alerta
        ? 'Saldo baixo'
        : 'Em dia'
  const cor = arquivado
    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
    : zerado
      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
      : alerta
        ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
        : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${cor}`}
    >
      <Icone className="h-3 w-3 shrink-0" aria-hidden="true" />
      {texto}
    </span>
  )
}
