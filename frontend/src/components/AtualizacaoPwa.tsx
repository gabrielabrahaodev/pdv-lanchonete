import { useRegisterSW } from 'virtual:pwa-register/react'

/** Banner discreto quando uma nova versão do PWA está pronta.
 *  Não recarrega sozinho (não interrompe venda em andamento) — o usuário decide. */
export function AtualizacaoPwa() {
  const { needRefresh, updateServiceWorker } = useRegisterSW()

  if (!needRefresh[0]) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex items-center justify-center gap-3 border-t border-brand-200 bg-white px-4 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <span className="text-sm text-slate-600 dark:text-slate-300">🚀 Nova versão disponível</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        Atualizar agora
      </button>
    </div>
  )
}
