import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { api } from '../../lib/api'
import { useMesa, usePedidoAbertoDaMesa, usePedidosDaMesa, useProdutos } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { Order, Product } from '../../types'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingScreen } from '../../components/ui'
import { brl, dataHora } from '../../lib/format'

export default function MesaDetailPage() {
  const { mesaId = '' } = useParams()
  const navigate = useNavigate()
  const { me } = useAuth()
  const rid = me?.restaurantId

  const mesa = useMesa(rid, mesaId)

  const pedidoAberto = usePedidoAbertoDaMesa(rid, mesaId)

  const historico = usePedidosDaMesa(rid, mesaId)

  const produtos = useProdutos(rid)

  const cancelar = useMutation({
    mutationFn: (pedidoId: string) => api(`/pedidos/${pedidoId}/cancelar`, { method: 'POST' }),
  })

  if (mesa.isLoading || pedidoAberto.isLoading) return <LoadingScreen />
  if (mesa.isError) return <ErrorState error={mesa.error} />
  if (!mesa.data)
    return (
      <EmptyState
        icon={<SearchX className="h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden="true" />}
        message="Mesa não encontrada."
      />
    )

  const m = mesa.data
  const aberto = pedidoAberto.data ?? null

  return (
    <div className="mx-auto w-full max-w-3xl p-3 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/caixa" className="text-xs font-semibold text-brand-600 hover:underline">
            ← Voltar ao caixa
          </Link>
          <h1 className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">Mesa {m?.numero}</h1>
          {m && <Badge value={m.status} />}
        </div>

        <div className="flex flex-wrap gap-2">
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
        <PedidoCard pedido={aberto} produtos={produtos.data ?? []} onCancel={() => cancelar.mutate(aberto.id)} cancelando={cancelar.isPending} />
      ) : (
        <Card className="p-10 text-center text-sm text-slate-500">
          Nenhum pedido aberto nesta mesa.
        </Card>
      )}

      {(historico.data ?? [])
        .filter((p) => p.status !== 'aberto')
        .slice(0, 5)
        .map((p) => (
          <details key={p.id} className="mt-3 rounded-xl border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-600">
              Pedido anterior — {dataHora(p.criadoEm)}{' '}
              <Badge value={p.status} />
            </summary>
            <ItensList pedido={p} produtos={produtos.data ?? []} />
          </details>
        ))}
    </div>
  )
}

function PedidoCard({ pedido, produtos, onCancel, cancelando }: { pedido: Order; produtos: Product[]; onCancel: () => void; cancelando: boolean }) {
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
      <ItensList pedido={pedido} produtos={produtos} />
      <div className="flex items-center justify-between px-5 py-4">
        <span className="font-bold text-slate-800 dark:text-slate-100">Total</span>
        <span className="text-lg font-bold text-brand-600">{brl(pedido.total)}</span>
      </div>
    </Card>
  )
}

function ItensList({ pedido, produtos }: { pedido: Order; produtos: Product[] }) {
  const { me } = useAuth()
  const permitido = ['admin', 'gerente', 'caixa', 'cozinha', 'garcom'].includes(me?.papel ?? '')
  const operacao = useMutation({ mutationFn: ({id, renovar}: {id: string; renovar: boolean}) =>
    api(renovar ? `/pedidos/${pedido.id}/itens/${id}/renovar-reserva` : `/pedidos/${pedido.id}/itens/${id}/status?novo_status=entregue`, {method: renovar ? 'POST' : 'PATCH'}) })
  return (<div>
    {operacao.isError && <p role="alert" className="p-3 text-sm text-rose-600">{operacao.error instanceof Error ? operacao.error.message : 'Não foi possível atualizar o item'}</p>}
    <ul className="divide-y divide-slate-50">
      {pedido.itens
        .filter((i) => i.status !== 'cancelado')
        .map((item) => (
          <li key={item.id} className="flex items-center justify-between px-5 py-2.5">
            <div>
              <ItemNome item={item} produtos={produtos} />
              {item.observacoes && <p className="text-xs italic text-slate-500">“{item.observacoes}”</p>}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">
                {item.qtd}× {brl(item.precoUnitario)}
              </p>
              <Badge value={item.status} />
              {permitido && pedido.status !== 'cancelado' && item.status === 'pronto' && <Button variant="secondary" loading={operacao.isPending} onClick={() => operacao.mutate({id:item.id, renovar:false})}>Confirmar entrega</Button>}
              {permitido && pedido.status !== 'cancelado' && item.modoEstoque === 'antecipado' && item.status !== 'entregue' && item.status !== 'cancelado' && <Button variant="ghost" loading={operacao.isPending} onClick={() => operacao.mutate({id:item.id, renovar:true})}>Atualizar lotes reservados</Button>}
            </div>
          </li>
        ))}
    </ul></div>
  )
}

function ItemNome({ item, produtos }: { item: Order['itens'][number]; produtos: Product[] }) {
  const produto = produtos.find((p) => p.id === item.produtoId)
  const variacao = produto?.variacoes?.find((v) => v.id === item.variacaoId)
  return (
    <p className="text-sm text-slate-800 dark:text-slate-100">
      {produto?.nome ?? item.produtoId}
      {variacao ? ` · ${variacao.nome}` : ''}
    </p>
  )
}
