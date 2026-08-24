import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import type { Category, Product, ProductVariation } from '../../types'
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

export default function NovoPedidoPage() {
  const { mesaId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const adicionando = searchParams.get('add') === '1'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [cart, setCart] = useState<CartItem[]>([])
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [customizando, setCustomizando] = useState<{ p: Product; variacaoId?: string } | null>(null)

  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api<Category[]>('/categorias'),
    staleTime: 60_000,
  })

  const produtos = useQuery({
    queryKey: ['produtos', 'ativos'],
    queryFn: () => api<Product[]>('/produtos?apenas_ativos=true'),
    staleTime: 60_000,
  })

  const mesa = useQuery({
    queryKey: ['mesas', mesaId],
    queryFn: () => api<import('../../types').Mesa[]>(`/mesas`).then((ms) => ms.find((m) => m.id === mesaId) ?? null),
  })

  const pedidoExistente = useQuery({
    queryKey: ['pedidos', 'mesa', mesaId],
    queryFn: () => api<import('../../types').Order[]>(`/pedidos?mesa_id=${mesaId}`),
    enabled: adicionando,
  })

  const criarPedido = useMutation({
    mutationFn: async () => {
      const existente = (pedidoExistente.data ?? []).find((p) => p.status === 'aberto')
      if (existente) {
        for (const item of cart) {
          await api(`/pedidos/${existente.id}/itens`, {
            method: 'POST',
            body: {
              produtoId: item.produtoId,
              variacaoId: item.variacaoId ?? null,
              qtd: item.qtd,
              observacoes: item.observacoes ?? null,
            },
          })
        }
        return existente.id
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] })
      qc.invalidateQueries({ queryKey: ['mesas'] })
      navigate(`/caixa/mesa/${mesaId}`)
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
    setCart((prev) =>
      prev
        .map((i) => (i.key === key ? { ...i, qtd: i.qtd + delta } : i))
        .filter((i) => i.qtd > 0),
    )
  }

  if (categorias.isLoading || produtos.isLoading || mesa.isLoading || (adicionando && pedidoExistente.isLoading))
    return <LoadingScreen />
  if (produtos.isError) return <ErrorState error={produtos.error} />

  const pedidoAberto = (pedidoExistente.data ?? []).find((p) => p.status === 'aberto')

  return (
    <div className="flex h-full">
      {/* Catálogo */}
      <div className="flex-1 overflow-y-auto p-6">
        <Link to={adicionando ? `/caixa/mesa/${mesaId}` : '/caixa'} className="text-xs font-semibold text-brand-600 hover:underline">
          ← Voltar
        </Link>
        <h1 className="mt-1 text-xl font-bold text-slate-800">
          Mesa {mesa.data?.numero} — {adicionando ? 'adicionar itens' : 'novo pedido'}
        </h1>

        <div className="mt-4 flex flex-wrap gap-2">
          <Input placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-56" />
          <Select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className="w-52">
            <option value="">Todas as categorias</option>
            {(categorias.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.icone ? `${c.icone} ` : ''}{c.nome}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {produtosFiltrados.map((p) => (
            <Card key={p.id} className="flex flex-col p-4 transition hover:shadow-md">
              <button
                type="button"
                onClick={() => setCustomizando({ p })}
                className="text-left"
                title="Personalizar e adicionar"
              >
                <p className="font-semibold text-slate-800">{p.nome}</p>
                <p className="text-sm text-brand-600">
                  {p.variacoes?.some((v) => v.ativo) ? `a partir de ${brl(p.preco)}` : brl(p.preco)}
                </p>
              </button>
              <div className="mt-auto pt-3">
                {p.variacoes?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="secondary" className="!px-2 !py-1 !text-xs" onClick={() => setCustomizando({ p })}>
                      Personalizar
                    </Button>
                    {p.variacoes
                      .filter((v) => v.ativo)
                      .map((v) => (
                        <button
                          key={v.id}
                          onClick={() => setCustomizando({ p, variacaoId: v.id })}
                          className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100"
                        >
                          {v.nome}
                          {v.precoAdicional > 0 ? ` (+${brl(v.precoAdicional)})` : ''}
                        </button>
                      ))}
                  </div>
                ) : (
                  <Button variant="secondary" className="w-full !py-1 !text-xs" onClick={() => setCustomizando({ p })}>
                    Adicionar
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
        {produtosFiltrados.length === 0 && <p className="mt-10 text-center text-sm text-slate-400">Nenhum produto encontrado.</p>}
      </div>

      {/* Carrinho */}
      <aside className="flex w-80 flex-col border-l border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-700">Comanda</h2>
          {adicionando && pedidoAberto && <Badge value="aberto" label={`pedido ${pedidoAberto.id.slice(0, 8)}…`} />}
        </div>

        <ul className="flex-1 divide-y divide-slate-50 overflow-y-auto">
          {cart.map((item) => (
            <li key={item.key} className="px-5 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-700">{item.nome}</p>
                  <p className="text-xs text-brand-600">{brl(item.precoUnitario)}</p>
                  {item.observacoes && <p className="mt-0.5 text-xs italic text-slate-400">✏️ {item.observacoes}</p>}
                </div>
                <QtyStepper onDec={() => changeQtd(item.key, -1)} onInc={() => changeQtd(item.key, 1)} qtd={item.qtd} />
              </div>
            </li>
          ))}
          {cart.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-400">Toque nos produtos para adicionar</li>}
        </ul>

        <div className="space-y-3 border-t border-slate-100 p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">Total</span>
            <span className="text-xl font-bold text-brand-600">{brl(total)}</span>
          </div>
          <Button
            className="w-full"
            disabled={cart.length === 0}
            loading={criarPedido.isPending}
            onClick={() => criarPedido.mutate()}
          >
            {adicionando ? 'Adicionar ao pedido' : 'Abrir pedido'}
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

function QtyStepper({ qtd, onInc, onDec }: { qtd: number; onInc: () => void; onDec: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-slate-100 px-1">
      <button onClick={onDec} className="px-2 text-slate-500 hover:text-rose-600">−</button>
      <span className="min-w-5 text-center text-sm font-bold">{qtd}</span>
      <button onClick={onInc} className="px-2 text-slate-500 hover:text-emerald-600">+</button>
    </div>
  )
}
