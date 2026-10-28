import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, BookOpenText, ChefHat, ChevronRight, Search, UtensilsCrossed, X } from 'lucide-react'
import { apiPublico } from '../../lib/apiPublico'
import { brl } from '../../lib/format'
import { urlImagemProduto } from '../../lib/imagem'
import { Modal } from '../../components/ui'
import {
  cardapioValido,
  lerCacheCardapio,
  salvarCacheCardapio,
  VALIDADE_CACHE_CARDAPIO_MS,
  type ProdutoPublico,
  type CardapioPublico,
} from '../../lib/cardapioCache'

type Produto = ProdutoPublico

const TODAS = '__todas__'
const OUTRAS = '__outras__'

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

function FotoProduto({ produto, restaurantId, className = '' }: {
  produto: Produto
  restaurantId: string
  className?: string
}) {
  const url = produto.temImagem
    ? urlImagemProduto(restaurantId, produto.id)
    : produto.imagemUrl || null
  const [falhou, setFalhou] = useState(false)

  useEffect(() => setFalhou(false), [url])

  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-orange-100 via-amber-50 to-rose-100 text-orange-500 dark:from-slate-800 dark:via-slate-800 dark:to-slate-700 dark:text-orange-300 ${className}`}>
      {url && !falhou ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFalhou(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <UtensilsCrossed className="h-9 w-9 opacity-70" strokeWidth={1.5} aria-hidden="true" />
      )}
    </span>
  )
}

/** Catálogo público, exclusivamente consultivo: pedidos continuam exclusivos do atendente. */
export default function CardapioPage() {
  const { restaurantId = '', mesaId = '' } = useParams()
  const [busca, setBusca] = useState('')
  const [categoriaAtiva, setCategoriaAtiva] = useState(TODAS)
  const [produtoDetalhe, setProdutoDetalhe] = useState<Produto | null>(null)
  const [esperaLonga, setEsperaLonga] = useState(false)

  const fecharDetalhe = useCallback(() => setProdutoDetalhe(null), [])

  const cardapio = useQuery({
    queryKey: ['cardapio-publico', restaurantId],
    queryFn: async ({ signal }) => {
      const dados = await apiPublico<CardapioPublico>(
        `/publico/${encodeURIComponent(restaurantId)}/cardapio`,
        { signal },
      )
      if (!cardapioValido(dados)) {
        throw new Error('O servidor retornou um cardápio inválido. Tente novamente.')
      }
      salvarCacheCardapio(restaurantId, dados)
      return dados
    },
    enabled: Boolean(restaurantId),
    // Apenas cache público e temporário: nunca guarda senhas ou dados privados.
    initialData: () => lerCacheCardapio(restaurantId)?.data,
    initialDataUpdatedAt: () => lerCacheCardapio(restaurantId)?.atualizadoEm,
    staleTime: VALIDADE_CACHE_CARDAPIO_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  useEffect(() => {
    if (!cardapio.isLoading) {
      setEsperaLonga(false)
      return
    }
    const timer = setTimeout(() => setEsperaLonga(true), 9_000)
    return () => clearTimeout(timer)
  }, [cardapio.isLoading])

  const categorias = useMemo(() => {
    const produtos = cardapio.data?.produtos ?? []
    const originais = cardapio.data?.categorias ?? []
    const ids = new Set(originais.map((c) => c.id))
    const listadas = originais.filter((c) => produtos.some((p) => p.categoriaId === c.id))
    const semCategoria = produtos.some((p) => !ids.has(p.categoriaId))
    return semCategoria
      ? [...listadas, { id: OUTRAS, nome: 'Outros', icone: '🍽️' }]
      : listadas
  }, [cardapio.data])

  const produtosFiltrados = useMemo(() => {
    const termo = normalizar(busca.trim())
    const idsConhecidos = new Set((cardapio.data?.categorias ?? []).map((c) => c.id))
    return (cardapio.data?.produtos ?? []).filter((p) => {
      const categoriaProduto = idsConhecidos.has(p.categoriaId) ? p.categoriaId : OUTRAS
      const categoriaOk = categoriaAtiva === TODAS || categoriaAtiva === categoriaProduto
      const nomeOk = !termo || normalizar(p.nome).includes(termo)
      return categoriaOk && nomeOk
    })
  }, [cardapio.data, categoriaAtiva, busca])

  const grupos = useMemo(() => {
    const idsConhecidos = new Set((cardapio.data?.categorias ?? []).map((c) => c.id))
    return categorias.map((categoria) => ({
      ...categoria,
      produtos: produtosFiltrados.filter((p) =>
        (idsConhecidos.has(p.categoriaId) ? p.categoriaId : OUTRAS) === categoria.id,
      ),
    })).filter((grupo) => grupo.produtos.length > 0)
  }, [categorias, produtosFiltrados, cardapio.data])

  const numeroMesa = mesaId.startsWith('mesa_') ? mesaId.slice(5) : mesaId
  const quantidade = cardapio.data?.produtos.length ?? 0
  const semResultados = cardapio.isSuccess && produtosFiltrados.length === 0

  return (
    <div className="min-h-dvh bg-[#fffaf5] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="relative isolate overflow-hidden bg-[#182332] text-white">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-40 left-1/4 h-64 w-64 rounded-full bg-amber-600/10 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-6 sm:px-8 sm:pb-16 sm:pt-10">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-950/20">
                <UtensilsCrossed className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="text-sm font-bold tracking-wide">Cardápio digital</span>
            </div>
            {mesaId && (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                Mesa {numeroMesa}
              </span>
            )}
          </div>

          <div className="mt-11 max-w-xl sm:mt-14">
            <p className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-orange-300">
              <span className="h-px w-6 bg-orange-400" aria-hidden="true" />
              Escolha o seu favorito
            </p>
            <h1 className="max-w-lg text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl">
              Sabores que fazem <span className="text-orange-400">seu dia melhor.</span>
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-300 sm:text-base">
              Explore nossas opções, conheça os preços e escolha com tranquilidade.
            </p>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 -mt-7 border-b border-orange-100/80 bg-[#fffaf5]/95 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-8">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <span className="sr-only">Buscar no cardápio</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Qual sabor você procura?"
              className="h-14 w-full rounded-2xl border border-orange-100 bg-white pl-12 pr-12 text-sm font-medium text-slate-800 shadow-lg shadow-orange-950/5 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-orange-800"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </label>
          {categorias.length > 0 && (
            <nav aria-label="Filtrar por categoria" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <button
                type="button"
                onClick={() => setCategoriaAtiva(TODAS)}
                aria-pressed={categoriaAtiva === TODAS}
                className={`min-h-11 shrink-0 rounded-full px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${categoriaAtiva === TODAS ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'border border-orange-100 bg-white text-slate-600 hover:border-orange-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                Todos
              </button>
              {categorias.map((categoria) => (
                <button
                  key={categoria.id}
                  type="button"
                  onClick={() => setCategoriaAtiva(categoria.id)}
                  aria-pressed={categoriaAtiva === categoria.id}
                  className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${categoriaAtiva === categoria.id ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'border border-orange-100 bg-white text-slate-600 hover:border-orange-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                >
                  {categoria.icone && <span aria-hidden="true" className="mr-1.5">{categoria.icone}</span>}
                  {categoria.nome}
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-7 sm:px-8 sm:pt-10">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Nosso cardápio</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Encontre seu próximo favorito</h2>
          </div>
          {cardapio.isSuccess && (
            <span className="rounded-full bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
              {produtosFiltrados.length} {produtosFiltrados.length === 1 ? 'produto' : 'produtos'}
            </span>
          )}
        </div>

        {cardapio.isLoading && (
          <div role="status" aria-label="Carregando cardápio">
            {esperaLonga && (
              <p className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm leading-6 text-orange-900 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100">
                Estamos conectando ao cardápio. O servidor pode estar iniciando e a primeira consulta pode demorar.
                Se não carregar, você poderá tentar novamente sem precisar abrir outro QR Code.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="h-36 animate-pulse rounded-2xl bg-orange-100/70 sm:h-72 dark:bg-slate-800" />
              ))}
            </div>
            <span className="sr-only">Carregando o cardápio…</span>
          </div>
        )}
        {cardapio.isError && (
          <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm dark:border-rose-900 dark:bg-slate-900">
            <BookOpenText className="mx-auto h-10 w-10 text-orange-500" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-extrabold">Não foi possível abrir o cardápio</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {cardapio.error instanceof Error ? cardapio.error.message : 'Tente novamente em instantes ou peça ajuda ao atendente.'}
            </p>
            <button type="button" onClick={() => void cardapio.refetch()} className="mt-5 min-h-11 rounded-xl bg-orange-500 px-5 text-sm font-bold text-white hover:bg-orange-600">
              Tentar novamente
            </button>
          </div>
        )}
        {semResultados && (
          <div className="rounded-2xl border border-dashed border-orange-200 bg-white px-5 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <Search className="mx-auto h-10 w-10 text-orange-300" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-bold">Nenhum produto encontrado</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {quantidade === 0 ? 'Nosso cardápio está sendo preparado. Consulte o atendente.' : 'Experimente outra busca ou veja todas as categorias.'}
            </p>
            {quantidade > 0 && (
              <button
                type="button"
                onClick={() => { setBusca(''); setCategoriaAtiva(TODAS) }}
                className="mt-4 min-h-11 rounded-full border border-orange-200 px-5 text-sm font-bold text-orange-700 hover:bg-orange-50 dark:text-orange-300"
              >
                Mostrar todos
              </button>
            )}
          </div>
        )}

        <div className="space-y-12">
          {grupos.map((grupo) => (
            <section key={grupo.id} aria-labelledby={`categoria-${grupo.id}`}>
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-100 text-xl dark:bg-orange-500/15" aria-hidden="true">
                  {grupo.icone || '🍽️'}
                </span>
                <div>
                  <h3 id={`categoria-${grupo.id}`} className="text-xl font-extrabold tracking-tight">{grupo.nome}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{grupo.produtos.length} {grupo.produtos.length === 1 ? 'opção' : 'opções'}</p>
                </div>
                <span className="ml-auto h-px flex-1 bg-orange-100 dark:bg-slate-800" aria-hidden="true" />
              </div>

              <ul className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                {grupo.produtos.map((produto) => (
                  <li key={produto.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setProdutoDetalhe(produto)}
                      aria-label={`Ver detalhes de ${produto.nome}`}
                      className="group flex h-full w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-orange-100/80 bg-white p-3 text-left shadow-[0_5px_24px_rgba(105,60,30,0.05)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_12px_30px_rgba(105,60,30,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:flex-col sm:gap-0 sm:p-0 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-orange-800"
                    >
                      <FotoProduto produto={produto} restaurantId={restaurantId} className="h-28 w-28 rounded-xl sm:h-48 sm:w-full sm:rounded-none" />
                      <span className="flex min-w-0 flex-1 flex-col justify-between gap-3 py-1 sm:p-5">
                        <span className="block">
                          <span className="block text-base font-extrabold leading-snug text-slate-900 dark:text-slate-100 sm:text-lg">{produto.nome}</span>
                          {(produto.variacoes?.length ?? 0) > 0 && (
                            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Opções disponíveis</span>
                          )}
                        </span>
                        <span className="flex flex-wrap items-end justify-between gap-2">
                          <span>
                            {(produto.variacoes?.length ?? 0) > 0 && <span className="block text-[11px] font-semibold text-slate-400">a partir de</span>}
                            <span className="block text-lg font-extrabold tracking-tight text-orange-600 dark:text-orange-400">{brl(produto.preco)}</span>
                          </span>
                          <span className="flex items-center gap-1 text-xs font-bold text-slate-500 group-hover:text-orange-600 dark:text-slate-400">
                            Ver detalhes <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-orange-100 bg-white px-5 py-9 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
            <ChefHat className="h-5 w-5 text-orange-500" aria-hidden="true" />
            Feito para você escolher com calma
          </div>
          <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            Para fazer seu pedido, chame um atendente. Este cardápio é apenas para consulta.
          </p>
        </div>
      </footer>

      {produtoDetalhe && (
        <Modal title={produtoDetalhe.nome} open onClose={fecharDetalhe}>
          <div className="space-y-4">
            <FotoProduto produto={produtoDetalhe} restaurantId={restaurantId} className="h-52 w-full rounded-xl" />
            <div className="flex items-center justify-between gap-3">
              <div>
                {(produtoDetalhe.variacoes?.length ?? 0) > 0 && (
                  <span className="text-xs text-slate-500">Preço inicial</span>
                )}
                <p className="text-2xl font-extrabold text-orange-600 dark:text-orange-400">{brl(produtoDetalhe.preco)}</p>
              </div>
              <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">Somente consulta</span>
            </div>
            {(produtoDetalhe.variacoes?.length ?? 0) > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-extrabold text-slate-800 dark:text-slate-200">Opções e preços</h3>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3 dark:divide-slate-800 dark:border-slate-700">
                  <li className="flex justify-between gap-3 py-3 text-sm text-slate-600 dark:text-slate-300">
                    <span>Tradicional</span><strong>{brl(produtoDetalhe.preco)}</strong>
                  </li>
                  {produtoDetalhe.variacoes?.map((variacao) => (
                    <li key={variacao.id} className="flex justify-between gap-3 py-3 text-sm text-slate-600 dark:text-slate-300">
                      <span>{variacao.nome}</span>
                      <strong className="shrink-0">{brl(produtoDetalhe.preco + variacao.precoAdicional)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-start gap-3 rounded-xl bg-orange-50 p-4 text-sm leading-6 text-orange-900 dark:bg-orange-500/10 dark:text-orange-100">
              <BookOpenText className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              Para pedir ou tirar dúvidas sobre ingredientes, fale com a equipe do restaurante.
            </div>
            <button type="button" onClick={fecharDetalhe} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-extrabold text-white hover:bg-orange-600">
              Voltar ao cardápio <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
