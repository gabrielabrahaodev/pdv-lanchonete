import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import type { CashSession, Mesa } from '../../types'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingScreen } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { brl } from '../../lib/format'

export default function CaixaOverviewPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const mesas = useQuery({
    queryKey: ['mesas'],
    queryFn: () => api<Mesa[]>('/mesas'),
    refetchInterval: 15_000,
  })

  const sessao = useQuery({
    queryKey: ['caixa', 'sessao-atual'],
    queryFn: () => api<CashSession | null>('/caixa/sessao-atual'),
    refetchInterval: 30_000,
  })

  const abrirCaixa = useMutation({
    mutationFn: (valorInicial: number) => api('/caixa/abrir', { method: 'POST', body: { valorInicial } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caixa'] }),
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
    <div className="p-6">
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
            <span className="text-xs text-slate-400">desde {new Date(s.abertoEm).toLocaleString('pt-BR')}</span>
          </div>
          <Stat label="Fundo de troco" value={brl(s.valorInicial)} />
          <Stat label="Vendas" value={brl(s.totalVendas)} />
          <Stat label="Recebido" value={brl(s.totalRecebido)} />
          <Stat label="Suprimentos" value={brl(s.suprimentos)} />
          <Stat label="Sangrias" value={brl(s.sangrias)} />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {lista.map((m) => (
          <MesaCard key={m.id} mesa={m} />
        ))}
      </div>

      {lista.length === 0 && <EmptyState icon="🍽️" message="Nenhuma mesa cadastrada — crie em Mesas." />}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
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
        ocupada ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-white' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm font-bold text-slate-800">Mesa {mesa.numero}</span>
        <Badge value={mesa.status} />
      </div>
      <p className="mt-4 text-xs text-slate-400">
        {ocupada ? 'Abrir pedido em andamento →' : 'Livre — iniciar pedido →'}
      </p>
    </button>
  )
}
