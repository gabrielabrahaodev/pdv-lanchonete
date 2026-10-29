import { PageHeader } from '../../components/layout/AppLayout'
import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { api } from '../../lib/api'
import { hora } from '../../lib/format'
import { imprimir, linhasComanda, identificacaoPedido } from '../../lib/impressora'
import { useCozinhaFila, useProdutos } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'

const SECOES = [
  { status: 'pendente', titulo: '⏳ Pendentes', proximo: 'preparo', acao: '🔥 Iniciar preparo', botao: 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/50' },
  { status: 'preparo', titulo: '🔥 Em preparo', proximo: 'pronto', acao: '🔔 Marcar tudo pronto', botao: 'border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-900/50' },
  { status: 'pronto', titulo: '🔔 Prontos para entregar', proximo: 'entregue', acao: '✅ Entregar', botao: 'border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300 dark:hover:bg-violet-900/50' },
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

  // anuncia tickets novos para leitor de tela sem roubar o foco
  const [anuncio, setAnuncio] = useState('')
  const vistos = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (fila.isLoading || !fila.data) return
    const ids = new Set(fila.data.map((p) => p.id))
    if (vistos.current) {
      const novos = fila.data.filter((p) => !vistos.current!.has(p.id))
      if (novos.length === 1) {
        setAnuncio(`Novo pedido: ${identificacaoPedido(novos[0])}`)
      } else if (novos.length > 1) {
        setAnuncio(`${novos.length} novos pedidos na cozinha`)
      }
    }
    vistos.current = ids
  }, [fila.data, fila.isLoading])

  /** Vários itens do MESMO pedido numa única transação (sem contenção). */
  const mudarStatus = useMutation({
    mutationFn: ({ pedidoId, itemIds, novo }: { pedidoId: string; itemIds: string[]; novo: string }) =>
      api(`/cozinha/pedidos/${pedidoId}/itens/status`, { method: 'PATCH', body: { itemIds, novoStatus: novo } }),
  })

  const renovar = useMutation({
    mutationFn: ({ pedidoId, itemId }: { pedidoId: string; itemId: string }) =>
      api(`/pedidos/${pedidoId}/itens/${itemId}/renovar-reserva`, { method: 'POST' }),
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

  if (fila.isLoading) return <div className="p-6 text-slate-500 dark:text-slate-400">Carregando fila…</div>

  const pedidos = fila.data ?? []
  const minutos = (criadoEm?: string | null) =>
    criadoEm ? Math.max(0, Math.floor((Date.now() - new Date(criadoEm).getTime()) / 60000)) : 0

  return (
    <div className="pdv-page min-h-full p-3 sm:p-5 lg:p-6">
      <div aria-live="polite" role="status" className="sr-only">
        {anuncio}
      </div>
      <PageHeader title="Cozinha — KDS" subtitle="Mesas e balcão · acompanhamento em tempo real" actions={<span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">{pedidos.length} pedido(s) ativo(s)</span>} />

      {mudarStatus.isError && <p role="alert" className="mb-4 rounded-lg bg-rose-100 p-3 text-sm text-rose-800 dark:text-rose-300">{mudarStatus.error instanceof Error ? mudarStatus.error.message : 'Erro ao atualizar pedido'}</p>}
      {renovar.isError && <p role="alert" className="mb-4 rounded-lg bg-rose-100 p-3 text-sm text-rose-800 dark:text-rose-300">{renovar.error instanceof Error ? renovar.error.message : 'Erro ao atualizar reserva'}</p>}
      {/* Um cartão por PEDIDO/MESA: a cozinha vê TUDO da mesa junto */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pedidos.map((pedido) => {
          const temPronto = pedido.itens.some((i) => i.status === 'pronto')
          const emPreparo = pedido.itens.some((i) => i.status === 'preparo')
          const borda = temPronto ? 'border-l-violet-500' : emPreparo ? 'border-l-sky-500' : 'border-l-slate-600'

          return (
            <article key={pedido.id} className={`rounded-xl border-l-4 ${borda} border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900`}>
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <span className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                  {identificacaoPedido(pedido)}
                </span>
                <span className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      imprimir(
                        `Comanda ${identificacaoPedido(pedido)}`,
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
                    aria-label="Imprimir comanda do que falta preparar"
                    className="action-button grid h-11 w-11 place-items-center text-slate-500 transition hover:text-brand-600 dark:text-slate-400"
                  >
                    <Printer className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                      minutos(pedido.criadoEm) >= 20 ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
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
                      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {sec.titulo} ({itensSecao.length})
                      </p>
                      <ul className="mb-1.5 space-y-1">
                        {itensSecao.map((item) => (
                          <li key={item.id} className="text-sm">
                            <b>{item.qtd}×</b> <span className="font-semibold text-slate-700 dark:text-slate-100">{nomeProduto(item.produtoId)}</span>
                            {nomeVariacao(item.produtoId, item.variacaoId) && (
                              <span className="ml-1 rounded bg-brand-100 px-1.5 py-0.5 text-xs font-bold text-brand-700">
                                {nomeVariacao(item.produtoId, item.variacaoId)}
                              </span>
                            )}
                            {item.modoEstoque === 'antecipado' && <button className="action-button min-h-11 text-xs font-semibold text-brand-700" disabled={renovar.isPending || mudarStatus.isPending} onClick={() => renovar.mutate({pedidoId: pedido.id, itemId: item.id})}>Atualizar lotes reservados</button>}
                            {item.observacoes && (
                              <span className="block pl-5 text-xs font-semibold italic text-amber-700 dark:text-amber-300">
                                <span aria-hidden="true">✏️ </span>“{item.observacoes}”
                              </span>
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
                        disabled={mudarStatus.isPending || renovar.isPending}
                        className={`min-h-11 w-full rounded-xl py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-40 lg:min-h-9 lg:rounded-lg ${sec.botao}`}
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
        <div className="rounded-xl border border-dashed border-slate-700 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
          Nenhum pedido na fila <span aria-hidden="true">🎉</span>
        </div>
      )}
    </div>
  )
}
