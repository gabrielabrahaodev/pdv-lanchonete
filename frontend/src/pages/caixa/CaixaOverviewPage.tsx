import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { UtensilsCrossed } from 'lucide-react'
import { api } from '../../lib/api'
import { useMesas, useSessaoAtual } from '../../hooks/useFirestore'
import type { Mesa } from '../../types'
import { useAuth } from '../../context/AuthContext'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingScreen } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { brl } from '../../lib/format'

export default function CaixaOverviewPage() {
  const navigate = useNavigate()
  const { me } = useAuth()

  const mesas = useMesas(me?.restaurantId)

  const sessao = useSessaoAtual(me?.restaurantId)

  const abrirCaixa = useMutation({
    mutationFn: (valorInicial: number) => api('/caixa/abrir', { method: 'POST', body: { valorInicial } }),
  })

  if (mesas.isLoading) return <LoadingScreen />
  if (mesas.isError) return <ErrorState error={mesas.error} />

  const lista = [...(mesas.data ?? [])].sort((a, b) => a.numero - b.numero)
  const ocupadas = lista.filter((m) => m.status === 'ocupada').length
  const s = sessao.data

  function handleAbrir() {
    const valor = Number(window.prompt('Valor de abertura do caixa (R$):', '0')?.replace(',', '.') ?? '0')
    abrirCaixa.mutate(isNaN(valor) ? 0 : valor)
  }

  return (
    <div className="p-3 sm:p-6">
      <PageHeader
        title="Caixa"
        subtitle={`${ocupadas} mesa(s) ocupada(s) de ${lista.length}`}
        actions={
          <>
            <Link to="/relatorios/fechamento-caixa">
              <Button variant="secondary">Sessão de caixa</Button>
            </Link>
            {!s && <Button loading={abrirCaixa.isPending} onClick={handleAbrir}>Abrir caixa</Button>}
          </>
        }
      />

      {s && (
        <Card className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-2 p-4">
          <div className="flex items-center gap-2">
            <Badge value="aberto" label="Caixa aberto" />
            <span className="text-xs text-slate-500">desde {new Date(s.abertoEm ?? s.criadoEm).toLocaleString('pt-BR')}</span>
          </div>
          <Stat label="Fundo de troco" value={brl(s.valorInicial)} />
          <Stat label="Vendas" value={brl(s.totalVendas)} />
          <Stat label="Recebido" value={brl(s.totalRecebido)} />
          <Stat label="Suprimentos" value={brl(s.suprimentos)} />
          <Stat label="Sangrias" value={brl(s.sangrias)} />
        </Card>
      )}

      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {lista.map((m) => (
          <MesaCard key={m.id} mesa={m} />
        ))}
      </div>

      {lista.length === 0 && (
        <EmptyState
          icon={<UtensilsCrossed className="h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden="true" />}
          message="Nenhuma mesa cadastrada — crie em Mesas."
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-700">{value}</p>
    </div>
  )
}

function MesaCard({ mesa }: { mesa: Mesa }) {
  const navigate = useNavigate()
  const ocupada = mesa.status === 'ocupada'

  return (
    <button
      onClick={() =>
        ocupada && mesa.pedidoAtivoId
          ? navigate(`/caixa/mesa/${mesa.id}`)
          : navigate(`/caixa/novo-pedido/${mesa.id}`)
      }
      className={`rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
          ocupada ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/30 dark:from-amber-500/10 dark:to-slate-900' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Mesa {mesa.numero}</span>
        <Badge value={mesa.status} />
      </div>
      <p className="mt-4 text-xs text-slate-500">
        {ocupada ? 'Abrir pedido em andamento →' : 'Livre — iniciar pedido →'}
      </p>
    </button>
  )
}
