import { useEffect, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { custoUnitario } from '../../lib/format'
import { unidadesCompativeis } from '../../lib/unidades'
import { numeroDecimal, precificar } from '../../lib/precificacao'
import { api } from '../../lib/api'
import { comprimirImagem, urlImagemProduto } from '../../lib/imagem'
import type { Category, InventoryItem, ProductDraft } from '../../types'
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  LoadingScreen,
  Select,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

type VariacaoForm = {
  id: string
  nome: string
  precoAdicional: string
  ativo: boolean
}
type IngredienteForm = { itemId: string; qtd: string; unidade?: string }

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

  const [aba, setAba] = useState<'dados' | 'precificacao'>('dados')
  const [acrescimo, setAcrescimo] = useState('0')
  const [form, setForm] = useState({
    modoEstoque: 'sob_pedido',
    rendimentoReceita: '1',
    unidadeVenda: 'un',
    itemRevendaId: '',
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
  const [novaImagem, setNovaImagem] = useState<{
    imagemBase64: string
    mime: 'image/jpeg'
  } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removerImagem, setRemoverImagem] = useState(false)

  useEffect(() => {
    if (produto.data) {
      const p = produto.data
      setForm({
        modoEstoque: p.modoEstoque ?? 'sob_pedido',
        rendimentoReceita: String(p.rendimentoReceita ?? 1),
        unidadeVenda: p.unidadeVenda ?? 'un',
        itemRevendaId: p.itemRevendaId ?? '',
        nome: p.nome,
        categoriaId: p.categoriaId,
        preco: String(p.preco).replace('.', ','),
        estoqueMinimo: String(p.estoqueMinimo ?? 0),
        ativo: p.ativo,
        precisaPreparar: p.precisaPreparar ?? true,
      })
      setAcrescimo(String(p.acrescimoLucroPercentual ?? 0).replace('.', ','))
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
        (p.ingredientes ?? []).map((i) => ({
          itemId: i.itemId,
          qtd: String(i.qtdInformada ?? i.qtd).replace('.', ','),
          unidade: i.unidadeInformada,
        })),
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
      if (!Number.isFinite(numeroDecimal(acrescimo)))
        throw new Error(
          'Informe um percentual de lucro válido, maior ou igual a zero.',
        )
      if (
        ingredientes.some(
          (i) =>
            !i.itemId ||
            !Number.isFinite(numeroDecimal(i.qtd)) ||
            numeroDecimal(i.qtd) <= 0,
        )
      ) {
        throw new Error(
          'Preencha o item e uma quantidade positiva em todos os ingredientes, ou remova a linha incompleta.',
        )
      }
      const rendimento = numeroDecimal(form.rendimentoReceita)
      if (
        form.modoEstoque === 'antecipado' &&
        (!Number.isInteger(rendimento) || rendimento < 1)
      )
        throw new Error('Informe um rendimento inteiro maior que zero.')
      const body = {
        modoEstoque: form.modoEstoque,
        rendimentoReceita: form.modoEstoque === 'antecipado' ? rendimento : 1,
        unidadeVenda: form.unidadeVenda.trim() || 'un',
        itemRevendaId: form.itemRevendaId || null,
        acrescimoLucroPercentual: numeroDecimal(acrescimo),
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
          .map((i) => ({
            itemId: i.itemId,
            qtd: Number(i.qtd.replace(',', '.')),
            unidade: i.unidade || undefined,
          })),
      }
      const salvo = editando
        ? await api<{ id?: string }>(`/produtos/${produtoId}`, {
            method: 'PATCH',
            body,
          })
        : await api<{ id?: string }>('/produtos', { method: 'POST', body })
      const pid = editando ? produtoId! : salvo.id!
      if (novaImagem) {
        await api(`/produtos/${pid}/imagem`, {
          method: 'PUT',
          body: {
            imagemBase64: novaImagem.imagemBase64,
            mime: novaImagem.mime,
          },
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

  const receitaCusto =
    form.modoEstoque === 'revenda'
      ? [{ itemId: form.itemRevendaId, qtd: '1' }]
      : ingredientes
  const calculo = precificar(
    receitaCusto,
    estoque.data ?? [],
    acrescimo,
    form.modoEstoque === 'antecipado'
      ? numeroDecimal(form.rendimentoReceita)
      : 1,
  )
  const moeda = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  if (categorias.isLoading || (editando && produto.isLoading))
    return <LoadingScreen />
  if (editando && produto.isError) return <ErrorState error={produto.error} />

  function addVariacao() {
    setVariacoes((v) => [
      ...v,
      {
        id: crypto.randomUUID().slice(0, 12),
        nome: '',
        precoAdicional: '',
        ativo: true,
      },
    ])
  }

  function addIngrediente() {
    setIngredientes((i) => [...i, { itemId: '', qtd: '' }])
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-3 sm:p-6">
      <div className="pl-14 md:pl-0">
        <Link
          to="/produtos"
          className="text-xs font-semibold text-brand-600 hover:underline"
        >
          ← Voltar
        </Link>
        <h1 className="mt-1 mb-6 text-xl font-bold text-slate-800 dark:text-slate-100">
          {editando ? 'Editar' : 'Novo'} produto
        </h1>
      </div>

      <Card className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2" aria-label="Seções do produto">
          <Button
            variant={aba === 'dados' ? 'primary' : 'secondary'}
            aria-pressed={aba === 'dados'}
            onClick={() => setAba('dados')}
          >
            Dados do produto
          </Button>
          <Button
            variant={aba === 'precificacao' ? 'primary' : 'secondary'}
            aria-pressed={aba === 'precificacao'}
            onClick={() => setAba('precificacao')}
          >
            Precificação
          </Button>
        </div>
        <div hidden={aba !== 'dados'} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Como controlar o estoque?">
              <Select
                value={form.modoEstoque}
                onChange={(e) =>
                  setForm({ ...form, modoEstoque: e.target.value })
                }
              >
                <option value="sob_pedido">Preparado sob pedido</option>
                <option value="antecipado">
                  Produzido antecipadamente (estufa)
                </option>
                <option value="revenda">Revenda (unidade do estoque)</option>
              </Select>
            </Field>
            <Field label="Unidade de venda" hint="Ex.: un, pão, fatia, bolo.">
              <Input
                value={form.unidadeVenda}
                onChange={(e) =>
                  setForm({ ...form, unidadeVenda: e.target.value })
                }
              />
            </Field>
            {form.modoEstoque === 'antecipado' && (
              <Field
                label="Rendimento de uma receita"
                hint="Quantas unidades prontas a receita completa produz?"
              >
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={form.rendimentoReceita}
                  onChange={(e) =>
                    setForm({ ...form, rendimentoReceita: e.target.value })
                  }
                />
              </Field>
            )}
            {form.modoEstoque === 'revenda' && (
              <Field
                label="Item do estoque"
                hint="Cada unidade vendida consome 1 unidade deste item."
              >
                <Select
                  value={form.itemRevendaId}
                  onChange={(e) =>
                    setForm({ ...form, itemRevendaId: e.target.value })
                  }
                >
                  <option value="">Selecione…</option>
                  {(estoque.data ?? [])
                    .filter(
                      (i) => i.ativo !== false || i.id === form.itemRevendaId,
                    )
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nome} ({i.unidade})
                      </option>
                    ))}
                </Select>
              </Field>
            )}
            {form.modoEstoque === 'antecipado' && (
              <p className="text-sm text-slate-500 sm:col-span-2">
                Produza os lotes em Produção e Estufa. Os ingredientes são
                consumidos na produção; o pedido reserva produtos prontos até a
                entrega. Aquecer não consome a receita novamente.
              </p>
            )}
            <Field label="Nome">
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
              />
            </Field>
            <Field label="Categoria">
              <Select
                value={form.categoriaId}
                onChange={(e) =>
                  setForm({ ...form, categoriaId: e.target.value })
                }
              >
                <option value="">Selecione…</option>
                {(categorias.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Preço (R$)">
              <Input
                inputMode="decimal"
                value={form.preco}
                onChange={(e) => setForm({ ...form, preco: e.target.value })}
                placeholder="0,00"
              />
            </Field>
            <Field label="Estoque mínimo (produção)">
              <Input
                inputMode="numeric"
                value={form.estoqueMinimo}
                onChange={(e) =>
                  setForm({ ...form, estoqueMinimo: e.target.value })
                }
              />
            </Field>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-600">
                Foto
              </span>
              <div className="flex items-center gap-3">
                {preview || (temImagem && !removerImagem && produtoId) ? (
                  <img
                    src={
                      preview ??
                      urlImagemProduto(me?.restaurantId ?? '', produtoId!)
                    }
                    alt=""
                    className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                  />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-slate-300 text-xl text-slate-500">
                    🖼️
                  </span>
                )}
                <div>
                  <label className="inline-block cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    {novaImagem ? 'Trocar foto' : 'Escolher foto'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void escolherImagem(e)}
                    />
                  </label>
                  {(temImagem || novaImagem) && (
                    <button
                      type="button"
                      onClick={limparImagem}
                      className="ml-3 text-xs text-rose-500 hover:underline"
                    >
                      Remover
                    </button>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    JPG/PNG · comprimida automaticamente (~140 KB)
                  </p>
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
            <label
              className="flex items-end gap-2 pb-1 text-sm font-medium text-slate-600"
              title="Na estufa, desmarcado significa pronto para entregar; marcado permite aquecer na cozinha"
            >
              <input
                type="checkbox"
                checked={form.precisaPreparar}
                onChange={(e) =>
                  setForm({ ...form, precisaPreparar: e.target.checked })
                }
                className="h-4 w-4 accent-brand-600"
              />
              Precisa de preparo
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Variações
              </span>
              <Button
                variant="secondary"
                className="!px-3 !py-1 !text-xs"
                onClick={addVariacao}
              >
                + variação
              </Button>
            </div>
            <div className="space-y-2">
              {variacoes.map((v, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_7rem_3rem] items-center gap-2 rounded-lg border border-slate-200 p-2"
                >
                  <Input
                    placeholder="Nome (ex.: Com Bacon)"
                    value={v.nome}
                    onChange={(e) =>
                      setVariacoes((vs) =>
                        vs.map((x, i) =>
                          i === idx ? { ...x, nome: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Input
                    inputMode="decimal"
                    placeholder="+ R$"
                    value={v.precoAdicional}
                    onChange={(e) =>
                      setVariacoes((vs) =>
                        vs.map((x, i) =>
                          i === idx
                            ? { ...x, precoAdicional: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                  <button
                    onClick={() =>
                      setVariacoes((vs) => vs.filter((_, i) => i !== idx))
                    }
                    aria-label="Remover linha"
                    className="min-h-11 min-w-11 px-2 text-rose-400 hover:text-rose-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {variacoes.length === 0 && (
                <p className="text-xs text-slate-500">
                  Sem variações — o produto é vendido pelo preço base.
                </p>
              )}
            </div>
          </div>
        </div>
        <div hidden={aba !== 'precificacao'} className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ingredientes da receita
              </span>
              <Button
                variant="secondary"
                className="!px-3 !py-1 !text-xs"
                onClick={addIngrediente}
              >
                + ingrediente
              </Button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              {form.modoEstoque === 'antecipado'
                ? `Quantidades para uma receita completa, que rende ${form.rendimentoReceita} ${form.unidadeVenda}. Na produção você informa o rendimento real.`
                : 'Informe a quantidade por unidade vendida e escolha a unidade usada. O sistema converte para o estoque.'}
            </p>
            <div className="space-y-2">
              {ingredientes.map((ing, idx) => {
                const itemSel = (estoque.data ?? []).find(
                  (e) => e.id === ing.itemId,
                )
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_3rem] items-center gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
                  >
                    <Select
                      value={ing.itemId}
                      onChange={(e) =>
                        setIngredientes((is) =>
                          is.map((x, i) =>
                            i === idx
                              ? {
                                  ...x,
                                  itemId: e.target.value,
                                  unidade: estoque.data?.find(
                                    (s) => s.id === e.target.value,
                                  )?.unidade,
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="">Selecione o item…</option>
                      {(estoque.data ?? [])
                        .filter((e) => e.ativo !== false || e.id === ing.itemId)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.nome} ({e.unidade})
                          </option>
                        ))}
                    </Select>
                    <Select
                      aria-label="Unidade do ingrediente"
                      value={ing.unidade || itemSel?.unidade || ''}
                      onChange={(e) =>
                        setIngredientes((is) =>
                          is.map((x, i) =>
                            i === idx ? { ...x, unidade: e.target.value } : x,
                          ),
                        )
                      }
                    >
                      {unidadesCompativeis(
                        itemSel?.unidade || 'un',
                        itemSel?.unidadeCompra,
                        itemSel?.fatorCompra,
                      ).map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </Select>
                    <Input
                      inputMode="decimal"
                      aria-label="Quantidade do ingrediente"
                      placeholder="Qtd"
                      value={ing.qtd}
                      onChange={(e) =>
                        setIngredientes((is) =>
                          is.map((x, i) =>
                            i === idx ? { ...x, qtd: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <button
                      onClick={() =>
                        setIngredientes((is) => is.filter((_, i) => i !== idx))
                      }
                      aria-label="Remover linha"
                      className="min-h-11 min-w-11 px-2 text-rose-400 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
              {ingredientes.length === 0 && (
                <p className="text-xs text-slate-500">
                  Sem receita cadastrada. Para produção antecipada, cadastre
                  ingredientes; revenda utiliza o item vinculado.
                </p>
              )}
            </div>
          </div>

          {estoque.isLoading && (
            <p role="status">Carregando custos do estoque…</p>
          )}
          {estoque.isError && (
            <div role="alert">
              <p>Não foi possível carregar os custos do estoque.</p>
              <Button
                variant="secondary"
                onClick={() => void estoque.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          )}
          <div className="space-y-2" aria-label="Custos por ingrediente">
            {calculo.linhas.map((linha, idx) => (
              <div
                key={idx}
                className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"
              >
                <span className="min-w-0 break-words">
                  {linha.item?.nome ?? 'Selecione um ingrediente'}
                  <br />
                  <span className="text-xs text-slate-500">
                    {linha.item
                      ? `${custoUnitario(linha.item.custoMedio)} / ${linha.item.unidade}`
                      : 'Item não encontrado'}
                  </span>
                </span>
                <span className="text-xs">
                  {Number.isFinite(linha.qtd)
                    ? linha.qtd.toLocaleString('pt-BR')
                    : '—'}{' '}
                  {linha.item?.unidade}
                </span>
                <strong>
                  {linha.custo === null
                    ? 'Custo ou quantidade pendente'
                    : moeda(linha.custo)}
                </strong>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Custo total da receita">
              <Input
                readOnly
                value={
                  calculo.custo === null
                    ? 'Receita incompleta / custos pendentes'
                    : moeda(
                        calculo.custo *
                          (form.modoEstoque === 'antecipado'
                            ? numeroDecimal(form.rendimentoReceita)
                            : 1),
                      )
                }
              />
            </Field>
            <Field label="Preço efetivo cadastrado">
              <Input readOnly value={form.preco || 'Não informado'} />
            </Field>
          </div>
          {calculo.linhas.some((l) => l.custo === null) && (
            <p
              role="status"
              className="text-sm text-amber-700 dark:text-amber-300"
            >
              Revise os ingredientes sem custo, sem unidade compatível ou com
              quantidade inválida. Nenhum preço será aplicado automaticamente.
            </p>
          )}
          <Field
            label="Acréscimo desejado sobre o custo (%)"
            hint="Acréscimo (markup): custo × (1 + percentual ÷ 100). Ex.: custo R$ 10 + 50% = R$ 15; margem sobre a venda = 33,33%."
          >
            <Input
              inputMode="decimal"
              value={acrescimo}
              onChange={(e) => setAcrescimo(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2" aria-live="polite">
            <Field label="Custo dos ingredientes por produto">
              <Input
                readOnly
                value={
                  calculo.custo === null || !estoque.isSuccess
                    ? 'Pendente'
                    : moeda(calculo.custo)
                }
              />
            </Field>
            <Field label="Preço sugerido (acréscimo sobre o custo)">
              <Input
                readOnly
                value={
                  calculo.preco === null || !estoque.isSuccess
                    ? 'Pendente'
                    : moeda(calculo.preco)
                }
              />
            </Field>
          </div>
          {calculo.preco !== null && estoque.isSuccess && (
            <p className="text-sm">
              Lucro bruto estimado: {moeda(calculo.lucro!)} · Margem sobre a
              venda:{' '}
              {calculo.margemVenda!.toLocaleString('pt-BR', {
                maximumFractionDigits: 2,
              })}
              %
            </p>
          )}
          <p className="text-xs text-slate-500">
            A estimativa considera apenas os ingredientes do produto base. Não
            inclui despesas, taxas, impostos ou ingredientes extras das
            variações. Cadastre custos maiores que zero para todos os
            ingredientes para obter a sugestão.
          </p>
          <Button
            variant="secondary"
            disabled={calculo.preco === null || !estoque.isSuccess}
            onClick={() => {
              if (calculo.preco !== null)
                setForm({
                  ...form,
                  preco: calculo.preco.toFixed(2).replace('.', ','),
                })
            }}
          >
            Usar preço sugerido
          </Button>
          <Field label="Preço de venda (R$)">
            <Input
              inputMode="decimal"
              value={form.preco}
              onChange={(e) => setForm({ ...form, preco: e.target.value })}
            />
          </Field>
        </div>

        {erro && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {erro}
          </p>
        )}

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
