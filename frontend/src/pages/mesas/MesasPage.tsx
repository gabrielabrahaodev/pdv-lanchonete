import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { api } from '../../lib/api'
import type { Mesa } from '../../types'
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingScreen, Modal } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { useAuth } from '../../context/AuthContext'

export default function MesasPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { me } = useAuth()
  const [novaAberta, setNovaAberta] = useState(false)
  const [numero, setNumero] = useState('')
  const [qrMesa, setQrMesa] = useState<Mesa | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const mesas = useQuery({
    queryKey: ['mesas'],
    queryFn: () => api<Mesa[]>('/mesas'),
    refetchInterval: 15_000,
  })

  const criar = useMutation({
    mutationFn: () => api(`/mesas?numero=${Number(numero)}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mesas'] })
      setNovaAberta(false)
      setNumero('')
    },
  })

  const remover = useMutation({
    mutationFn: (id: string) => api(`/mesas/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mesas'] }),
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
              <span className="text-lg font-bold text-slate-800">Mesa {m.numero}</span>
              <Badge value={m.status} />
            </div>
            <div className="mt-3 flex justify-between text-xs font-semibold">
              <button
                onClick={() => {
                  setQrMesa(m)
                  void QRCode.toDataURL(
                    `${window.location.origin}/m/${me?.restaurantId}/${m.id}`,
                    { width: 320, margin: 2 },
                  ).then(setQrDataUrl)
                }}
                className="text-slate-400 hover:text-brand-600"
                title="QR do cardápio digital"
              >
                QR
              </button>
              <button
                onClick={() => navigate(m.pedidoAtivoId ? `/caixa/mesa/${m.id}` : `/caixa/novo-pedido/${m.id}`)}
                className="text-brand-600 hover:underline"
              >
                {m.status === 'ocupada' ? 'Abrir pedido →' : 'Novo pedido →'}
              </button>
              <button
                onClick={() =>
                  window.confirm(`Excluir mesa ${m.numero}?`) &&
                  (remover.mutate(m.id), console.log())
                }
                disabled={remover.isPending}
                className={m.status === 'ocupada' ? 'pointer-events-none text-slate-300' : 'text-rose-400 hover:text-rose-600'}
              >
                Excluir
              </button>
            </div>
          </Card>
        ))}
      </div>

      {lista.length === 0 && <EmptyState icon="🍽️" message="Nenhuma mesa cadastrada." />}

      <Modal title={`Cardápio — Mesa ${qrMesa?.numero ?? ''}`} open={!!qrMesa} onClose={() => setQrMesa(null)}>
        {qrDataUrl ? (
          <div className="space-y-3 text-center">
            <img src={qrDataUrl} alt="QR do cardápio" className="mx-auto w-56 rounded-xl border border-slate-200" />
            <p className="text-xs text-slate-400">Cliente escaneia e pede direto da mesa — o pedido cai no KDS e na conta.</p>
            <a href={qrDataUrl} download={`qrcode-mesa-${qrMesa?.numero}.png`}>
              <Button variant="secondary" className="w-full !py-1.5 !text-xs">⬇ Baixar PNG</Button>
            </a>
          </div>
        ) : (
          <p className="text-center text-sm text-slate-400">Gerando QR…</p>
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
