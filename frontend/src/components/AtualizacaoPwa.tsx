import { useCallback, useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Card } from './ui'
import {
  VERSAO_ATUAL, consultarVersaoPublicada, forcarAtualizacao, versaoDiferente,
} from '../lib/versaoApp'

/** Verifica versão estática publicada sem Firestore e sem interromper vendas. */
function useVersaoPublicada() {
  const [remota, setRemota] = useState<string | null>(null)
  const [erro, setErro] = useState(false)
  const verificar = useCallback(async () => {
    try {
      const versao = await consultarVersaoPublicada()
      setRemota(versao)
      setErro(false)
      return versao
    } catch {
      setErro(true)
      return null
    }
  }, [])
  useEffect(() => {
    void verificar()
    const intervalo = window.setInterval(() => { if (!document.hidden) void verificar() }, 60_000)
    const aoFoco = () => { if (!document.hidden) void verificar() }
    window.addEventListener('focus', aoFoco)
    document.addEventListener('visibilitychange', aoFoco)
    return () => {
      window.clearInterval(intervalo)
      window.removeEventListener('focus', aoFoco)
      document.removeEventListener('visibilitychange', aoFoco)
    }
  }, [verificar])
  return { remota, erro, verificar }
}

export function AtualizacaoPwa() {
  const { needRefresh } = useRegisterSW()
  const { remota } = useVersaoPublicada()
  const [oculto, setOculto] = useState(false)
  const disponivel = needRefresh[0] || versaoDiferente(remota)
  useEffect(() => { if (disponivel) setOculto(false) }, [remota, needRefresh[0]])
  if (!disponivel || oculto) return null
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[70] flex flex-wrap items-center justify-center gap-3 border-t border-brand-200 bg-white px-4 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <span className="text-sm text-slate-700 dark:text-slate-200">Nova versão do NexoComanda disponível</span>
      <button type="button" onClick={() => void forcarAtualizacao(remota ?? VERSAO_ATUAL)}
        className="min-h-10 rounded-md bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700">
        Atualizar agora
      </button>
      <button type="button" onClick={() => setOculto(true)}
        className="min-h-10 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
        Depois
      </button>
    </div>
  )
}

/** Opção de verificação e atualização manual acessível em Configurações. */
export function VersaoAppCard() {
  const { remota, erro, verificar } = useVersaoPublicada()
  const [verificando, setVerificando] = useState(false)
  const nova = versaoDiferente(remota)
  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-semibold">Versão do aplicativo</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">Instalada: {VERSAO_ATUAL.slice(0, 12)}</p>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {nova ? 'Existe uma atualização disponível.' : erro ? 'Não foi possível conferir a versão no servidor.' : remota ? 'Você está na versão mais recente.' : 'Versão remota ainda não verificada.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={verificando} onClick={async () => {
          setVerificando(true)
          try { await verificar() } finally { setVerificando(false) }
        }} className="min-h-10 rounded-md border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800">
          Verificar atualizações
        </button>
        <button type="button" onClick={() => void forcarAtualizacao(remota ?? VERSAO_ATUAL)}
          className="min-h-10 rounded-md px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800">
          Forçar atualização
        </button>
      </div>
      <p className="text-xs text-slate-500">A atualização é opcional durante uma venda. Salve seus dados antes de recarregar.</p>
    </Card>
  )
}
