import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiPublico } from '../../lib/apiPublico'
import { brl } from '../../lib/format'
import { urlImagemProduto } from '../../lib/imagem'

type Produto = {
  id: string
  nome: string
  categoriaId: string
  preco: number
  imagemUrl?: string | null
  temImagem?: boolean
  variacoes: { id: string; nome: string; precoAdicional: number }[]
}
type Categoria = { id: string; nome: string; icone?: string | null }
type ItemCarrinho = { produtoId: string; variacaoId: string | null; nome: string; qtd: number; obs: string }

export default function CardapioPage() {
  const { restaurantId = '', mesaId = '' } = useParams()
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  const cardapio = useQuery({
    queryKey: ['cardapio-publico', restaurantId],
    queryFn: () => apiPublico<{ categorias: Categoria[]; produtos: Produto[] }>(`/publico/${restaurantId}/cardapio`),
    staleTime: 60_000,
  })

  const porCategoria = useMemo(() => {
    const grupos: Record<string, Produto[]> = {}
    for (const p of cardapio.data?.produtos ?? []) {
      ;(grupos[p.categoriaId] ??= []).push(p)
    }
    return grupos
  }, [cardapio])

  function addItem(p: Produto) {
    const key = (x: ItemCarrinho) => x.produtoId === p.id && !x.variacaoId && !x.obs
    const existe = carrinho.find(key)
    if (existe) {
      setCarrinho(carrinho.map((i) => (i === existe ? { ...i, qtd: i.qtd + 1 } : i)))
    } else {
      setCarrinho([...carrinho, { produtoId: p.id, variacaoId: null, nome: p.nome, qtd: 1, obs: '' }])
    }
  }

  function mudarQtd(idx: number, delta: number) {
    setCarrinho((cs) =>
      cs.map((c, i) => (i === idx ? { ...c, qtd: Math.max(0, c.qtd + delta) } : c)).filter((c) => c.qtd > 0),
    )
  }

  async function enviar() {
    setErro(null)
    setEnviando(true)
    try {
      await apiPublico(`/publico/${restaurantId}/mesas/${mesaId}/pedido`, {
        method: 'POST',
        body: {
          itens: carrinho.map((c) => ({
            produtoId: c.produtoId,
            variacaoId: c.variacaoId,
            qtd: c.qtd,
            observacoes: c.obs || null,
          })),
        },
      })
      setEnviado(true)
      setCarrinho([])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar pedido')
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="grid min-h-full place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
          <p className="text-5xl">🎉</p>
          <h1 className="mt-3 text-xl font-bold text-slate-800">Pedido enviado!</h1>
          <p className="mt-1 text-sm text-slate-500">A cozinha já recebeu. Pode pedir mais quando quiser.</p>
          <button onClick={() => setEnviado(false)} className="mt-5 w-full rounded-lg bg-brand-600 py-2.5 font-bold text-white hover:bg-brand-700">
            Pedir mais alguma coisa
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-slate-100 pb-28">
      <header className="bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 px-5 py-7 text-white">
        <h1 className="text-2xl font-extrabold">🍔 Cardápio</h1>
        <p className="mt-0.5 text-sm text-slate-300">Mesa {mesaId.replace('mesa_', '')} · peça sem chamar ninguém</p>
      </header>

      <main className="mx-auto max-w-lg space-y-6 p-4">
        {cardapio.isLoading && <p className="py-16 text-center text-slate-400">Carregando o cardápio…</p>}
        {cardapio.isError && (
          <div className="rounded-xl bg-rose-50 p-6 text-center text-sm text-rose-700">
            Cardápio indisponível agora. Chame um atendente.
          </div>
        )}

        {(cardapio.data?.categorias ?? []).map((cat) => {
          const produtos = porCategoria[cat.id] ?? []
          if (!produtos.length) return null
          return (
            <section key={cat.id}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-500">
                {cat.icone} {cat.nome}
              </h2>
              <ul className="space-y-2">
                {produtos.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => addItem(p)}
                      className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm transition active:scale-[0.99] hover:shadow"
                    >
                      {p.temImagem || p.imagemUrl ? (
                        <img
                          src={p.temImagem ? urlImagemProduto(restaurantId, p.id) : (p.imagemUrl ?? '')}
                          alt={p.nome ?? ''}
                          className="h-14 w-14 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-brand-50 text-2xl">🍽️</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-800">{p.nome}</span>
                        <span className="block text-sm font-bold text-brand-600">{brl(p.preco)}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">+</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </main>

      {carrinho.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-lg">
            <ul className="mb-2 max-h-40 space-y-1 overflow-y-auto">
              {carrinho.map((c, idx) => (
                <li key={`${c.produtoId}-${idx}`} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-slate-700">
                    <b>{c.qtd}×</b> {c.nome}
                  </span>
                  <button onClick={() => mudarQtd(idx, -1)} className="h-6 w-6 rounded-full bg-slate-100 font-bold text-slate-600">−</button>
                  <button onClick={() => mudarQtd(idx, +1)} className="h-6 w-6 rounded-full bg-slate-100 font-bold text-slate-600">+</button>
                </li>
              ))}
            </ul>
            {erro && <p className="mb-1 text-xs font-semibold text-rose-600">{erro}</p>}
            <button
              onClick={() => void enviar()}
              disabled={enviando || carrinho.length === 0}
              className="w-full rounded-xl bg-brand-600 py-3 font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : `Enviar pedido (${carrinho.reduce((s, c) => s + c.qtd, 0)} item(ns))`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
