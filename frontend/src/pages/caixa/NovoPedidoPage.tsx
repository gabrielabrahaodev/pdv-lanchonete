import { AjudaContextual } from '../../wiki/componentes/AjudaContextual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, ShoppingCart, UtensilsCrossed, X } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useMesa, usePedidoAbertoDaMesa, useProdutos, useCategorias, useLotesProducao, useSessaoAtual } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { Category, Order, Product, ProductVariation } from '../../types'
import { Badge, Button, Card, ErrorState, Input, LoadingScreen, Select } from '../../components/ui'
import ProdutoCustomModal from '../../components/ProdutoCustomModal'
import { brl } from '../../lib/format'
import { urlImagemProduto } from '../../lib/imagem'

interface CartItem {
  key: string
  produtoId: string
  variacaoId?: string
  nome: string
  qtd: number
  precoUnitario: number
  observacoes?: string
}

export default function NovoPedidoPage({ balcao = false }: { balcao?: boolean }) {
  const { mesaId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const adicionando = !balcao && searchParams.get('add') === '1'
  const navigate = useNavigate()
  const { me } = useAuth()
  const rid = me?.restaurantId

  const [cart, setCart] = useState<CartItem[]>([])
  const [comandaAberta, setComandaAberta] = useState(false)
  const botaoComanda = useRef<HTMLButtonElement>(null)
  const painelComanda = useRef<HTMLElement>(null)
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [customizando, setCustomizando] = useState<{ p: Product; variacaoId?: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const categorias = useCategorias(rid)

  const produtos = useProdutos(rid, true)
  const lotes = useLotesProducao(rid)
  function disponivel(produtoId: string) {
    const saldo = (lotes.data ?? []).filter((l) => l.produtoId === produtoId && +new Date(l.validade) > Date.now()).reduce((s, l) => s + l.saldo - l.reservado, 0)
    return Math.max(0, saldo - cart.filter((i) => i.produtoId === produtoId).reduce((s, i) => s + i.qtd, 0))
  }

  const mesa = useMesa(balcao ? null : rid, mesaId)
  const sessao = useSessaoAtual(balcao ? rid : null)

  const pedidoExistente = usePedidoAbertoDaMesa(balcao ? null : rid, mesaId)

  const [envioPendente, setEnvioPendente] = useState(false)
  const envio = useRef<{
    pedidoId: string
    chave: string
    itens: { produtoId: string; variacaoId: string | null; qtd: number; observacoes: string | null }[]
  } | null>(null)

  const criarPedido = useMutation({
    mutationFn: async () => {
      if (balcao) {
        if (!envio.current) {
          envio.current = {pedidoId: '', chave: crypto.randomUUID(), itens: cart.map((i) => ({produtoId:i.produtoId, variacaoId:i.variacaoId ?? null, qtd:i.qtd, observacoes:i.observacoes ?? null}))}
        }
        setEnvioPendente(true)
        return api<{id:string}>('/pedidos/balcao', {method:'POST', body:envio.current.itens, idempotencyKey:envio.current.chave}).then((p) => p.id)
      }
      if (adicionando) {
        // Uma resposta perdida não autoriza criar outro lote: repete a mesma
        // chave e o mesmo corpo, mesmo se o listener já mudou de pedido.
        if (!envio.current) {
          const existente = pedidoExistente.data ?? null
          if (!existente) {
            throw new ApiError(409, 'O pedido desta mesa foi fechado. Volte à mesa e abra um novo pedido.')
          }
          envio.current = {
            pedidoId: existente.id, chave: crypto.randomUUID(),
            itens: cart.map((item) => ({
              produtoId: item.produtoId, variacaoId: item.variacaoId ?? null,
              qtd: item.qtd, observacoes: item.observacoes ?? null,
            })),
          }
        }
        setEnvioPendente(true)
        const lote = envio.current
        await api(`/pedidos/${lote.pedidoId}/itens/lote`, {
          method: 'POST', body: lote.itens, idempotencyKey: lote.chave,
        })
        return lote.pedidoId
      }
      return api<{ id: string }>(`/pedidos?mesa_id=${encodeURIComponent(mesaId)}`, {
        method: 'POST',
        body: cart.map((item) => ({
          produtoId: item.produtoId,
          variacaoId: item.variacaoId ?? null,
          qtd: item.qtd,
          observacoes: item.observacoes ?? null,
        })),
      }).then((p) => p.id)
    },
    onSuccess: (id) => {
      navigate(balcao ? `/caixa/pagamento/${id}` : `/caixa/mesa/${mesaId}`)
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        envio.current = null
        setEnvioPendente(false)
      }
      setErro(envio.current
        ? 'Não foi possível confirmar o envio. Toque em "Tentar novamente" para conferir o mesmo lote sem duplicar itens.'
        : e instanceof Error ? e.message : 'Erro ao salvar pedido')
    },
  })

  const produtosFiltrados = useMemo(() => {
    let lista = produtos.data ?? []
    if (categoriaFiltro) lista = lista.filter((p) => p.categoriaId === categoriaFiltro)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      lista = lista.filter((p) => p.nome.toLowerCase().includes(q))
    }
    return lista
  }, [produtos.data, categoriaFiltro, busca])

  const total = cart.reduce((s, i) => s + i.precoUnitario * i.qtd, 0)
  const quantidadeItens = cart.reduce((s, i) => s + i.qtd, 0)
  const bloqueado = envioPendente || criarPedido.isPending

  function fecharComanda() {
    setComandaAberta(false)
    botaoComanda.current?.focus()
  }

  // O painel móvel pode ser fechado com Escape, sem perder o foco no botão de abertura.
  useEffect(() => {
    if (!comandaAberta) return
    const painel = painelComanda.current
    painel?.querySelector<HTMLButtonElement>('[data-fechar-comanda]')?.focus()
    const aoTeclar = (event: KeyboardEvent) => {
      if (window.matchMedia('(min-width: 1024px)').matches) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setComandaAberta(false)
        botaoComanda.current?.focus()
      } else if (event.key === 'Tab' && painel) {
        const botoes = Array.from(painel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        )).filter((el) => el.getClientRects().length > 0)
        if (!botoes.length) return
        if (event.shiftKey && document.activeElement === botoes[0]) {
          event.preventDefault()
          botoes[botoes.length - 1].focus()
        } else if (!event.shiftKey && document.activeElement === botoes[botoes.length - 1]) {
          event.preventDefault()
          botoes[0].focus()
        }
      }
    }
    const media = window.matchMedia('(min-width: 1024px)')
    const aoMudarTamanho = () => { if (media.matches) setComandaAberta(false) }
    document.addEventListener('keydown', aoTeclar)
    media.addEventListener('change', aoMudarTamanho)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      media.removeEventListener('change', aoMudarTamanho)
    }
  }, [comandaAberta])

  function addToCart(produto: Product, variacao?: ProductVariation, qtd = 1, observacoes?: string) {
    if (envio.current || criarPedido.isPending) return
    if (produto.modoEstoque === 'antecipado' && (lotes.isLoading || lotes.isError || qtd > disponivel(produto.id))) {
      setErro('Quantidade indisponível na estufa. Confira os lotes e a validade.'); return
    }
    const key = `${produto.id}|${variacao?.id ?? ''}|${observacoes ?? ''}`
    setErro(null)
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.key === key)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = { ...copy[idx], qtd: copy[idx].qtd + qtd }
        return copy
      }
      return [
        ...prev,
        {
          key,
          produtoId: produto.id,
          variacaoId: variacao?.id,
          nome: produto.nome + (variacao ? ` · ${variacao.nome}` : ''),
          qtd,
          precoUnitario: produto.preco + (variacao?.precoAdicional ?? 0),
          observacoes,
        },
      ]
    })
  }

  function confirmarCustomizacao(sel: { variacaoId: string | null; qtd: number; observacoes: string | null }) {
    if (!customizando) return
    const { p } = customizando
    const variacao = p.variacoes?.find((v) => v.id === sel.variacaoId)
    addToCart(p, variacao, sel.qtd, sel.observacoes ?? undefined)
    setCustomizando(null)
  }

  function changeQtd(key: string, delta: number) {
    if (envio.current || criarPedido.isPending) return
    const item = cart.find((i) => i.key === key)
    const produto = produtos.data?.find((p) => p.id === item?.produtoId)
    if (delta > 0 && produto?.modoEstoque === 'antecipado' && disponivel(produto.id) < delta) {
      setErro('Saldo disponível da estufa insuficiente.'); return
    }
    setErro(null)
    setCart((prev) =>
      prev
        .map((i) => (i.key === key ? { ...i, qtd: i.qtd + delta } : i))
        .filter((i) => i.qtd > 0),
    )
  }

  if (categorias.isLoading || produtos.isLoading || (!balcao && mesa.isLoading) || (adicionando && pedidoExistente.isLoading))
    return <LoadingScreen />
  if (produtos.isError) return <ErrorState error={produtos.error} />

  const pedidoAberto = pedidoExistente.data ?? null

  return (
    <div className="flex min-h-full min-w-0 flex-col lg:h-full lg:min-h-0 lg:flex-row">
      {/* Catálogo */}
      <div id="catalogo-pedido" className="min-w-0 flex-1 p-3 pb-32 sm:p-6 sm:pb-32 lg:min-h-0 lg:overflow-y-auto lg:pb-6">
        <div className="min-w-0 pl-14 md:pl-0">
        <Link to={adicionando ? `/caixa/mesa/${mesaId}` : '/caixa'} className="action-button text-xs font-semibold text-brand-600">
          ← Voltar
        </Link>
        <h1 className="mt-1 break-words text-xl font-bold text-slate-800 dark:text-slate-100">
          {balcao ? 'Venda direta — balcão' : `Mesa ${mesa.data?.numero} — ${adicionando ? 'adicionar itens' : 'novo pedido'}`}
        </h1>
        <AjudaContextual />
        </div>

        {balcao && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Escolha os produtos e prossiga para o pagamento. Nenhuma mesa será ocupada.</p>}
        {balcao && !sessao.isLoading && !sessao.data && <p role="alert" className="mt-3 text-rose-600">Abra o caixa para iniciar uma venda direta.</p>}
        {erro && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {erro}
          </div>
        )}

        <div className="mt-4 flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:flex-wrap dark:border-slate-800 dark:bg-slate-900">
          <Input placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produto" className="min-w-0 !w-full sm:!w-56" />
          <Select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} aria-label="Categoria" className="min-w-0 !w-full sm:!w-52">
            <option value="">Todas as categorias</option>
            {(categorias.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.icone ? `${c.icone} ` : ''}{c.nome}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 min-[860px]:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
          {produtosFiltrados.map((p) => {
            const semEstoque = p.modoEstoque === 'antecipado' && (lotes.isLoading || lotes.isError || disponivel(p.id) <= 0)
            const temVariacoes = (p.variacoes ?? []).some((v) => v.ativo !== false)
            return (
              <Card key={p.id} className="flex min-w-0 flex-col p-3 transition hover:shadow-md">
                <div className="flex min-w-0 items-start gap-3">
                  {p.temImagem && rid ? (
                    <img src={urlImagemProduto(rid, p.id)} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-slate-800 dark:text-brand-400">
                      <UtensilsCrossed className="h-8 w-8" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold text-slate-800 dark:text-slate-100">{p.nome}</p>
                    <p className="mt-1 text-sm font-bold text-brand-600 dark:text-brand-400">
                      {temVariacoes ? `A partir de ${brl(p.preco)}` : brl(p.preco)}
                    </p>
                    {p.modoEstoque === 'antecipado' && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Estufa: {lotes.isError ? 'saldo indisponível' : lotes.isLoading ? 'consultando…' : `${disponivel(p.id)} disponíveis`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
                  <Button
                    disabled={bloqueado || semEstoque}
                    className="min-w-0 !px-2 !text-xs"
                    onClick={() => temVariacoes ? setCustomizando({ p }) : addToCart(p)}
                    aria-label={temVariacoes ? `Escolher opção de ${p.nome}` : `Adicionar ${p.nome} à comanda`}
                  >
                    {!semEstoque && !temVariacoes && <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    {semEstoque ? 'Indisponível' : temVariacoes ? 'Escolher opção' : 'Adicionar'}
                  </Button>
                  <Button
                    disabled={bloqueado || semEstoque}
                    variant="secondary"
                    className="min-w-0 !px-2 !text-xs"
                    onClick={() => setCustomizando({ p })}
                    aria-label={`Personalizar ${p.nome}`}
                  >
                    Personalizar
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
        {produtosFiltrados.length === 0 && <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum produto encontrado.</p>}
      </div>

      {/* Barra móvel fixa: o usuário acessa a comanda sem rolar o catálogo. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_32px_rgba(15,23,42,0.15)] lg:hidden dark:border-slate-700 dark:bg-slate-900">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2" aria-live="polite">
            <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-slate-800 dark:text-brand-400">
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {quantidadeItens > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{quantidadeItens}</span>}
            </span>
            <span className="min-w-0 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span className="block">{quantidadeItens} {quantidadeItens === 1 ? 'item' : 'itens'}</span>
              <span className="block whitespace-nowrap font-bold text-brand-600 dark:text-brand-400">{brl(total)}</span>
            </span>
          </div>
          <button
            ref={botaoComanda}
            type="button"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            onClick={() => setComandaAberta(true)}
            aria-label={`Ver comanda, ${quantidadeItens} itens, total ${brl(total)}`}
            aria-haspopup="dialog"
            aria-expanded={comandaAberta}
          >
            Ver comanda
          </button>
        </div>
      </div>

      {comandaAberta && (
        <button type="button" className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-label="Fechar comanda" onClick={fecharComanda} />
      )}

      {/* Painel lateral no desktop; gaveta acessível no celular. */}
      <aside
        ref={painelComanda}
        id="comanda-pedido"
        aria-label="Comanda"
        role={comandaAberta ? 'dialog' : undefined}
        aria-modal={comandaAberta ? true : undefined}
        className={`${comandaAberta ? 'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] rounded-t-2xl shadow-2xl' : 'hidden'} w-full min-w-0 shrink-0 flex-col border-t border-slate-200 bg-white lg:relative lg:inset-auto lg:z-auto lg:flex lg:h-full lg:max-h-none lg:w-80 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none dark:border-slate-700 dark:bg-slate-900`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-bold text-slate-700 dark:text-slate-100">Comanda</h2>
            {adicionando && pedidoAberto && <Badge value="aberto" label={`pedido ${pedidoAberto.id.slice(0, 8)}…`} />}
          </div>
          <button data-fechar-comanda type="button" onClick={fecharComanda} className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800 dark:text-slate-400" aria-label="Fechar comanda">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {cart.map((item) => {
            const produto = produtos.data?.find((p) => p.id === item.produtoId)
            return (
              <li key={item.key} className="flex items-start gap-3 px-4 py-3">
                {produto?.temImagem && rid ? (
                  <img src={urlImagemProduto(rid, produto.id)} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-slate-700 dark:text-slate-200">{item.nome}</p>
                  <p className="text-xs font-bold text-brand-600">{brl(item.precoUnitario)}</p>
                  {item.observacoes && <p className="mt-1 break-words text-xs italic text-slate-500 dark:text-slate-400">✏️ {item.observacoes}</p>}
                  <div className="mt-2">
                    <QtyStepper disabled={bloqueado} onDec={() => changeQtd(item.key, -1)} onInc={() => changeQtd(item.key, 1)} qtd={item.qtd} />
                  </div>
                </div>
              </li>
            )
          })}
          {cart.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Adicione produtos para montar a comanda.</li>}
        </ul>

        <div className="shrink-0 space-y-3 border-t border-slate-100 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:pb-5 dark:border-slate-800">
          {erro && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{erro}</p>}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Total</span>
            <span className="text-xl font-bold text-brand-600">{brl(total)}</span>
          </div>
          <Button
            className="w-full"
            disabled={cart.length === 0 || (balcao && !envioPendente && (sessao.isLoading || sessao.isError || !sessao.data))}
            loading={criarPedido.isPending}
            onClick={() => criarPedido.mutate()}
          >
            {envioPendente && criarPedido.isError ? 'Tentar novamente' : balcao ? 'Ir para pagamento' : adicionando ? 'Adicionar ao pedido' : 'Abrir pedido'}
          </Button>
        </div>
      </aside>

      <ProdutoCustomModal
        key={customizando?.p.id ?? 'none'}
        produto={customizando?.p ?? null}
        variacaoInicial={customizando?.variacaoId}
        imagemUrl={customizando?.p.temImagem && rid ? urlImagemProduto(rid, customizando.p.id) : undefined}
        onClose={() => setCustomizando(null)}
        onConfirm={confirmarCustomizacao}
      />
    </div>
  )
}

function QtyStepper({ qtd, onInc, onDec, disabled }: { qtd: number; onInc: () => void; onDec: () => void; disabled?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-1 dark:bg-slate-800">
      <button disabled={disabled} aria-label="Diminuir quantidade" onClick={onDec} className="min-h-11 min-w-11 px-2 text-slate-500 hover:text-rose-600 dark:text-slate-400">−</button>
      <span className="min-w-5 text-center text-sm font-bold">{qtd}</span>
      <button disabled={disabled} aria-label="Aumentar quantidade" onClick={onInc} className="min-h-11 min-w-11 px-2 text-slate-500 hover:text-emerald-600 dark:text-slate-400">+</button>
    </div>
  )
}
