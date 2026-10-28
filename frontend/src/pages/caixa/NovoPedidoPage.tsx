import { useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { useMesa, usePedidoAbertoDaMesa, useProdutos, useCategorias, useLotesProducao, useSessaoAtual } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { Category, Order, Product, ProductVariation } from '../../types'
import { Badge, Button, Card, ErrorState, Input, LoadingScreen, Select } from '../../components/ui'
import ProdutoCustomModal from '../../components/ProdutoCustomModal'
import { brl } from '../../lib/format'

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

  function addToCart(produto: Product, variacao?: ProductVariation, qtd = 1, observacoes?: string) {
    if (envio.current) return
    if (produto.modoEstoque === 'antecipado' && (lotes.isLoading || lotes.isError || qtd > disponivel(produto.id))) {
      setErro('Quantidade indisponível na estufa. Confira os lotes e a validade.'); return
    }
    const key = `${produto.id}|${variacao?.id ?? ''}|${observacoes ?? ''}`
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
    if (envio.current) return
    const item = cart.find((i) => i.key === key)
    const produto = produtos.data?.find((p) => p.id === item?.produtoId)
    if (delta > 0 && produto?.modoEstoque === 'antecipado' && disponivel(produto.id) < delta) {
      setErro('Saldo disponível da estufa insuficiente.'); return
    }
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
      <div id="catalogo-pedido" className="min-w-0 p-3 sm:p-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <div className="min-w-0 pl-14 md:pl-0">
        <Link to={adicionando ? `/caixa/mesa/${mesaId}` : '/caixa'} className="text-xs font-semibold text-brand-600 action-button">
          ← Voltar
        </Link>
        <h1 className="mt-1 break-words text-xl font-bold text-slate-800 dark:text-slate-100">
          {balcao ? 'Venda direta — balcão' : `Mesa ${mesa.data?.numero} — ${adicionando ? 'adicionar itens' : 'novo pedido'}`}
        </h1>
        </div>
        <a href="#comanda-pedido" className="mt-3 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-brand-600 action-button lg:hidden">
          Ver comanda ({cart.reduce((qtd, item) => qtd + item.qtd, 0)} itens) · {brl(total)}
        </a>

        {balcao && <p className="mt-3 text-sm text-slate-500">Escolha os produtos e prossiga para o pagamento. Nenhuma mesa será ocupada.</p>}
        {balcao && !sessao.isLoading && !sessao.data && <p role="alert" className="mt-3 text-rose-600">Abra o caixa para iniciar uma venda direta.</p>}
        {erro && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {erro}
          </div>
        )}

        <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
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

        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {produtosFiltrados.map((p) => (
            <Card key={p.id} className="flex min-w-0 flex-col p-4 transition hover:shadow-md">
              <button
                type="button"
                disabled={envioPendente || (p.modoEstoque === 'antecipado' && (lotes.isLoading || lotes.isError || disponivel(p.id) <= 0))}
                onClick={() => setCustomizando({ p })}
                className="min-w-0 break-words text-left"
                title="Personalizar e adicionar"
              >
                <p className="font-semibold text-slate-800 dark:text-slate-100">{p.nome}</p>
                <p className="text-sm text-brand-600">
                  {p.variacoes?.some((v) => v.ativo) ? `a partir de ${brl(p.preco)}` : brl(p.preco)}
                </p>
              </button>
              {p.modoEstoque === 'antecipado' && <p className="mt-2 text-xs text-slate-500">Estufa: {lotes.isError ? 'saldo indisponível' : lotes.isLoading ? 'consultando…' : `${disponivel(p.id)} disponíveis`}</p>}
              <div className="mt-auto pt-3">
                <div className="flex flex-wrap gap-1.5">
                  <Button disabled={envioPendente || (p.modoEstoque === 'antecipado' && (lotes.isLoading || lotes.isError || disponivel(p.id) <= 0))} variant="secondary" className="!px-2 !py-1 !text-xs min-h-11" onClick={() => setCustomizando({ p })}>
                    Personalizar
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
        {produtosFiltrados.length === 0 && <p className="mt-10 text-center text-sm text-slate-500">Nenhum produto encontrado.</p>}
      </div>

      {/* Carrinho */}
      <aside id="comanda-pedido" aria-label="Comanda" className="flex w-full min-w-0 shrink-0 scroll-mt-16 flex-col border-t border-slate-200 bg-white lg:min-h-0 lg:w-80 lg:scroll-mt-0 lg:border-t-0 lg:border-l dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-700 dark:text-slate-100">Comanda</h2>
          <a href="#catalogo-pedido" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 action-button lg:hidden">Voltar aos produtos</a>
          {adicionando && pedidoAberto && <Badge value="aberto" label={`pedido ${pedidoAberto.id.slice(0, 8)}…`} />}
        </div>

        <ul className="divide-y divide-slate-50 lg:min-h-0 lg:flex-1 lg:overflow-y-auto dark:divide-slate-800">
          {cart.map((item) => (
            <li key={item.key} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 basis-32">
                  <p className="break-words text-sm font-semibold text-slate-700 dark:text-slate-200">{item.nome}</p>
                  <p className="text-xs text-brand-600">{brl(item.precoUnitario)}</p>
                  {item.observacoes && <p className="mt-0.5 break-words text-xs italic text-slate-500">✏️ {item.observacoes}</p>}
                </div>
                <QtyStepper disabled={envioPendente} onDec={() => changeQtd(item.key, -1)} onInc={() => changeQtd(item.key, 1)} qtd={item.qtd} />
              </div>
            </li>
          ))}
          {cart.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-500">Toque nos produtos para adicionar</li>}
        </ul>

        <div className="shrink-0 space-y-3 border-t border-slate-100 p-4 sm:p-5 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">Total</span>
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
        onClose={() => setCustomizando(null)}
        onConfirm={confirmarCustomizacao}
      />
    </div>
  )
}

function QtyStepper({ qtd, onInc, onDec, disabled }: { qtd: number; onInc: () => void; onDec: () => void; disabled?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-1 dark:bg-slate-800">
      <button disabled={disabled} aria-label="Diminuir quantidade" onClick={onDec} className="min-h-11 min-w-11 px-2 text-slate-500 hover:text-rose-600">−</button>
      <span className="min-w-5 text-center text-sm font-bold">{qtd}</span>
      <button disabled={disabled} aria-label="Aumentar quantidade" onClick={onInc} className="min-h-11 min-w-11 px-2 text-slate-500 hover:text-emerald-600">+</button>
    </div>
  )
}
