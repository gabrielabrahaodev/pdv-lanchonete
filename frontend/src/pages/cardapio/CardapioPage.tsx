import { useMemo } from 'react'
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

/** Cardápio digital SOMENTE LEITURA (QR da mesa). Pedidos só pelo atendente. */
export default function CardapioPage() {
  const { restaurantId = '', mesaId = '' } = useParams()

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

  return (
    <div className="min-h-full bg-slate-100 pb-10">
      <header className="bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 px-5 py-7 text-white">
        <h1 className="text-2xl font-extrabold">🍔 Cardápio</h1>
        <p className="mt-0.5 text-sm text-slate-300">Mesa {mesaId.replace('mesa_', '')} · chame o atendente para pedir</p>
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
                    <div className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm">
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
                        <span className="block text-sm font-bold text-brand-600">
                          {(p.variacoes?.length ?? 0) > 0 ? `a partir de ${brl(p.preco)}` : brl(p.preco)}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </main>
    </div>
  )
}
