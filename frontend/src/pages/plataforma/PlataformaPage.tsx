import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Badge, Button, Card, LoadingScreen } from '../../components/ui'
import type { Convite, ConviteStatus } from '../../types'

const CORES_STATUS: Record<ConviteStatus, string> = {
  ativa: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  usada: 'bg-slate-100 text-slate-500 dark:bg-slate-700/40 dark:text-slate-400',
  expirada: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  revogada: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

function dataCurta(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function PlataformaPage() {
  const { fbUser, me, loading, logout } = useAuth()
  if (loading || (fbUser && !me)) return <LoadingScreen />
  if (!fbUser) return <Navigate to="/login" replace />
  if (!me?.souDono) return <Navigate to={me?.restaurantId ? '/caixa' : '/select-restaurant'} replace />

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <div className="mx-auto max-w-3xl space-y-4 py-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-600 text-xl text-white shadow-lg">🛰️</div>
            <div>
              <h1 className="text-lg font-bold text-white">Plataforma</h1>
              <p className="text-xs text-slate-300">{me.email} · operador</p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-rose-300"
          >
            Sair
          </button>
        </header>

        <GerarConviteCard />
        <ListaConvitesCard />
      </div>
    </div>
  )
}

function GerarConviteCard() {
  const qc = useQueryClient()
  const [copiado, setCopiado] = useState(false)
  const gerar = useMutation({
    mutationFn: () => api<{ id: string }>('/sistema/convites', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['convites'] }),
  })
  const novoId = gerar.data?.id
  const link = novoId ? `${window.location.origin}/select-restaurant?t=${novoId}` : null

  async function copiar() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-800 dark:text-slate-100">Convites de provisionamento</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Cada link cria UMA conta de admin para um NOVO restaurante. Expira em 7 dias.
          </p>
        </div>
        <Button onClick={() => gerar.mutate()} loading={gerar.isPending}>
          + Gerar convite
        </Button>
      </div>

      {gerar.isError && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
          {gerar.error instanceof Error ? gerar.error.message : 'Erro ao gerar convite'}
        </p>
      )}

      {novoId && (
        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">Convite gerado — envie este link:</p>
          <code className="mt-1 block break-all rounded bg-white px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
            {link}
          </code>
          <Button variant="secondary" className="mt-3" onClick={copiar}>
            {copiado ? '✓ Copiado!' : '📋 Copiar link'}
          </Button>
        </div>
      )}
    </Card>
  )
}

function ListaConvitesCard() {
  const qc = useQueryClient()
  const lista = useQuery({
    queryKey: ['convites'],
    queryFn: () => api<Convite[]>('/sistema/convites'),
  })
  const revogar = useMutation({
    mutationFn: (id: string) => api(`/sistema/convites/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['convites'] }),
  })

  if (lista.isLoading) return <Card className="p-6"><LoadingScreen /></Card>
  if (lista.isError) return <Card className="p-6 text-sm text-rose-600">Erro ao carregar convites.</Card>

  const itens = lista.data ?? []

  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900/60">
          <tr>
            <th className="px-4 py-3">Código</th>
            <th className="px-4 py-3">Status</th>
            <th className="hidden px-4 py-3 sm:table-cell">Expira em</th>
            <th className="px-4 py-3 text-right">Ação</th>
          </tr>
        </thead>
        <tbody>
          {itens.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                Nenhum convite gerado ainda.
              </td>
            </tr>
          )}
          {itens.map((c) => (
            <tr key={c.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
              <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300" title={c.id}>
                {c.id}
              </td>
              <td className="px-4 py-3">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${CORES_STATUS[c.status]}`}>
                  {c.status}
                </span>
              </td>
              <td className="hidden px-4 py-3 text-xs text-slate-500 sm:table-cell">{dataCurta(c.expiraEm)}</td>
              <td className="px-4 py-3 text-right">
                {c.status === 'ativa' && (
                  <button
                    onClick={() => revogar.mutate(c.id)}
                    disabled={revogar.isPending}
                    className="text-xs font-semibold text-rose-500 hover:text-rose-700 disabled:opacity-50"
                  >
                    Revogar
                  </button>
                )}
                {c.status === 'usada' && <Badge value="ok" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
