import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Pencil, Sandwich, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { useCategorias, useProdutos } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { Product } from '../../types'
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

  const categoria = (p: Product) =>
    (categorias.data ?? []).find((c) => c.id === p.categoriaId)?.nome ?? '—'

  const imagem = (p: Product) => p.temImagem ? (
    <img src={urlImagemProduto(me?.restaurantId ?? '', p.id)} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" loading="lazy" />
  ) : (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 dark:bg-slate-800" aria-hidden="true">🍽️</span>
  )

  const status = (p: Product) => (
    <div className="flex flex-wrap items-center gap-x-2">
      <button
        onClick={() => toggleAtivo.mutate(p)}
        disabled={toggleAtivo.isPending}
        aria-label={`${p.ativo ? 'Desativar' : 'Ativar'} ${p.nome}`}
        className="inline-flex min-h-11 items-center rounded-md disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${p.ativo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
          {p.ativo ? 'Ativo' : 'Inativo'}
        </span>
      </button>
      {p.precisaPreparar === false && <span className="whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">Sem preparo</span>}
    </div>
  )

  const acoes = (p: Product, mobile = false) => (
    <div className="flex items-center gap-1">
      <Link to={`/produtos/editar/${p.id}`} title="Editar" aria-label={`Editar ${p.nome}`} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 action-button rounded-lg px-2 text-xs font-semibold text-brand-600 hover:bg-slate-100 dark:text-brand-300 dark:hover:bg-slate-800">
        <Pencil className="h-4 w-4" aria-hidden="true" />{mobile && 'Editar'}
      </Link>
      <button
        onClick={() => window.confirm(`Excluir "${p.nome}"?`) && remover.mutate(p.id)}
        disabled={remover.isPending}
        title="Excluir"
        aria-label={`Excluir ${p.nome}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 action-button rounded-lg px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />{mobile && 'Excluir'}
      </button>
    </div>
  )

  if (produtos.isLoading || categorias.isLoading) return <LoadingScreen />
  if (produtos.isError) return <ErrorState error={produtos.error} />

  return (
    <div className="p-3 text-slate-800 sm:p-6 dark:text-slate-100">
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
        <Input aria-label="Buscar produto" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full sm:w-64" />
        <Select aria-label="Filtrar por categoria" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className="w-full sm:w-56">
          <option value="">Todas as categorias</option>
          {(categorias.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </Select>
      </div>

      {(toggleAtivo.isError || remover.isError) && (
        <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-400">
          {(toggleAtivo.error ?? remover.error)?.message ?? 'Não foi possível concluir a ação.'}
        </p>
      )}
      <Card className="min-w-0 overflow-hidden">
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                {['Produto', 'Categoria', 'Preço', 'Variações', 'Status', 'Ações'].map((titulo) => (
                  <th key={titulo} scope="col" className="px-3 py-2.5">{titulo}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 font-semibold">
                      {imagem(p)}<span className="break-words [overflow-wrap:anywhere]">{p.nome}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{categoria(p)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-brand-600 dark:text-brand-400">{brl(p.preco)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{p.variacoes?.length ? p.variacoes.map((v) => v.nome).join(', ') : '—'}</td>
                  <td className="px-3 py-1">{status(p)}</td>
                  <td className="px-2 py-1">{acoes(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-slate-100 lg:hidden dark:divide-slate-800">
          {lista.map((p) => (
            <li key={p.id} className="min-w-0 px-3 py-2.5">
              <div className="flex items-start gap-2">
                {imagem(p)}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <h2 className="min-w-0 break-words text-sm font-semibold [overflow-wrap:anywhere]">{p.nome}</h2>
                    <p className="shrink-0 text-sm font-bold text-brand-600 dark:text-brand-400">{brl(p.preco)}</p>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{categoria(p)}</p>
                  {!!p.variacoes?.length && <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">Variações: {p.variacoes.map((v) => v.nome).join(', ')}</p>}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2">
                {status(p)}{acoes(p, true)}
              </div>
            </li>
          ))}
        </ul>
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
