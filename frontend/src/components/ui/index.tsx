import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

// ------------------------------------------------------------------ Button
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary:
    'bg-slate-200 text-slate-800 hover:bg-slate-300 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
}

export function Button({
  variant = 'primary',
  loading,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ Inputs
export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-brand-900/50 ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-brand-900/50 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-brand-900/50 ${className}`}
      {...props}
    />
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}

// ------------------------------------------------------------------ Card
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`}>{children}</div>
}

// ------------------------------------------------------------------ Badge
const badgeColors: Record<string, string> = {
  livre: 'bg-emerald-100 text-emerald-700',
  ocupada: 'bg-amber-100 text-amber-700',
  reservada: 'bg-sky-100 text-sky-700',
  inativa: 'bg-slate-200 text-slate-500',
  aberto: 'bg-amber-100 text-amber-700',
  pago: 'bg-emerald-100 text-emerald-700',
  cancelado: 'bg-rose-100 text-rose-700',
  pendente: 'bg-slate-200 text-slate-600',
  preparo: 'bg-sky-100 text-sky-700',
  pronto: 'bg-violet-100 text-violet-700',
  entregue: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-slate-200 text-slate-600',
  confirmed: 'bg-sky-100 text-sky-700',
  preparing: 'bg-amber-100 text-amber-700',
  ready: 'bg-violet-100 text-violet-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
  fechado: 'bg-slate-200 text-slate-500',
  admin: 'bg-violet-100 text-violet-700',
  gerente: 'bg-sky-100 text-sky-700',
  caixa: 'bg-emerald-100 text-emerald-700',
  garcom: 'bg-amber-100 text-amber-700',
  cozinha: 'bg-rose-100 text-rose-700',
}

export function Badge({ value, label }: { value: string; label?: string }) {
  const color = badgeColors[value] ?? 'bg-slate-100 text-slate-600'
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${color}`}>{label ?? value}</span>
}

// ------------------------------------------------------------------ Modal
export function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h2>
        {children}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Spinner / estados
export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-current border-t-transparent ${
        small ? 'h-3.5 w-3.5 border-2' : 'h-8 w-8 border-4 text-brand-600'
      }`}
    />
  )
}

export function LoadingScreen() {
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center gap-3 text-slate-400">
      <Spinner />
    </div>
  )
}

export function EmptyState({ icon = '📭', message }: { icon?: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
      <span className="text-4xl">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
      {error instanceof Error ? error.message : 'Erro ao carregar dados'}
    </div>
  )
}
