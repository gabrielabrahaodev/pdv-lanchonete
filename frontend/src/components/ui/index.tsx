import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Inbox } from 'lucide-react'

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
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed dark:focus-visible:ring-offset-slate-900 ${variants[variant]} ${className}`}
      {...props}
      disabled={loading || props.disabled}
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

export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string
  required?: boolean
  error?: string | null
  hint?: string | null
  children: ReactNode
}) {
  const id = useId()
  const erroId = `${id}-erro`
  const ajudaId = `${id}-ajuda`
  const describedBy = [error ? erroId : null, hint ? ajudaId : null].filter(Boolean).join(' ') || undefined
  const controle =
    isValidElement(children) && typeof children !== 'string'
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
        })
      : children
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-rose-500">
            *
          </span>
        )}
        {required && <span className="sr-only">(obrigatório)</span>}
      </span>
      {controle}
      {hint && !error && (
        <span id={ajudaId} className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      )}
      {error && (
        <span id={erroId} role="alert" className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-300">
          {error}
        </span>
      )}
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
  const tituloId = useId()
  const caixaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      // armadilha de foco simples: circula o Tab dentro do diálogo
      if (e.key === 'Tab' && caixaRef.current) {
        const alvos = Array.from(
          caixaRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null)
        if (!alvos.length) return
        const primeiro = alvos[0]
        const ultimo = alvos[alvos.length - 1]
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault()
          ultimo.focus()
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault()
          primeiro.focus()
        }
      }
    }
    document.addEventListener('keydown', aoTeclar, true)
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // foca o primeiro controle ao abrir
    const t = window.setTimeout(() => {
      caixaRef.current
        ?.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        ?.focus()
    }, 0)
    return () => {
      document.removeEventListener('keydown', aoTeclar, true)
      document.body.style.overflow = anterior
      window.clearTimeout(t)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={tituloId} className="mb-4 text-lg font-bold text-slate-800 dark:text-slate-100">
          {title}
        </h2>
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
    <div className="flex h-full min-h-[50vh] items-center justify-center gap-3 text-slate-500">
      <Spinner />
    </div>
  )
}

export function EmptyState({ icon, message }: { icon?: ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
      {typeof icon === 'string' ? (
        <span aria-hidden="true" className="text-4xl">
          {icon}
        </span>
      ) : (
        (icon ?? <Inbox className="h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden="true" />)
      )}
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function ErrorState({ error, onRetry, retryLabel = 'Tentar novamente' }: { error: unknown; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
      <p role="alert">{error instanceof Error ? error.message : 'Erro ao carregar dados'}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
