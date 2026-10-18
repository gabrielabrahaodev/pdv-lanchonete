import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Sandwich } from 'lucide-react'
import { api } from '../../lib/api'
import { useCategorias, useProdutos } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { Category, Product } from '../../types'
import { Button, Card, EmptyState, ErrorState, Input, LoadingScreen, Select } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { brl } from '../../lib/format'
import { urlImagemProduto } from '../../lib/imagem'

export default function ProdutosPage() {
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const { me } = useAuth()

  const produtos = useProdutos(me?.restaurantId)

  const categorias = useCategorias(me?.restaurantId)

  const toggleAtivo = useMutation({
    mutationFn: (p: Product) => api(`/produtos/${p.id}`, { method: 'PATCH', body: { ativo: !p.ativo } }),
  })

  const remover = useMutation({
    mutationFn: (id: string) => api(`/produtos/${id}`, { method: 'DELETE' }),
  })

  const lista = useMemo(() => {
    let l = produtos.data ?? []
    if (categoriaFiltro) l = l.filter((p) => p.categoriaId === categoriaFiltro)
    if (busca.trim()) l = l.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase()))
    return [...l].sort((a, b) => a.nome.localeCompare(b.nome))
  }, [produtos.data, busca, categoriaFiltro])

  if (produtos.isLoading || categorias.isLoading) return <LoadingScreen />
  if (produtos.isError) return <ErrorState error={produtos.error} />

  return (
    <div className="p-3 sm:p-6">
      <PageHeader
        title="Produtos"
        subtitle={`${lista.length} produto(s)`}
        actions={
          <Link to="/produtos/novo">
            <Button>+ Novo produto</Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full sm:w-64" />
        <Select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className="w-full sm:w-56">
          <option value="">Todas as categorias</option>
          {(categorias.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Produto</th>
              <th className="px-5 py-3">Categoria</th>
              <th className="px-5 py-3">Preço</th>
              <th className="px-5 py-3">Variações</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3 font-semibold text-slate-800 dark:text-slate-100">
                    {p.temImagem ? (
                      <img
                        src={urlImagemProduto(me?.restaurantId ?? '', p.id)}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm dark:bg-slate-800">🍽️</span>
                    )}
                    {p.nome}
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-500">
                  {(categorias.data ?? []).find((c) => c.id === p.categoriaId)?.nome ?? '—'}
                </td>
                <td className="px-5 py-3 font-semibold text-brand-600">{brl(p.preco)}</td>
                <td className="px-5 py-3 text-xs text-slate-500">
                  {p.variacoes?.length ? p.variacoes.map((v) => v.nome).join(', ') : '—'}
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => toggleAtivo.mutate(p)}
                    disabled={toggleAtivo.isPending}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {p.ativo ? 'ativo' : 'inativo'}
                  </button>
                  {p.precisaPreparar === false && (
                    <span className="ml-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-700">
                      sem preparo
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link to={`/produtos/editar/${p.id}`} className="mr-3 text-xs font-semibold text-brand-600 hover:underline">
                    Editar
                  </Link>
                  <button
                    onClick={() => window.confirm(`Excluir "${p.nome}"?`) && remover.mutate(p.id)}
                    className="text-xs font-semibold text-rose-500 hover:underline"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="space-y-3 p-3 sm:hidden">
          {lista.map((p) => (
            <article key={p.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex min-w-0 items-start gap-3">
                {p.temImagem ? (
                  <img src={urlImagemProduto(me?.restaurantId ?? '', p.id)} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                ) : (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm dark:bg-slate-800">🍽️</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="break-words font-semibold text-slate-800 dark:text-slate-100">{p.nome}</p>
                    <p className="shrink-0 font-bold text-brand-600">{brl(p.preco)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{(categorias.data ?? []).find((c) => c.id === p.categoriaId)?.nome ?? '—'}</p>
                  {p.variacoes?.length > 0 && <p className="mt-1 break-words text-xs text-slate-500">Variações: {p.variacoes.map((v) => v.nome).join(', ')}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button onClick={() => toggleAtivo.mutate(p)} disabled={toggleAtivo.isPending} className={`min-h-11 rounded-full px-3 py-1 text-xs font-bold ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                    {p.precisaPreparar === false && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700">Sem preparo</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link to={`/produtos/editar/${p.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-semibold text-brand-700 dark:bg-slate-800 dark:text-brand-300">Editar</Link>
                    <button onClick={() => window.confirm(`Excluir "${p.nome}"?`) && remover.mutate(p.id)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-rose-500 hover:bg-rose-50">Excluir</button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
        {lista.length === 0 && (
          <EmptyState
            icon={<Sandwich className="h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden="true" />}
            message="Nenhum produto encontrado."
          />
        )}
      </Card>
    </div>
  )
}
