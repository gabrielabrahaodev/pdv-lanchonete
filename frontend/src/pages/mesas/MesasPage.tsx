import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { MoreVertical, QrCode, Trash2, UtensilsCrossed } from 'lucide-react'
import { api } from '../../lib/api'
import { useMesas, usePedidosAbertos } from '../../hooks/useFirestore'
import type { Mesa } from '../../types'
import { Badge, Button, EmptyState, ErrorState, Input, LoadingScreen, Modal } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { brl } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'

export default function MesasPage() {
  const navigate = useNavigate()
  const { me } = useAuth()
  const [novaAberta, setNovaAberta] = useState(false)
  const [numero, setNumero] = useState('')
  const [qrMesa, setQrMesa] = useState<Mesa | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const mesas = useMesas(me?.restaurantId)
  const pedidos = usePedidosAbertos(me?.restaurantId)
  const gerencia = ['admin', 'gerente', 'caixa'].includes(me?.papel ?? '')
  const [filtro, setFiltro] = useState('todas')
  const [busca, setBusca] = useState('')
  const [visual, setVisual] = useState('grade')
  const [menu, setMenu] = useState<Mesa | null>(null)
  const [agora, setAgora] = useState(Date.now())
  const [erroQr, setErroQr] = useState('')
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  async function abrirQr(m: Mesa) {
    setMenu(null)
    setQrMesa(m)
    setQrDataUrl(null)
    setErroQr('')
    try {
      setQrDataUrl(await QRCode.toDataURL(`${window.location.origin}/m/${me?.restaurantId}/${m.id}`, { width: 320, margin: 2 }))
    } catch {
      setErroQr('Não foi possível gerar o QR. Feche e tente novamente.')
    }
  }

  const criar = useMutation({
    mutationFn: () => api(`/mesas?numero=${Number(numero)}`, { method: 'POST' }),
    onSuccess: () => {
      setNovaAberta(false)
      setNumero('')
    },
  })

  const remover = useMutation({
    mutationFn: (id: string) => api(`/mesas/${id}`, { method: 'DELETE' }),
  })

  if (mesas.isLoading) return <LoadingScreen />
  if (mesas.isError) return <ErrorState error={mesas.error} />

  const lista = [...(mesas.data ?? [])].sort((a, b) => a.numero - b.numero)

  const visiveis = lista.filter((m) => (filtro === 'todas' || m.status === filtro) && String(m.numero).includes(busca.trim()))
  const tempo = (inicio: string) => {
    const minutos = Math.max(0, Math.floor((agora - Date.parse(inicio)) / 60000))
    return Number.isFinite(minutos) ? (minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)}h ${minutos % 60}min`) : '—'
  }

  return (
    <div className="pdv-page p-3 text-slate-800 sm:p-5 lg:p-6 dark:text-slate-100">
      <PageHeader
        title="Mesas"
        subtitle={`${lista.length} mesas · ${lista.filter((m) => m.status === 'ocupada').length} ocupadas · ${lista.filter((m) => m.status === 'livre').length} livres`}
        actions={gerencia ? <Button onClick={() => setNovaAberta(true)}>+ Nova mesa</Button> : undefined}
      />

      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar mesas">
          {[['todas', 'Todas'], ['ocupada', 'Ocupadas'], ['livre', 'Livres']].map(([valor, nome]) => (
            <button key={valor} aria-pressed={filtro === valor} onClick={() => setFiltro(valor)} className={`min-h-11 rounded-xl px-3 text-sm lg:min-h-9 lg:rounded-lg font-semibold ${filtro === valor ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200 dark:bg-brand-900/25 dark:text-brand-200 dark:ring-brand-800' : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              {nome} ({valor === 'todas' ? lista.length : lista.filter((m) => m.status === valor).length})
            </button>
          ))}
        </div>
        <Input aria-label="Buscar mesa por número" placeholder="Número da mesa" inputMode="numeric" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full sm:w-44" />
        <div role="group" aria-label="Visualização" className="flex gap-1 sm:ml-auto">
          {[['grade', 'Grade'], ['lista', 'Lista']].map(([valor, nome]) => <button key={valor} aria-pressed={visual === valor} onClick={() => setVisual(valor)} className={`min-h-11 rounded-xl px-3 text-sm lg:min-h-9 lg:rounded-lg ${visual === valor ? 'bg-slate-200 font-semibold dark:bg-slate-700' : 'text-slate-500 dark:text-slate-400'}`}>{nome}</button>)}
        </div>
      </div>
      {remover.isError && <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">{remover.error.message}</p>}
      {pedidos.isError && <p role="status" className="mb-3 text-sm text-amber-700 dark:text-amber-300">Valores e horários dos pedidos indisponíveis no momento.</p>}
      <div className={visual === 'lista' ? 'space-y-2' : 'grid auto-rows-fr grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6'}>
        {visiveis.map((m) => {
          const pedido = pedidos.data?.find((p) => p.id === m.pedidoAtivoId && p.mesaId === m.id)
          return (
            <div key={m.id} className={`relative min-w-0 overflow-hidden rounded-xl border bg-white dark:bg-slate-900 ${m.status === 'ocupada' ? 'border-amber-400 dark:border-amber-500/60' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className={`flex h-full min-w-0 flex-col gap-2 p-3 ${visual === 'lista' ? 'sm:flex-row sm:items-center sm:gap-4 sm:pr-16' : ''}`}>
                <div className="min-w-0 pr-10 sm:pr-8">
                  <h2 className="text-base font-bold">Mesa {m.numero}</h2>
                  <Badge value={m.status} />
                </div>
                <div className={`text-sm ${visual === 'grade' ? 'min-h-10' : 'sm:flex-1'}`}>
                  {m.status === 'ocupada' ? (pedido ? <><strong>{brl(pedido.total)}</strong><p className="text-xs text-slate-500 dark:text-slate-400">Há {tempo(pedido.criadoEm)}</p></> : <p className="text-xs text-slate-500 dark:text-slate-400">{pedidos.isLoading ? 'Carregando…' : 'Ver pedido'}</p>) : <p className="text-xs text-slate-500 dark:text-slate-400">{m.status === 'livre' ? 'Disponível para pedido' : m.status === 'reservada' ? 'Mesa reservada' : 'Mesa indisponível'}</p>}
                </div>
                <Button
                  variant={m.status === 'ocupada' ? 'primary' : 'secondary'}
                  onClick={() => navigate(m.pedidoAtivoId ? `/caixa/mesa/${m.id}` : `/caixa/novo-pedido/${m.id}`)}
                  disabled={m.status === 'inativa'}
                  aria-label={`Mesa ${m.numero}: ${m.pedidoAtivoId ? 'abrir pedido' : 'novo pedido'}`}
                  className={`!px-2 !text-xs ${visual === 'grade' ? 'mt-auto w-full' : 'sm:shrink-0'}`}
                >{m.status === 'inativa' ? 'Indisponível' : m.pedidoAtivoId ? 'Abrir pedido' : 'Novo pedido'}</Button>
              </div>
              <button aria-label={`Opções da mesa ${m.numero}`} onClick={() => setMenu(m)} className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-500 dark:text-slate-400 dark:hover:bg-slate-800"><MoreVertical className="h-5 w-5" aria-hidden="true" /></button>
            </div>
          )
        })}
      </div>
      {!visiveis.length && <EmptyState icon={<UtensilsCrossed className="h-10 w-10 text-slate-300" aria-hidden="true" />} message={lista.length ? 'Nenhuma mesa corresponde aos filtros.' : 'Nenhuma mesa cadastrada.'} />}
      <Modal title={`Opções — Mesa ${menu?.numero ?? ''}`} open={!!menu} onClose={() => setMenu(null)}>
        {menu && <div className="space-y-2">
          <Button variant="secondary" className="w-full" onClick={() => void abrirQr(menu)}><QrCode className="mr-2 h-4 w-4" aria-hidden="true" />QR do cardápio</Button>
          {gerencia && <>
            <Button variant="danger" className="w-full" disabled={remover.isPending || menu.status === 'ocupada' || !!menu.pedidoAtivoId} onClick={() => {
              if (window.confirm(`Excluir mesa ${menu.numero}?`)) { remover.mutate(menu.id); setMenu(null) }
            }}><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Excluir mesa</Button>
            {(menu.status === 'ocupada' || menu.pedidoAtivoId) && <p className="text-xs text-slate-500 dark:text-slate-400">Feche o pedido antes de excluir esta mesa.</p>}
          </>}
        </div>}
      </Modal>

      <Modal title={`Cardápio — Mesa ${qrMesa?.numero ?? ''}`} open={!!qrMesa} onClose={() => setQrMesa(null)}>
        {qrDataUrl ? (
          <div className="space-y-3 text-center">
            <img src={qrDataUrl} alt="QR do cardápio" className="mx-auto w-56 rounded-xl border border-slate-200" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Cliente escaneia e vê o cardápio — pedidos só com o atendente.</p>
            <a href={qrDataUrl} download={`qrcode-mesa-${qrMesa?.numero}.png`}>
              <Button variant="secondary" className="w-full !py-1.5 !text-xs">⬇ Baixar PNG</Button>
            </a>
          </div>
        ) : (
          <p role={erroQr ? "alert" : "status"} className="text-center text-sm text-slate-500 dark:text-slate-400">{erroQr || 'Gerando QR…'}</p>
        )}
      </Modal>

      <Modal title="Nova mesa" open={novaAberta} onClose={() => setNovaAberta(false)}>
        <div className="space-y-4">
          <Input
            inputMode="numeric"
            placeholder="Número da mesa"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
          <Button
            className="w-full"
            loading={criar.isPending}
            disabled={!numero || Number(numero) <= 0}
            onClick={() => criar.mutate()}
          >
            Criar mesa
          </Button>
          {criar.isError && <p role="alert" className="text-sm text-rose-600">{criar.error.message}</p>}
        </div>
      </Modal>
    </div>
  )
}
