import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import type { Category, Product } from '../../types'
import { Button, Card, EmptyState, ErrorState, Input, LoadingScreen, Select } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { brl } from '../../lib/format'

export default function ProdutosPage() {
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')

  const produtos = useQuery({
    queryKey: ['produtos'],
    queryFn: () => api<Product[]>('/produtos'),
    refetchInterval: 30_000,
  })

  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api<Category[]>('/categorias'),
    staleTime: 60_000,
  })

  const toggleAtivo = useMutation({
    mutationFn: (p: Product) => api(`/produtos/${p.id}`, { method: 'PATCH', body: { ativo: !p.ativo } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['produtos'] }),
  })

  const remover = useMutation({
    mutationFn: (id: string) => api(`/produtos/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['produtos'] }),
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
    <div className="p-6">
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
        <Input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-64" />
        <Select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className="w-56">
          <option value="">Todas as categorias</option>
          {(categorias.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </Select>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
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
                <td className="px-5 py-3 font-semibold text-slate-800">{p.nome}</td>
                <td className="px-5 py-3 text-slate-500">
                  {(categorias.data ?? []).find((c) => c.id === p.categoriaId)?.nome ?? '—'}
                </td>
                <td className="px-5 py-3 font-semibold text-brand-600">{brl(p.preco)}</td>
                <td className="px-5 py-3 text-xs text-slate-400">
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
        {lista.length === 0 && <EmptyState icon="🍔" message="Nenhum produto encontrado." />}
      </Card>
    </div>
  )
}
