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
import { Link, type LinkProps } from 'react-router-dom'

// ------------------------------------------------------------------ Button
type Variant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'success'
  | 'selected'
const variants: Record<Variant, string> = {
  selected:
    'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-900/25 dark:text-brand-200',
  primary:
    'border-brand-700 bg-brand-700 text-white hover:border-brand-800 hover:bg-brand-800 disabled:opacity-40',
  secondary:
    'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
  danger:
    'border-rose-700 bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-40',
  success:
    'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-40',
  ghost:
    'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
}

/** Mesmo contrato visual para ações e navegação, sem controles interativos aninhados. */
export function buttonClasses(variant: Variant = 'primary', className = '') {
  return `pdv-button inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium no-underline transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed lg:min-h-9 lg:rounded-lg dark:focus-visible:ring-offset-slate-900 ${variants[variant]} ${className}`
}

export function ButtonLink({
  variant = 'primary',
  className = '',
  ...props
}: LinkProps & { variant?: Variant }) {
  return <Link {...props} className={buttonClasses(variant, className)} />
}

export function Button({
  variant = 'primary',
  loading,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
}) {
  return (
    <button
      className={buttonClasses(variant, className)}
      {...props}
      disabled={loading || props.disabled}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ Inputs
export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm lg:min-h-9 lg:rounded-lg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-900/50 ${className}`}
      {...props}
    />
  )
}

export function Select({
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`min-h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm lg:min-h-9 lg:rounded-lg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-900/50 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm lg:min-h-9 lg:rounded-lg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-900/50 ${className}`}
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
  const describedBy =
    [error ? erroId : null, hint ? ajudaId : null].filter(Boolean).join(' ') ||
    undefined
  const controle =
    isValidElement(children) && typeof children !== 'string'
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : undefined,
        })
      : children
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
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
        <span
          id={ajudaId}
          className="mt-1 block text-xs text-slate-500 dark:text-slate-400"
        >
          {hint}
        </span>
      )}
      {error && (
        <span
          id={erroId}
          role="alert"
          className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-300"
        >
          {error}
        </span>
      )}
    </label>
  )
}

// ------------------------------------------------------------------ Card
export function Card({
  className = '',
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`pdv-card min-w-0 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>
  )
}

// ------------------------------------------------------------------ Badge
const badgeColors: Record<string, string> = {
  ativo:
    'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  livre:
    'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  ocupada:
    'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  reservada: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  inativa: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  aberto: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  pago: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  cancelado: 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
  pendente: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  preparo: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  pronto:
    'bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
  entregue:
    'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  confirmed: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  preparing:
    'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  ready:
    'bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
  delivered:
    'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  cancelled: 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
  fechado: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  admin:
    'bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
  gerente: 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  caixa:
    'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  garcom: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  cozinha: 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
}

export function Badge({ value, label }: { value: string; label?: string }) {
  const color =
    badgeColors[value] ??
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ${color}`}
    >
      {label ?? value}
    </span>
  )
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
  // Callbacks inline mudam de identidade a cada digitação em formulários.
  // Referência atualizada sem reexecutar o efeito de foco do modal.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
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
    // O foco inicial e o listener pertencem ao ciclo abrir/fechar.
    // Não reexecutar por alterações de texto no conteúdo do modal.
  }, [open])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5 dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={tituloId}
          className="mb-4 text-lg font-bold text-slate-800 dark:text-slate-100"
        >
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

export function EmptyState({
  icon,
  message,
}: {
  icon?: ReactNode
  message: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-slate-500 dark:text-slate-400">
      {typeof icon === 'string' ? (
        <span aria-hidden="true" className="text-4xl">
          {icon}
        </span>
      ) : (
        (icon ?? (
          <Inbox
            className="h-10 w-10 text-slate-300"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        ))
      )}
      <p className="text-sm">{message}</p>
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  retryLabel = 'Tentar novamente',
}: {
  error: unknown
  onRetry?: () => void
  retryLabel?: string
}) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
      <p role="alert">
        {error instanceof Error ? error.message : 'Erro ao carregar dados'}
      </p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

/** Barra de busca/filtros com quebra natural e superfície igual à lista. */
export function FilterBar({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`mb-3 flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>
  )
}

export function SummaryStrip({
  items,
}: {
  items: { label: string; value: ReactNode; alert?: boolean }[]
}) {
  return (
    <dl className="mb-4 flex min-w-0 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white py-3 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 flex-1 px-3 sm:px-4">
          <dt className="text-xs text-slate-500 dark:text-slate-400">
            {item.label}
          </dt>
          <dd
            className={`mt-1 text-lg font-semibold tabular-nums ${item.alert ? 'text-amber-800 dark:text-amber-300' : 'text-slate-800 dark:text-slate-100'}`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
