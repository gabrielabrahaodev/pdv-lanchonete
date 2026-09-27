import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { hora } from '../../lib/format'
import { imprimir, linhasComanda } from '../../lib/impressora'
import { useCozinhaFila, useProdutos } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'

const SECOES = [
  { status: 'pendente', titulo: '⏳ Pendentes', proximo: 'preparo', acao: '🔥 Iniciar preparo', botao: 'bg-amber-100 text-amber-800 hover:bg-amber-200' },
  { status: 'preparo', titulo: '🔥 Em preparo', proximo: 'pronto', acao: '🔔 Marcar tudo pronto', botao: 'bg-sky-100 text-sky-800 hover:bg-sky-200' },
  { status: 'pronto', titulo: '🔔 Prontos para entregar', proximo: 'entregue', acao: '✅ Entregar', botao: 'bg-violet-100 text-violet-800 hover:bg-violet-200' },
] as const

export default function CozinhaPage() {
  const [, setTick] = useState(0)
  const { me } = useAuth()

  // atualiza o tempo decorrido nos cartões
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const fila = useCozinhaFila(me?.restaurantId)

  const produtos = useProdutos(me?.restaurantId)

  /** Vários itens do MESMO pedido numa única transação (sem contenção). */
  const mudarStatus = useMutation({
    mutationFn: ({ pedidoId, itemIds, novo }: { pedidoId: string; itemIds: string[]; novo: string }) =>
      api(`/cozinha/pedidos/${pedidoId}/itens/status`, { method: 'PATCH', body: { itemIds, novoStatus: novo } }),
  })

  const nomeProduto = (produtoId: string) => {
    const p = produtos.data?.find((x) => x.id === produtoId)
    return p?.nome ?? 'Produto'
  }
  const nomeVariacao = (produtoId: string, variacaoId?: string | null) => {
    if (!variacaoId) return null
    const v = produtos.data?.find((x) => x.id === produtoId)?.variacoes?.find((y) => y.id === variacaoId)
    return v?.nome ?? null
  }

  if (fila.isLoading) return <div className="p-6 text-slate-400">Carregando fila…</div>

  const pedidos = fila.data ?? []
  const minutos = (criadoEm?: string | null) =>
    criadoEm ? Math.max(0, Math.floor((Date.now() - new Date(criadoEm).getTime()) / 60000)) : 0

  return (
    <div className="h-full overflow-y-auto bg-slate-900 p-5">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">👨‍🍳 Cozinha — KDS</h1>
          <p className="text-xs text-slate-400">Um cartão por mesa · tempo real</p>
        </div>
        <span className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-emerald-400">
          {pedidos.length} mesa(s) ativa(s)
        </span>
      </header>

      {/* Um cartão por PEDIDO/MESA: a cozinha vê TUDO da mesa junto */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pedidos.map((pedido) => {
          const temPronto = pedido.itens.some((i) => i.status === 'pronto')
          const emPreparo = pedido.itens.some((i) => i.status === 'preparo')
          const borda = temPronto ? 'border-l-violet-500' : emPreparo ? 'border-l-sky-500' : 'border-l-slate-600'

          return (
            <article key={pedido.id} className={`rounded-xl border-l-4 ${borda} bg-white p-4 shadow`}>
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-base font-extrabold text-slate-800">
                  Mesa {pedido.mesaId?.replace('mesa_', '') ?? '?'}
                </span>
                <span className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      imprimir(
                        `Comanda mesa ${pedido.mesaId}`,
                        linhasComanda(
                          pedido,
                          pedido.itens
                            .filter((i) => i.status !== 'pronto')
                            .map((i) => ({
                              qtd: i.qtd,
                              nomeProduto: nomeProduto(i.produtoId),
                              nomeVariacao: nomeVariacao(i.produtoId, i.variacaoId),
                              observacoes: i.observacoes,
                            })),
                        ),
                      )
                    }
                    title="Imprimir o que falta preparar"
                    className="text-sm text-slate-400 transition hover:text-brand-600"
                  >
                    🖨
                  </button>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                      minutos(pedido.criadoEm) >= 20 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    ⏱ {minutos(pedido.criadoEm)} min
                  </span>
                </span>
              </div>

              <div className="space-y-3">
                {SECOES.map((sec) => {
                  const itensSecao = pedido.itens.filter((i) => i.status === sec.status)
                  if (!itensSecao.length) return null
                  return (
                    <div key={sec.status}>
                      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
                        {sec.titulo} ({itensSecao.length})
                      </p>
                      <ul className="mb-1.5 space-y-1">
                        {itensSecao.map((item) => (
                          <li key={item.id} className="text-sm">
                            <b>{item.qtd}×</b> <span className="font-semibold text-slate-700">{nomeProduto(item.produtoId)}</span>
                            {nomeVariacao(item.produtoId, item.variacaoId) && (
                              <span className="ml-1 rounded bg-brand-100 px-1.5 py-0.5 text-xs font-bold text-brand-700">
                                {nomeVariacao(item.produtoId, item.variacaoId)}
                              </span>
                            )}
                            {item.observacoes && (
                              <span className="block pl-5 text-xs font-semibold italic text-amber-600">✏️ “{item.observacoes}”</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() =>
                          mudarStatus.mutate({
                            pedidoId: pedido.id,
                            itemIds: itensSecao.map((i) => i.id),
                            novo: sec.proximo,
                          })
                        }
                        disabled={mudarStatus.isPending}
                        className={`w-full rounded-lg py-1.5 text-xs font-bold transition ${sec.botao}`}
                      >
                        {sec.acao} →
                      </button>
                    </div>
                  )
                })}
              </div>
            </article>
          )
        })}
      </div>

      {pedidos.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-700 py-16 text-center text-sm text-slate-500">
          Nenhum pedido na fila 🎉
        </div>
      )}
    </div>
  )
}
