import { useEffect, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { comprimirImagem, urlImagemProduto } from '../../lib/imagem'
import type { Category, InventoryItem, ProductDraft } from '../../types'
import { Button, Card, ErrorState, Field, Input, LoadingScreen, Select } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

type VariacaoForm = { id: string; nome: string; precoAdicional: string; ativo: boolean }
type IngredienteForm = { itemId: string; qtd: string }

export default function ProdutoFormPage() {
  const { produtoId } = useParams()
  const editando = !!produtoId
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { me } = useAuth()

  const categorias = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api<Category[]>('/categorias'),
  })

  const estoque = useQuery({
    queryKey: ['estoque'],
    queryFn: () => api<InventoryItem[]>('/estoque/itens'),
  })

  const produto = useQuery({
    queryKey: ['produtos', produtoId],
    queryFn: () => api<ProductDraft>(`/produtos/${produtoId}`),
    enabled: editando,
  })

  const [form, setForm] = useState({
    nome: '',
    categoriaId: '',
    preco: '',
    estoqueMinimo: '0',
    ativo: true,
    precisaPreparar: true,
  })
  const [variacoes, setVariacoes] = useState<VariacaoForm[]>([])
  const [ingredientes, setIngredientes] = useState<IngredienteForm[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const [temImagem, setTemImagem] = useState(false)
  const [novaImagem, setNovaImagem] = useState<{ imagemBase64: string; mime: 'image/jpeg' } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removerImagem, setRemoverImagem] = useState(false)

  useEffect(() => {
    if (produto.data) {
      const p = produto.data
      setForm({
        nome: p.nome,
        categoriaId: p.categoriaId,
        preco: String(p.preco).replace('.', ','),
        estoqueMinimo: String(p.estoqueMinimo ?? 0),
        ativo: p.ativo,
        precisaPreparar: p.precisaPreparar ?? true,
      })
      setTemImagem(!!p.temImagem)
      setNovaImagem(null)
      setPreview(null)
      setRemoverImagem(false)
      setVariacoes(
        (p.variacoes ?? []).map((v) => ({
          id: v.id,
          nome: v.nome,
          precoAdicional: String(v.precoAdicional).replace('.', ','),
          ativo: v.ativo,
        })),
      )
      setIngredientes(
        (p.ingredientes ?? []).map((i) => ({ itemId: i.itemId, qtd: String(i.qtd).replace('.', ',') })),
      )
    }
  }, [produto.data])

  async function escolherImagem(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-selecionar o mesmo arquivo
    if (!file) return
    try {
      const img = await comprimirImagem(file)
      setNovaImagem(img)
      setPreview(`data:image/jpeg;base64,${img.imagemBase64}`)
      setRemoverImagem(false)
      setErro(null)
    } catch {
      setErro('Não foi possível ler a imagem escolhida')
    }
  }

  function limparImagem() {
    setNovaImagem(null)
    setPreview(null)
    setRemoverImagem(true)
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const body = {
        nome: form.nome.trim(),
        categoriaId: form.categoriaId,
        preco: Number(form.preco.replace(',', '.')),
        estoqueMinimo: Number(form.estoqueMinimo) || 0,
        ativo: form.ativo,
        precisaPreparar: form.precisaPreparar,
        variacoes: variacoes.map((v) => ({
          id: v.id,
          nome: v.nome.trim(),
          precoAdicional: Number(v.precoAdicional.replace(',', '.')) || 0,
          ativo: v.ativo,
        })),
        ingredientes: ingredientes
          .filter((i) => i.itemId && Number(i.qtd.replace(',', '.')) > 0)
          .map((i) => ({ itemId: i.itemId, qtd: Number(i.qtd.replace(',', '.')) })),
      }
      const salvo = editando
        ? await api<{ id?: string }>(`/produtos/${produtoId}`, { method: 'PATCH', body })
        : await api<{ id?: string }>('/produtos', { method: 'POST', body })
      const pid = editando ? produtoId! : salvo.id!
      if (novaImagem) {
        await api(`/produtos/${pid}/imagem`, {
          method: 'PUT',
          body: { imagemBase64: novaImagem.imagemBase64, mime: novaImagem.mime },
        })
      } else if (removerImagem && produto.data?.temImagem) {
        await api(`/produtos/${pid}/imagem`, { method: 'DELETE' })
      }
      return salvo
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['produtos'] })
      navigate('/produtos')
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar'),
  })

  if (categorias.isLoading || (editando && produto.isLoading)) return <LoadingScreen />
  if (editando && produto.isError) return <ErrorState error={produto.error} />

  function addVariacao() {
    setVariacoes((v) => [...v, { id: crypto.randomUUID().slice(0, 12), nome: '', precoAdicional: '', ativo: true }])
  }

  function addIngrediente() {
    setIngredientes((i) => [...i, { itemId: '', qtd: '' }])
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link to="/produtos" className="text-xs font-semibold text-brand-600 hover:underline">← Voltar</Link>
      <h1 className="mt-1 mb-6 text-xl font-bold text-slate-800 dark:text-slate-100">{editando ? 'Editar' : 'Novo'} produto</h1>

      <Card className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nome">
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </Field>
          <Field label="Categoria">
            <Select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
              <option value="">Selecione…</option>
              {(categorias.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Select>
          </Field>
          <Field label="Preço (R$)">
            <Input inputMode="decimal" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} placeholder="0,00" />
          </Field>
          <Field label="Estoque mínimo (produção)">
            <Input inputMode="numeric" value={form.estoqueMinimo} onChange={(e) => setForm({ ...form, estoqueMinimo: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-600">Foto</span>
            <div className="flex items-center gap-3">
              {preview || (temImagem && !removerImagem && produtoId) ? (
                <img
                  src={preview ?? urlImagemProduto(me?.restaurantId ?? '', produtoId!)}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-slate-300 text-xl text-slate-500">🖼️</span>
              )}
              <div>
                <label className="inline-block cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  {novaImagem ? 'Trocar foto' : 'Escolher foto'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void escolherImagem(e)} />
                </label>
                {(temImagem || novaImagem) && (
                  <button type="button" onClick={limparImagem} className="ml-3 text-xs text-rose-500 hover:underline">
                    Remover
                  </button>
                )}
                <p className="mt-1 text-xs text-slate-500">JPG/PNG · comprimida automaticamente (~140 KB)</p>
              </div>
            </div>
          </div>
          <label className="flex items-end gap-2 pb-1 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              className="h-4 w-4 accent-brand-600"
            />
            Produto ativo
          </label>
          <label className="flex items-end gap-2 pb-1 text-sm font-medium text-slate-600" title="Desmarcado: item já nasce entregue e não aparece na cozinha">
            <input
              type="checkbox"
              checked={form.precisaPreparar}
              onChange={(e) => setForm({ ...form, precisaPreparar: e.target.checked })}
              className="h-4 w-4 accent-brand-600"
            />
            Precisa de preparo
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Variações</span>
            <Button variant="secondary" className="!px-3 !py-1 !text-xs" onClick={addVariacao}>
              + variação
            </Button>
          </div>
          <div className="space-y-2">
            {variacoes.map((v, idx) => (
              <div key={idx} className="grid grid-cols-[minmax(0,1fr)_7rem_1.5rem] items-center gap-2 rounded-lg border border-slate-200 p-2">
                <Input
                  placeholder="Nome (ex.: Com Bacon)"
                  value={v.nome}
                  onChange={(e) =>
                    setVariacoes((vs) => vs.map((x, i) => (i === idx ? { ...x, nome: e.target.value } : x)))
                  }
                />
                <Input
                  inputMode="decimal"
                  placeholder="+ R$"
                  value={v.precoAdicional}
                  onChange={(e) =>
                    setVariacoes((vs) => vs.map((x, i) => (i === idx ? { ...x, precoAdicional: e.target.value } : x)))
                  }
                />
                <button
                  onClick={() => setVariacoes((vs) => vs.filter((_, i) => i !== idx))}
                  className="px-2 text-rose-400 hover:text-rose-600"
                >
                  ✕
                </button>
              </div>
            ))}
            {variacoes.length === 0 && <p className="text-xs text-slate-500">Sem variações — o produto é vendido pelo preço base.</p>}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ingredientes da receita</span>
            <Button variant="secondary" className="!px-3 !py-1 !text-xs" onClick={addIngrediente}>
              + ingrediente
            </Button>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            Quantidade gasta por 1 unidade do produto — descontada do estoque quando o preparo inicia.
          </p>
          <div className="space-y-2">
            {ingredientes.map((ing, idx) => {
              const itemSel = (estoque.data ?? []).find((e) => e.id === ing.itemId)
              return (
                <div key={idx} className="grid grid-cols-[minmax(0,1fr)_auto_4.5rem_1.5rem] items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <Select
                    value={ing.itemId}
                    onChange={(e) =>
                      setIngredientes((is) => is.map((x, i) => (i === idx ? { ...x, itemId: e.target.value } : x)))
                    }
                  >
                    <option value="">Selecione o item…</option>
                    {(estoque.data ?? []).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome} ({e.unidade})
                      </option>
                    ))}
                  </Select>
                  <span className="text-xs text-slate-500">{itemSel?.unidade ?? ''}</span>
                  <Input
                    inputMode="decimal"
                    placeholder="Qtd"
                    value={ing.qtd}
                    onChange={(e) =>
                      setIngredientes((is) => is.map((x, i) => (i === idx ? { ...x, qtd: e.target.value } : x)))
                    }
                  />
                  <button
                    onClick={() => setIngredientes((is) => is.filter((_, i) => i !== idx))}
                    className="px-2 text-rose-400 hover:text-rose-600"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
            {ingredientes.length === 0 && (
              <p className="text-xs text-slate-500">Sem receita cadastrada — nenhuma baixa de estoque será feita.</p>
            )}
          </div>
        </div>

        {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}

        <Button
          className="w-full py-2.5"
          loading={salvar.isPending}
          disabled={!form.nome.trim() || !form.categoriaId || !form.preco}
          onClick={() => salvar.mutate()}
        >
          {editando ? 'Salvar alterações' : 'Criar produto'}
        </Button>
      </Card>
    </div>
  )
}
