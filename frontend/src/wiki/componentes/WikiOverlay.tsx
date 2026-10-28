import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
/** Portal fora da aplicacao: formulario/modal de origem permanece montado e inert. */
export default function WikiOverlay({
  children,
  fechar,
}: {
  children: ReactNode
  fechar: () => void
}) {
  const ref = useRef<HTMLDivElement>(null),
    callback = useRef(fechar)
  callback.current = fechar
  useEffect(() => {
    const raiz = document.getElementById('root')
    const inert = raiz?.inert ?? false,
      overflow = document.body.style.overflow
    const anterior = document.activeElement as HTMLElement | null
    if (raiz) raiz.inert = true
    document.body.style.overflow = 'hidden'
    const teclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        callback.current()
        return
      }
      if (e.key !== 'Tab') return
      // Isola os listeners de modais da tela de origem.
      e.stopImmediatePropagation()
      const alvos = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]',
        ) ?? [],
      ).filter((x) => x.offsetParent !== null)
      const primeiro = alvos[0],
        ultimo = alvos[alvos.length - 1]
      if (!primeiro) return
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }
    window.addEventListener('keydown', teclado, true)
    const t = window.setTimeout(
      () =>
        ref.current
          ?.querySelector<HTMLElement>('button,a[href],input')
          ?.focus(),
      0,
    )
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', teclado, true)
      if (raiz) raiz.inert = inert
      document.body.style.overflow = overflow
      anterior?.focus()
    }
  }, [])
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wiki-titulo"
      className="fixed inset-0 z-[100] overflow-y-auto bg-slate-50 dark:bg-slate-950"
    >
      {children}
    </div>,
    document.body,
  )
}
