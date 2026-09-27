import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { UtensilsCrossed } from 'lucide-react'
import { api } from '../../lib/api'
import { useMesas } from '../../hooks/useFirestore'
import type { Mesa } from '../../types'
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingScreen, Modal } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'

export default function MesasPage() {
  const navigate = useNavigate()
  const { me } = useAuth()
  const [novaAberta, setNovaAberta] = useState(false)
  const [numero, setNumero] = useState('')
  const [qrMesa, setQrMesa] = useState<Mesa | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const mesas = useMesas(me?.restaurantId)

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

  return (
    <div className="p-6">
      <PageHeader
        title="Mesas"
        subtitle={`${lista.filter((m) => m.status === 'ocupada').length} ocupada(s)`}
        actions={<Button onClick={() => setNovaAberta(true)}>+ Nova mesa</Button>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {lista.map((m) => (
          <Card key={m.id} className={`p-4 ${m.status === 'ocupada' ? 'ring-2 ring-amber-200' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-slate-800 dark:text-slate-100">Mesa {m.numero}</span>
              <Badge value={m.status} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-1 text-xs font-semibold">
              <button
                onClick={() => {
                  setQrMesa(m)
                  void QRCode.toDataURL(
                    `${window.location.origin}/m/${me?.restaurantId}/${m.id}`,
                    { width: 320, margin: 2 },
                  ).then(setQrDataUrl)
                }}
                className="grid h-11 min-w-11 place-items-center px-2 text-slate-500 hover:text-brand-600"
                title="QR do cardápio digital"
                aria-label={`QR do cardápio da mesa ${m.numero}`}
              >
                QR
              </button>
              <button
                onClick={() => navigate(m.pedidoAtivoId ? `/caixa/mesa/${m.id}` : `/caixa/novo-pedido/${m.id}`)}
                className="grid h-11 flex-1 place-items-center px-2 text-center text-brand-600 hover:underline"
              >
                {m.status === 'ocupada' ? 'Abrir pedido →' : 'Novo pedido →'}
              </button>
              <button
                onClick={() =>
                  window.confirm(`Excluir mesa ${m.numero}?`) &&
                  (remover.mutate(m.id), console.log())
                }
                disabled={remover.isPending || m.status === 'ocupada'}
                aria-label={`Excluir mesa ${m.numero}`}
                title={m.status === 'ocupada' ? 'Feche o pedido antes de excluir' : `Excluir mesa ${m.numero}`}
                className="grid h-11 min-w-11 place-items-center px-2 text-rose-400 hover:text-rose-600 disabled:pointer-events-none disabled:text-slate-300 disabled:opacity-70"
              >
                Excluir
              </button>
            </div>
          </Card>
        ))}
      </div>

      {lista.length === 0 && (
        <EmptyState
          icon={<UtensilsCrossed className="h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden="true" />}
          message="Nenhuma mesa cadastrada."
        />
      )}

      <Modal title={`Cardápio — Mesa ${qrMesa?.numero ?? ''}`} open={!!qrMesa} onClose={() => setQrMesa(null)}>
        {qrDataUrl ? (
          <div className="space-y-3 text-center">
            <img src={qrDataUrl} alt="QR do cardápio" className="mx-auto w-56 rounded-xl border border-slate-200" />
            <p className="text-xs text-slate-500">Cliente escaneia e vê o cardápio — pedidos só com o atendente.</p>
            <a href={qrDataUrl} download={`qrcode-mesa-${qrMesa?.numero}.png`}>
              <Button variant="secondary" className="w-full !py-1.5 !text-xs">⬇ Baixar PNG</Button>
            </a>
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500">Gerando QR…</p>
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
        </div>
      </Modal>
    </div>
  )
}
