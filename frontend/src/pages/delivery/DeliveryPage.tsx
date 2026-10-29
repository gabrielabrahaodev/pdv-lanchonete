import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Bike } from 'lucide-react'
import { api } from '../../lib/api'
import { useDeliveryAtivos, useDeliveryHistorico, useProdutos } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { DeliveryOrder } from '../../types'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingScreen, Modal } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { brl, dataHora } from '../../lib/format'

const FLUXO: Record<DeliveryOrder['status'], { proximo?: DeliveryOrder['status']; acao?: string; variante?: string }> = {
  pending: { proximo: 'confirmed', acao: 'Confirmar', variante: 'primary' },
  confirmed: { proximo: 'preparing', acao: 'Preparar', variante: 'secondary' },
  preparing: { proximo: 'ready', acao: 'Pronto', variante: 'secondary' },
  ready: { proximo: 'delivered', acao: 'Entregar', variante: 'success' },
  delivered: {},
  cancelled: {},
}

export default function DeliveryPage() {
  const [novoAberto, setNovoAberto] = useState(false)
  const { me } = useAuth()
  const rid = me?.restaurantId

  const ativosQ = useDeliveryAtivos(rid)
  const historicoQ = useDeliveryHistorico(rid)

  const pedidos = {
    isLoading: ativosQ.isLoading || historicoQ.isLoading,
    isError: ativosQ.isError || historicoQ.isError,
    error: ativosQ.error ?? historicoQ.error,
    data: [...(ativosQ.data ?? []), ...(historicoQ.data ?? [])],
  }

  const mudarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/delivery/pedidos/${id}/status`, { method: 'PATCH', body: { status } }),
  })

  const cancelar = useMutation({
    mutationFn: (id: string) => api(`/delivery/pedidos/${id}/status`, { method: 'PATCH', body: { status: 'cancelled' } }),
  })

  if (pedidos.isLoading) return <LoadingScreen />
  if (pedidos.isError) return <ErrorState error={pedidos.error} />

  const lista = pedidos.data ?? []
  const ativos = lista.filter((p) => !['delivered', 'cancelled'].includes(p.status))
  const historico = lista.filter((p) => ['delivered', 'cancelled'].includes(p.status))

  return (
    <div className="pdv-page p-3 sm:p-5 lg:p-6">
      <PageHeader
        title="Delivery"
        subtitle={`${ativos.length} pedido(s) em andamento`}
        actions={<Button onClick={() => setNovoAberto(true)}>+ Novo pedido</Button>}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ativos.map((p) => (
          <Card key={p.id} className="flex flex-col p-5">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-100">{p.clienteNome}</span>
              <Badge value={p.status} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {dataHora(p.criadoEm)} · {p.platform}
            </p>
            <ul className="my-3 flex-1 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
              {p.itens.map((i) => (
                <li key={i.id}>
                  {i.qtd}× {i.nome}
                </li>
              ))}
            </ul>
            {p.clienteEndereco && <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">📍 {p.clienteEndereco}</p>}
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-bold tabular-nums text-brand-600">{brl(p.total)}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => window.confirm('Cancelar este delivery?') && cancelar.mutate(p.id)}
                    className="grid h-11 min-w-11 place-items-center px-2 text-xs font-semibold text-rose-400 hover:text-rose-600 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  {FLUXO[p.status].acao && (
                    <Button
                      variant={FLUXO[p.status].variante as 'primary'}
                      className="!px-3 !py-1.5 !text-xs min-h-11"
                      loading={mudarStatus.isPending}
                      onClick={() => mudarStatus.mutate({ id: p.id, status: FLUXO[p.status].proximo! })}
                    >
                      {FLUXO[p.status].acao}
                    </Button>
                  )}
                </div>
              </div>
          </Card>
        ))}
      </div>

      {ativos.length === 0 && (
        <EmptyState
          icon={<Bike className="h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden="true" />}
          message="Nenhum delivery em andamento."
        />
      )}

      {historico.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Histórico</h2>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="pdv-table pdv-records w-full min-w-[560px] text-sm">
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {historico.slice(0, 10).map((p) => (
                  <tr key={p.id}>
                    <td data-label="Cliente" className="px-5 py-2.5 font-semibold text-slate-700 dark:text-slate-100">{p.clienteNome}</td>
                    <td data-label="Data" className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">{dataHora(p.criadoEm)}</td>
                    <td data-label="Status" className="px-5 py-2.5"><Badge value={p.status} /></td>
                    <td data-label="Total" className="px-5 py-2.5 text-right font-semibold">{brl(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        </>
      )}

      <NovoDeliveryModal open={novoAberto} onClose={() => setNovoAberto(false)} />
    </div>
  )
}

function NovoDeliveryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth()
  const [form, setForm] = useState({ clienteNome: '', clienteTelefone: '', clienteEndereco: '' })
  const [itens, setItens] = useState<{ produtoId: string; qtd: number }[]>([])

  const produtos = useProdutos(open ? me?.restaurantId : null)

  const criar = useMutation({
    mutationFn: () =>
      api('/delivery/pedidos', {
        method: 'POST',
        body: {
          platform: 'proprio',
          clienteNome: form.clienteNome.trim(),
          clienteTelefone: form.clienteTelefone || null,
          clienteEndereco: form.clienteEndereco || null,
          itens: itens.filter((i) => i.qtd > 0),
        },
      }),
    onSuccess: () => {
      setForm({ clienteNome: '', clienteTelefone: '', clienteEndereco: '' })
      setItens([])
      onClose()
    },
  })

  function toggleProduto(id: string) {
    setItens((prev) => {
      const found = prev.find((i) => i.produtoId === id)
      if (found) return prev.filter((i) => i.produtoId !== id)
      return [...prev, { produtoId: id, qtd: 1 }]
    })
  }

  return (
    <Modal title="Novo delivery" open={open} onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <Field label="Cliente">
          <Input value={form.clienteNome} onChange={(e) => setForm({ ...form, clienteNome: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
          <Field label="Telefone"><Input value={form.clienteTelefone} onChange={(e) => setForm({ ...form, clienteTelefone: e.target.value })} /></Field>
          <Field label="Endereço"><Input value={form.clienteEndereco} onChange={(e) => setForm({ ...form, clienteEndereco: e.target.value })} /></Field>
        </div>
        <Field label="Itens">
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {(produtos.data ?? []).map((p) => {
              const item = itens.find((i) => i.produtoId === p.id)
              return (
                <div key={p.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <label className="flex flex-1 items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!item}
                      onChange={() => toggleProduto(p.id)}
                      className="h-4 w-4 accent-brand-600"
                    />
                    {p.nome} <span className="text-xs text-slate-500 dark:text-slate-400">{brl(p.preco)}</span>
                  </label>
                  {item && (
                    <input
                      type="number"
                      min={1}
                      value={item.qtd}
                      onChange={(e) =>
                        setItens((prev) =>
                          prev.map((i) => (i.produtoId === p.id ? { ...i, qtd: Math.max(1, Number(e.target.value)) } : i)),
                        )
                      }
                      className="w-14 rounded border border-slate-300 px-1 text-sm"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </Field>
        <Button
          className="w-full"
          loading={criar.isPending}
          disabled={!form.clienteNome.trim() || itens.length === 0}
          onClick={() => criar.mutate()}
        >
          Criar delivery
        </Button>
      </div>
    </Modal>
  )
}
