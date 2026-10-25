import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
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

  // anuncia tickets novos para leitor de tela sem roubar o foco
  const [anuncio, setAnuncio] = useState('')
  const vistos = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (fila.isLoading || !fila.data) return
    const ids = new Set(fila.data.map((p) => p.id))
    if (vistos.current) {
      const novos = fila.data.filter((p) => !vistos.current!.has(p.id))
      if (novos.length === 1) {
        setAnuncio(`Novo pedido na mesa ${novos[0].mesaId?.replace('mesa_', '') ?? '?'}`)
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

  if (fila.isLoading) return <div className="p-6 text-slate-500">Carregando fila…</div>

  const pedidos = fila.data ?? []
  const minutos = (criadoEm?: string | null) =>
    criadoEm ? Math.max(0, Math.floor((Date.now() - new Date(criadoEm).getTime()) / 60000)) : 0

  return (
    <div className="h-full overflow-y-auto bg-slate-900 p-3 sm:p-5">
      <div aria-live="polite" role="status" className="sr-only">
        {anuncio}
      </div>
      <header className="mb-5 flex flex-col gap-3 pl-14 sm:flex-row sm:items-center sm:justify-between sm:pl-0">
        <div>
          <h1 className="text-xl font-bold text-white">👨‍🍳 Cozinha — KDS</h1>
          <p className="text-xs text-slate-500">Um cartão por mesa · tempo real</p>
        </div>
        <span className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-emerald-400">
          {pedidos.length} mesa(s) ativa(s)
        </span>
      </header>

      {mudarStatus.isError && <p role="alert" className="mb-4 rounded-lg bg-rose-100 p-3 text-sm text-rose-800">{mudarStatus.error instanceof Error ? mudarStatus.error.message : 'Erro ao atualizar pedido'}</p>}
      {renovar.isError && <p role="alert" className="mb-4 rounded-lg bg-rose-100 p-3 text-sm text-rose-800">{renovar.error instanceof Error ? renovar.error.message : 'Erro ao atualizar reserva'}</p>}
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
                    aria-label="Imprimir comanda do que falta preparar"
                    className="grid h-11 w-11 place-items-center text-slate-500 transition hover:text-brand-600"
                  >
                    <Printer className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
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
                      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
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
                            {item.modoEstoque === 'antecipado' && <button className="block min-h-11 text-xs font-semibold text-brand-700" disabled={renovar.isPending || mudarStatus.isPending} onClick={() => renovar.mutate({pedidoId: pedido.id, itemId: item.id})}>Atualizar lotes reservados</button>}
                            {item.observacoes && (
                              <span className="block pl-5 text-xs font-semibold italic text-amber-600">
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
                        className={`min-h-11 w-full rounded-lg py-2.5 text-sm font-bold transition ${sec.botao}`}
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
          Nenhum pedido na fila <span aria-hidden="true">🎉</span>
        </div>
      )}
    </div>
  )
}
