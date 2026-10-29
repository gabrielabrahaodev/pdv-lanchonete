import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderOpen } from 'lucide-react'
import { api } from '../../lib/api'
import { useCategorias, useProdutos } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { Category, Product } from '../../types'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingScreen, Modal } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'

const ICONES = ['🍔', '🍕', '🌭', '🍟', '🥤', '🍺', '🍰', '☕', '🥗', '🍗', '🌮', '📦']

type FormState = { nome: string; icone: string; ordem: string; ativo: boolean }
const VAZIO: FormState = { nome: '', icone: '', ordem: '0', ativo: true }

export default function CategoriasPage() {
  const qc = useQueryClient()
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<Category | null>(null)
  const [form, setForm] = useState<FormState>(VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const { me } = useAuth()
  const rid = me?.restaurantId

  const categorias = useCategorias(rid)

  const produtos = useProdutos(rid)

  function abrirNova() {
    setEditando(null)
    setForm(VAZIO)
    setErro(null)
    setModalAberto(true)
  }

  function abrirEdicao(c: Category) {
    setEditando(c)
    setForm({ nome: c.nome, icone: c.icone ?? '', ordem: String(c.ordem ?? 0), ativo: c.ativo })
    setErro(null)
    setModalAberto(true)
  }

  const salvar = useMutation({
    mutationFn: () => {
      const body = {
        nome: form.nome.trim(),
        icone: form.icone.trim() || null,
        ordem: Number(form.ordem) || 0,
        ativo: form.ativo,
      }
      return editando
        ? api(`/categorias/${editando.id}`, { method: 'PATCH', body })
        : api('/categorias', { method: 'POST', body })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cardapio-publico'] })
      setModalAberto(false)
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar'),
  })

  const toggleAtivo = useMutation({
    mutationFn: (c: Category) => api(`/categorias/${c.id}`, { method: 'PATCH', body: { ativo: !c.ativo } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cardapio-publico'] })
    },
  })

  const remover = useMutation({
    mutationFn: (c: Category) => api(`/categorias/${c.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cardapio-publico'] })
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao remover'),
  })

  function pedirRemocao(c: Category) {
    const emUso = (produtos.data ?? []).filter((p) => p.categoriaId === c.id).length
    if (emUso > 0) {
      window.alert(`Não dá para excluir: ${emUso} produto(s) pertencem a "${c.nome}". Mova-os para outra categoria primeiro.`)
      return
    }
    if (window.confirm(`Excluir a categoria "${c.nome}"?`)) remover.mutate(c)
  }

  if (categorias.isLoading || produtos.isLoading) return <LoadingScreen />
  if (categorias.isError) return <ErrorState error={categorias.error} />

  const ordenadas = [...(categorias.data ?? [])].sort((a, b) => a.ordem - b.ordem)

  return (
    <div className="pdv-page p-3 sm:p-5 lg:p-6">
      <PageHeader
        title="Categorias"
        subtitle={`${ordenadas.length} categoria(s)`}
        actions={<Button onClick={abrirNova}>+ Nova categoria</Button>}
      />
      <p className="-mt-3 mb-4 text-xs text-slate-500 dark:text-slate-400">
        A ordem define a sequência no cardápio digital e nos filtros. Categorias inativas somem do cardápio QR.
      </p>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="pdv-table pdv-records w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th scope="col" className="px-5 py-3">Categoria</th>
              <th scope="col" className="px-5 py-3">Ordem</th>
              <th scope="col" className="px-5 py-3">Produtos</th>
              <th scope="col" className="px-5 py-3">Status</th>
              <th scope="col" className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {ordenadas.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td data-label="Categoria" className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-100">
                  {c.icone ? `${c.icone} ` : ''}{c.nome}
                </td>
                <td data-label="Ordem" className="px-5 py-3 text-slate-500 dark:text-slate-400">{c.ordem}</td>
                <td data-label="Produtos" className="px-5 py-3 text-slate-500 dark:text-slate-400">
                  {(produtos.data ?? []).filter((p) => p.categoriaId === c.id).length}
                </td>
                <td data-label="Status" className="px-5 py-3">
                  <button className="min-h-11 min-w-11 lg:min-h-9" aria-label={`${c.ativo ? 'Desativar' : 'Ativar'} ${c.nome}`} onClick={() => toggleAtivo.mutate(c)} disabled={toggleAtivo.isPending}>
                    <Badge value={c.ativo ? 'ativo' : 'inativa'} label={c.ativo ? 'ativa' : 'inativa'} />
                  </button>
                </td>
                <td data-label="Ações" className="px-5 py-3 text-right"><div className="flex flex-wrap justify-end gap-2">
                  <button onClick={() => abrirEdicao(c)} className="text-xs font-semibold text-brand-600 action-button">
                    Editar
                  </button>
                  <button onClick={() => pedirRemocao(c)} disabled={remover.isPending} className="text-xs font-semibold text-rose-500 action-button">
                    Excluir
                  </button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {ordenadas.length === 0 && (
          <EmptyState
            icon={<FolderOpen className="h-10 w-10 text-slate-300" strokeWidth={1.5} aria-hidden="true" />}
            message="Nenhuma categoria criada ainda."
          />
        )}
      </Card>

      <Modal title={editando ? 'Editar categoria' : 'Nova categoria'} open={modalAberto} onClose={() => setModalAberto(false)}>
        <div className="space-y-4">
          <Field label="Nome">
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Burgers" required />
          </Field>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ícone (opcional)</span>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {ICONES.map((ico) => (
                <button
                  key={ico}
                  type="button"
                  onClick={() => setForm({ ...form, icone: form.icone === ico ? '' : ico })}
                  className={`grid h-11 w-11 place-items-center rounded-lg text-lg ring-1 transition ${
                    form.icone === ico ? 'bg-brand-100 ring-brand-400' : 'ring-slate-200 hover:bg-slate-50 dark:ring-slate-700'
                  }`}
                >
                  {ico}
                </button>
              ))}
            </div>
            <Input value={form.icone} onChange={(e) => setForm({ ...form, icone: e.target.value })} placeholder="ou cole qualquer emoji" maxLength={4} className="w-24" />
          </div>

          <Field label="Ordem de exibição">
            <Input inputMode="numeric" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} className="w-24" />
          </Field>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="h-4 w-4 accent-brand-600" />
            Categoria ativa (aparece no cardápio digital)
          </label>

          {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{erro}</p>}

          <Button className="w-full" loading={salvar.isPending} disabled={!form.nome.trim()} onClick={() => salvar.mutate()}>
            {editando ? 'Salvar alterações' : 'Criar categoria'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
