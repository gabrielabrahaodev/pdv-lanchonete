import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import type { Mesa, Order } from '../../types'
import { Badge, Button, Card, ErrorState, LoadingScreen } from '../../components/ui'
import { brl, dataHora } from '../../lib/format'

export default function MesaDetailPage() {
  const { mesaId = '' } = useParams()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const mesa = useQuery({
    queryKey: ['mesas', mesaId],
    queryFn: () => api<Mesa[]>(`/mesas`).then((ms) => ms.find((m) => m.id === mesaId) ?? null),
    refetchInterval: 15_000,
  })

  const pedidos = useQuery({
    queryKey: ['pedidos', 'mesa', mesaId],
    queryFn: () => api<Order[]>(`/pedidos?mesa_id=${mesaId}`),
    refetchInterval: 15_000,
  })

  const cancelar = useMutation({
    mutationFn: (pedidoId: string) => api(`/pedidos/${pedidoId}/cancelar`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['mesas'] })
    },
  })

  if (mesa.isLoading || pedidos.isLoading) return <LoadingScreen />
  if (mesa.isError) return <ErrorState error={mesa.error} />

  const m = mesa.data
  const aberto = (pedidos.data ?? []).find((p) => p.status === 'aberto')

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link to="/caixa" className="text-xs font-semibold text-brand-600 hover:underline">
            ← Voltar ao caixa
          </Link>
          <h1 className="mt-1 text-xl font-bold text-slate-800">Mesa {m?.numero}</h1>
          {m && <Badge value={m.status} />}
        </div>

        <div className="flex gap-2">
          {!aberto && (
            <Button onClick={() => navigate(`/caixa/novo-pedido/${mesaId}`)}>+ Novo pedido</Button>
          )}
          {aberto && (
            <>
              <Button variant="secondary" onClick={() => navigate(`/caixa/novo-pedido/${mesaId}?add=1`)}>
                + Adicionar itens
              </Button>
              <Button variant="success" onClick={() => navigate(`/caixa/pagamento/${aberto.id}`)}>
                Pagamento
              </Button>
            </>
          )}
        </div>
      </div>

      {aberto ? (
        <PedidoCard pedido={aberto} onCancel={() => cancelar.mutate(aberto.id)} cancelando={cancelar.isPending} />
      ) : (
        <Card className="p-10 text-center text-sm text-slate-400">
          Nenhum pedido aberto nesta mesa.
        </Card>
      )}

      {(pedidos.data ?? [])
        .filter((p) => p.status !== 'aberto')
        .slice(0, 5)
        .map((p) => (
          <details key={p.id} className="mt-3 rounded-xl border border-slate-200 bg-white text-sm">
            <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-600">
              Pedido anterior — {dataHora(p.criadoEm)}{' '}
              <Badge value={p.status} />
            </summary>
            <ItensList pedido={p} />
          </details>
        ))}
    </div>
  )
}

function PedidoCard({ pedido, onCancel, cancelando }: { pedido: Order; onCancel: () => void; cancelando: boolean }) {
  return (
    <Card className="divide-y divide-slate-100">
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-sm font-semibold text-slate-500">Pedido aberto · {dataHora(pedido.criadoEm)}</span>
        <button
          onClick={onCancel}
          disabled={cancelando}
          className="text-xs font-semibold text-rose-500 hover:text-rose-700 disabled:opacity-50"
        >
          Cancelar pedido
        </button>
      </div>
      <ItensList pedido={pedido} />
      <div className="flex items-center justify-between px-5 py-4">
        <span className="font-bold text-slate-800">Total</span>
        <span className="text-lg font-bold text-brand-600">{brl(pedido.total)}</span>
      </div>
    </Card>
  )
}

function ItensList({ pedido }: { pedido: Order }) {
  return (
    <ul className="divide-y divide-slate-50">
      {pedido.itens
        .filter((i) => i.status !== 'cancelado')
        .map((item) => (
          <li key={item.id} className="flex items-center justify-between px-5 py-2.5">
            <div>
              <ItemNome item={item} />
              {item.observacoes && <p className="text-xs italic text-slate-400">“{item.observacoes}”</p>}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">
                {item.qtd}× {brl(item.precoUnitario)}
              </p>
              <Badge value={item.status} />
            </div>
          </li>
        ))}
    </ul>
  )
}

function ItemNome({ item }: { item: Order['itens'][number] }) {
  const produtos = useQuery({
    queryKey: ['produtos'],
    queryFn: () => api<import('../../types').Product[]>('/produtos'),
    staleTime: 60_000,
  })
  const produto = produtos.data?.find((p) => p.id === item.produtoId)
  const variacao = produto?.variacoes?.find((v) => v.id === item.variacaoId)
  return (
    <p className="text-sm text-slate-800">
      {produto?.nome ?? item.produtoId}
      {variacao ? ` · ${variacao.nome}` : ''}
    </p>
  )
}
