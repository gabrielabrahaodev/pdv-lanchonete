import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { hora } from '../../lib/format'
import { imprimir, linhasComanda } from '../../lib/impressora'

interface FilaItem {
  id: string
  mesaId: string
  criadoEm: string
  itens: {
    id: string
    produtoId: string
    variacaoId?: string | null
    qtd: number
    observacoes?: string | null
    status: 'pendente' | 'preparo' | 'pronto' | 'entregue' | 'cancelado'
  }[]
}

const COLUNAS = [
  { status: 'pendente', titulo: '⏳ Pendente', proximo: 'preparo', acao: 'Iniciar preparo', cor: 'border-slate-300' },
  { status: 'preparo', titulo: '🔥 Em preparo', proximo: 'pronto', acao: 'Marcar pronto', cor: 'border-sky-300' },
  { status: 'pronto', titulo: '🔔 Pronto', proximo: 'entregue', acao: 'Entregar', cor: 'border-violet-300' },
] as const

export default function CozinhaPage() {
  const qc = useQueryClient()

  const fila = useQuery({
    queryKey: ['cozinha-fila'],
    queryFn: () => api<FilaItem[]>('/cozinha/fila'),
    refetchInterval: 8_000,
  })

  const produtos = useQuery({
    queryKey: ['produtos'],
    queryFn: () => api<{ id: string; nome: string; variacoes: { id: string; nome: string }[] }[]>('/produtos'),
    staleTime: 60_000,
  })

  const mudarStatus = useMutation({
    mutationFn: ({ pedidoId, itemId, novo }: { pedidoId: string; itemId: string; novo: string }) =>
      api(`/cozinha/pedidos/${pedidoId}/itens/${itemId}/status?novo_status=${novo}`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cozinha-fila'] }),
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

  return (
    <div className="h-full overflow-y-auto bg-slate-900 p-5">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">👨‍🍳 Cozinha — KDS</h1>
          <p className="text-xs text-slate-400">Atualiza automaticamente a cada 8s</p>
        </div>
        <span className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-bold text-emerald-400">
          {pedidos.length} pedido(s) ativo(s)
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUNAS.map((col) => {
          const cartoes = pedidos
            .map((p) => ({
              ...p,
              itens: p.itens.filter((i) => i.status === col.status),
            }))
            .filter((p) => p.itens.length > 0)

          return (
            <section key={col.status} className="space-y-3">
              <h2 className={`flex items-center justify-between rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-bold text-white`}>
                {col.titulo}
                <span className="rounded-md bg-slate-700 px-2 py-0.5 text-xs">{cartoes.length}</span>
              </h2>

              {cartoes.map((cartao) => (
                <article key={cartao.id} className={`rounded-xl border-l-4 ${col.cor} bg-white p-4 shadow`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-bold text-slate-700">Mesa {cartao.mesaId?.replace('mesa_', '') ?? '?'}</span>
                    <span className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          imprimir(
                            `Comanda mesa ${cartao.mesaId}`,
                            linhasComanda(
                              cartao,
                              cartao.itens.map((i) => ({
                                qtd: i.qtd,
                                nomeProduto: nomeProduto(i.produtoId),
                                nomeVariacao: nomeVariacao(i.produtoId, i.variacaoId),
                                observacoes: i.observacoes,
                              })),
                            ),
                          )
                        }
                        title="Imprimir comanda"
                        className="text-sm text-slate-400 transition hover:text-brand-600"
                      >
                        🖨
                      </button>
                      <span className="text-xs font-semibold text-slate-400">{hora(cartao.criadoEm)}</span>
                    </span>
                  </div>
                  <ul className="mb-3 space-y-1">
                    {cartao.itens.map((item) => (
                      <li key={item.id} className="flex justify-between text-sm">
                        <span className="text-slate-700">
                          <b>{item.qtd}×</b> {nomeProduto(item.produtoId)}
                          {nomeVariacao(item.produtoId, item.variacaoId) && (
                            <em className="ml-1 text-xs text-slate-400">({nomeVariacao(item.produtoId, item.variacaoId)})</em>
                          )}
                          {item.observacoes && <span className="block text-xs italic text-amber-600">“{item.observacoes}”</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => cartao.itens.forEach((i) => mudarStatus.mutate({ pedidoId: cartao.id, itemId: i.id, novo: col.proximo }))}
                    disabled={mudarStatus.isPending}
                    className="w-full rounded-lg bg-slate-100 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
                  >
                    {col.acao} →
                  </button>
                </article>
              ))}

              {cartoes.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-700 py-10 text-center text-sm text-slate-500">
                  vazio
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
