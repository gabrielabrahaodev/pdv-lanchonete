import {
  Search,
  Plus,
  Download,
  ChevronDown,
  X,
  Package,
  ClipboardList,
  SlidersHorizontal,
  Archive,
  ArrowUpDown,
  History,
  Pencil,
  ArchiveRestore,
} from 'lucide-react'
import { BotaoEstoque, SituacaoEstoque } from './EstoqueVisual'
import { AjudaContextual } from '../../wiki/componentes/AjudaContextual'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { useEstoque, useMovimentacoes } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { InventoryItem, StockMovement, Fornecedor } from '../../types'
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  LoadingScreen,
  Modal,
  Select,
} from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { brl, dataHora, custoUnitario } from '../../lib/format'
import { numeroDecimal } from '../../lib/precificacao'
import {
  custoPorUnidadeControle,
  precoPorReferencia,
  unidadeReferencia,
  formatarPrecoReferencia,
  simularCompra,
  converterCustoControle,
} from '../../lib/custosInsumos'
import {
  converterQuantidade,
  UNIDADES,
  unidadesCompativeis,
} from '../../lib/unidades'
import { baixarCsv } from '../../lib/csv'

export default function EstoquePage() {
  const { me } = useAuth()
  const gestao = ['admin', 'gerente'].includes(me?.papel ?? '')
  const estoque = useEstoque(me?.restaurantId)
  const movimentos = useMovimentacoes(me?.restaurantId)
  const fornecedores = useQuery({
    queryKey: ['fornecedores'],
    queryFn: () => api<Fornecedor[]>('/fornecedores'),
    enabled: gestao,
  })
  const [busca, setBusca] = useState('')
  const [arquivados, setArquivados] = useState(false)
  const [alertas, setAlertas] = useState(false)
  const [editar, setEditar] = useState<InventoryItem | 'novo' | null>(null)
  const [movItem, setMovItem] = useState<InventoryItem | null>(null)
  const [histItem, setHistItem] = useState<InventoryItem | null>(null)
  const [erro, setErro] = useState('')
  const arquivar = useMutation({
    mutationFn: (i: InventoryItem) =>
      api(`/estoque/itens/${i.id}`, {
        method: 'PATCH',
        body: { ativo: i.ativo === false },
      }),
    onError: (e) =>
      setErro(
        e instanceof Error ? e.message : 'Não foi possível alterar o insumo',
      ),
  })
  const historico = useQuery({
    queryKey: ['movimentos', me?.restaurantId, histItem?.id],
    queryFn: () =>
      api<StockMovement[]>(
        `/estoque/movimentacoes?item_id=${encodeURIComponent(histItem!.id)}`,
      ),
    enabled: !!histItem,
  })
  if (estoque.isLoading) return <LoadingScreen />
  if (estoque.isError) return <ErrorState error={estoque.error} />
  const itens = (estoque.data ?? []).filter(
    (i) =>
      (arquivados || i.ativo !== false) &&
      i.nome.toLowerCase().includes(busca.toLowerCase()) &&
      (!alertas || i.quantidadeAtual <= i.minimo),
  )
  const emAlerta = (i: InventoryItem) =>
    i.ativo !== false && i.quantidadeAtual <= i.minimo
  const corSaldo = (i: InventoryItem) =>
    i.ativo === false
      ? 'text-slate-500 dark:text-slate-400'
      : emAlerta(i)
        ? 'text-rose-600 dark:text-rose-300'
        : 'text-emerald-700 dark:text-emerald-400'
  const ativos = (estoque.data ?? []).filter((i) => i.ativo !== false)
  const totalAlertas = ativos.filter(emAlerta).length
  const totalArquivados = (estoque.data ?? []).length - ativos.length
  function limparFiltros() {
    setBusca('')
    setAlertas(false)
    setArquivados(false)
  }
  function acoes(i: InventoryItem, mobile = false) {
    return (
      <div
        className={
          mobile && gestao
            ? 'grid grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_2.75rem] gap-1.5'
            : 'flex items-center gap-1'
        }
      >
        {gestao && (
          <BotaoEstoque
            aria-label={`Movimentar ${i.nome}`}
            title="Movimentar estoque"
            realce
            somenteIcone={!mobile}
            disabled={i.ativo === false}
            onClick={() => setMovItem(i)}
          >
            <ArrowUpDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            {mobile && 'Movimentar'}
          </BotaoEstoque>
        )}
        {gestao && (
          <BotaoEstoque
            aria-label={`Editar ${i.nome}`}
            title="Editar insumo"
            somenteIcone
            onClick={() => setEditar(i)}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </BotaoEstoque>
        )}
        <BotaoEstoque
          aria-label={`Histórico de ${i.nome}`}
          title="Histórico do insumo"
          somenteIcone={gestao}
          onClick={() => setHistItem(i)}
        >
          <History className="h-4 w-4" aria-hidden="true" />
          {mobile && !gestao && 'Histórico'}
        </BotaoEstoque>
        {gestao && (
          <BotaoEstoque
            aria-label={`${i.ativo === false ? 'Reativar' : 'Arquivar'} ${i.nome}`}
            title={i.ativo === false ? 'Reativar insumo' : 'Arquivar insumo'}
            somenteIcone
            disabled={arquivar.isPending}
            onClick={() =>
              window.confirm(
                i.ativo === false
                  ? `Reativar ${i.nome}?`
                  : `Arquivar ${i.nome}? Receitas e histórico serão preservados.`,
              ) && arquivar.mutate(i)
            }
          >
            {i.ativo === false ? (
              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Archive className="h-4 w-4" aria-hidden="true" />
            )}
          </BotaoEstoque>
        )}
      </div>
    )
  }
  const fornecedorNome = (i: InventoryItem) =>
    (fornecedores.data ?? []).find((f) => f.id === i.fornecedorId)?.nome ??
    (i.fornecedorId ? 'Fornecedor vinculado' : 'Sem fornecedor')
  const corLinha = (i: InventoryItem) =>
    emAlerta(i)
      ? i.quantidadeAtual <= 0
        ? 'bg-rose-50/40 dark:bg-rose-950/15'
        : 'bg-amber-50/50 dark:bg-amber-950/15'
      : ''
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 pdv-page p-3 text-slate-800 sm:p-5 lg:p-6 dark:text-slate-200">
      <PageHeader
        title="Estoque"
        subtitle="Saldos, compras e consumo."
        actions={
          gestao && (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Link
                to="/reposicao"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 lg:min-h-9 lg:rounded-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                Reposição de insumos
              </Link>
              <BotaoEstoque destaque onClick={() => setEditar('novo')}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Novo insumo
              </BotaoEstoque>
            </div>
          )
        }
      />
      <section
        aria-label="Resumo do estoque"
        className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white py-3 dark:divide-slate-700 dark:border-slate-800 dark:bg-slate-900"
      >
        {[
          [
            'Insumos ativos',
            ativos.length,
            'text-slate-800 dark:text-slate-100',
          ],
          [
            'Em alerta',
            totalAlertas,
            totalAlertas
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-slate-800 dark:text-slate-100',
          ],
          ['Arquivados', totalArquivados, 'text-slate-500 dark:text-slate-400'],
        ].map(([nome, total, cor]) => (
          <div key={nome} className="min-w-0 px-3 sm:px-5">
            <p className="text-[11px] font-medium text-slate-500 sm:text-xs dark:text-slate-400">
              {nome}
            </p>
            <p className={`mt-0.5 text-xl font-semibold tabular-nums ${cor}`}>
              {total}
            </p>
          </div>
        ))}
      </section>
      <section
        aria-label="Lista de insumos"
        className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <div className="relative w-full min-w-0 sm:w-72 sm:flex-1 sm:max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              className="min-h-11 pl-9 pr-10 lg:min-h-10"
              aria-label="Buscar insumo"
              placeholder="Buscar insumo pelo nome…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {busca && (
              <button
                type="button"
                aria-label="Limpar busca"
                className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-lg text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-400"
                onClick={() => setBusca('')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <BotaoEstoque
              compacto
              aria-label="Somente alertas"
              ativo={alertas}
              aria-pressed={alertas}
              onClick={() => setAlertas(!alertas)}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              <span className="sm:hidden">Alertas</span>
              <span className="hidden sm:inline">Somente alertas</span>
              {totalAlertas > 0 && (
                <span className="rounded-md bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  {totalAlertas}
                </span>
              )}
            </BotaoEstoque>
            <BotaoEstoque
              compacto
              aria-label="Incluir arquivados"
              ativo={arquivados}
              aria-pressed={arquivados}
              onClick={() => setArquivados(!arquivados)}
            >
              <Archive className="h-4 w-4" aria-hidden="true" />
              <span className="sm:hidden">Arquivados</span>
              <span className="hidden sm:inline">Incluir arquivados</span>
            </BotaoEstoque>
            <BotaoEstoque
              somenteIcone
              aria-label="Exportar CSV"
              title="Exportar CSV"
              onClick={() =>
                baixarCsv(
                  'estoque',
                  [
                    'Nome',
                    'Saldo',
                    'Unidade',
                    'Mínimo',
                    'Custo médio',
                    'Ativo',
                  ],
                  itens.map((i) => [
                    i.nome,
                    i.quantidadeAtual,
                    i.unidade,
                    i.minimo,
                    i.custoMedio,
                    i.ativo !== false ? 'Sim' : 'Não',
                  ]),
                )
              }
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </BotaoEstoque>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <p role="status">
            {itens.length}{' '}
            {itens.length === 1 ? 'insumo exibido' : 'insumos exibidos'}
            {busca && ` para “${busca}”`}
          </p>
          {busca || alertas || arquivados ? (
            <button
              type="button"
              className="min-h-9 rounded-lg px-2 font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-brand-300 dark:hover:bg-slate-800"
              onClick={limparFiltros}
            >
              Limpar filtros
            </button>
          ) : (
            <span className="hidden sm:inline">
              Saldo na unidade de controle
            </span>
          )}
        </div>
        {erro && (
          <div className="m-3">
            <ErrorState error={new Error(erro)} />
          </div>
        )}
        <div className="hidden overflow-x-auto lg:block">
          <table className="pdv-table w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
              <tr>
                <th scope="col" className="w-[36%] px-4 py-3 font-medium">
                  Insumo
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Saldo
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Mínimo
                </th>
                <th scope="col" className="px-3 py-3 text-right font-medium">
                  Custo de referência
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {itens.map((i) => (
                <tr
                  key={i.id}
                  className={`${corLinha(i)} transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50`}
                >
                  <th
                    scope="row"
                    className="max-w-xs px-4 py-3 text-left font-normal"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="break-words font-semibold [overflow-wrap:anywhere] dark:text-slate-100">
                        {i.nome}
                      </span>
                      <SituacaoEstoque item={i} />
                    </div>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {fornecedorNome(i)}
                    </span>
                  </th>
                  <td
                    className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${corSaldo(i)}`}
                  >
                    {i.quantidadeAtual.toLocaleString('pt-BR')}{' '}
                    <span className="text-xs font-normal">{i.unidade}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    {i.minimo.toLocaleString('pt-BR')}{' '}
                    <span className="text-xs">{i.unidade}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-xs tabular-nums">
                    {formatarPrecoReferencia(i)}
                  </td>
                  <td className="px-3 py-2">{acoes(i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-slate-100 lg:hidden dark:divide-slate-800">
          {itens.map((i) => (
            <li key={i.id} className={`space-y-3 p-3 sm:p-4 ${corLinha(i)}`}>
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <Package className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-sm font-semibold [overflow-wrap:anywhere] dark:text-slate-100">
                    {i.nome}
                  </h2>
                  <p className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">
                    {fornecedorNome(i)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SituacaoEstoque item={i} />
                <p
                  className={`text-lg font-semibold tabular-nums ${corSaldo(i)}`}
                >
                  {i.quantidadeAtual.toLocaleString('pt-BR')}{' '}
                  <span className="text-xs font-normal">{i.unidade}</span>
                </p>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Mínimo:{' '}
                  <strong className="font-medium">
                    {i.minimo.toLocaleString('pt-BR')} {i.unidade}
                  </strong>
                </span>
                <span>
                  Custo:{' '}
                  <strong className="font-medium text-slate-700 dark:text-slate-200">
                    {formatarPrecoReferencia(i)}
                  </strong>
                </span>
              </div>
              {acoes(i, true)}
            </li>
          ))}
        </ul>
        {!itens.length && (
          <div className="space-y-2 px-4 py-10 text-center">
            <Package
              className="mx-auto h-7 w-7 text-slate-400"
              aria-hidden="true"
            />
            <h2 className="font-semibold">
              {(estoque.data ?? []).length
                ? 'Nenhum insumo neste filtro'
                : 'Seu estoque começa aqui'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {(estoque.data ?? []).length
                ? 'Tente outro nome ou remova os filtros para ver mais insumos.'
                : 'Cadastre os insumos para acompanhar saldos, compras e consumo.'}
            </p>
            {(busca || alertas || arquivados) && (
              <BotaoEstoque onClick={limparFiltros}>
                Ver todos os insumos
              </BotaoEstoque>
            )}
          </div>
        )}
      </section>
      <details className="group min-w-0 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
          <History className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          Últimas movimentações
          <span className="ml-auto text-xs font-normal text-slate-500 dark:text-slate-400">
            {movimentos.data?.length ?? 0} {(movimentos.data?.length ?? 0) === 1 ? 'recente' : 'recentes'}
          </span>
          <ChevronDown
            className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          {movimentos.isError ? (
            <ErrorState error={movimentos.error} />
          ) : (
            <Movimentos
              lista={movimentos.data ?? []}
              itens={estoque.data ?? []}
            />
          )}
        </div>
      </details>
      {editar && (
        <Cadastro
          item={editar === 'novo' ? null : editar}
          fornecedores={fornecedores.data ?? []}
          onClose={() => setEditar(null)}
        />
      )}
      {movItem && (
        <Movimentar item={movItem} onClose={() => setMovItem(null)} />
      )}
      {histItem && (
        <Modal
          open
          title={`Histórico: ${histItem.nome}`}
          onClose={() => setHistItem(null)}
        >
          {historico.isLoading ? (
            <LoadingScreen />
          ) : historico.isError ? (
            <ErrorState error={historico.error} />
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                Até 100 movimentos mais recentes deste insumo.
              </p>
              <Movimentos lista={historico.data ?? []} itens={[histItem]} />
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
function Movimentos({
  lista,
  itens,
}: {
  lista: StockMovement[]
  itens: InventoryItem[]
}) {
  return (
    <ul className="max-h-[65vh] space-y-3 overflow-y-auto">
      {lista.map((m) => (
        <li
          key={m.id}
          className="border-b border-slate-200 pb-3 text-sm dark:border-slate-700"
        >
          <p className="break-words font-semibold">
            {itens.find((i) => i.id === m.itemId)?.nome ?? m.itemId}
          </p>
          <p>
            {m.tipo === 'custo'
              ? 'Correção de custo'
              : m.tipo === 'entrada'
                ? 'Entrada'
                : m.tipo === 'saida'
                  ? 'Saída'
                  : 'Ajuste de saldo'}{' '}
            · {m.qtd} {itens.find((i) => i.id === m.itemId)?.unidade}
          </p>
          {m.tipo === 'custo' && (
            <p>
              {custoUnitario(m.custoAnterior ?? 0)} →{' '}
              {custoUnitario(m.custoUnitario ?? 0)} por unidade de controle
            </p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {dataHora(m.dataMovimentacao ?? m.criadoEm)} ·{' '}
            {m.observacao ?? 'Sem observação'}
            {m.dataMovimentacao && (
              <span className="block text-xs">
                Registrado no sistema: {dataHora(m.criadoEm)}
              </span>
            )}
          </p>
        </li>
      ))}
      {!lista.length && (
        <li className="text-sm text-slate-500 dark:text-slate-400">Sem movimentações.</li>
      )}
    </ul>
  )
}
function Cadastro({
  item,
  fornecedores,
  onClose,
}: {
  item: InventoryItem | null
  fornecedores: Fornecedor[]
  onClose: () => void
}) {
  const [form, setForm] = useState({
    nome: item?.nome ?? '',
    fornecedorId: item?.fornecedorId ?? '',
    unidade: item?.unidade ?? 'un',
    minimo: String(item?.minimo ?? 0),
    custoMedio: String(item ? (precoPorReferencia(item) ?? 0) : 0),
    quantidadeAtual: '0',
    unidadeCompra: item?.unidadeCompra ?? item?.unidade ?? 'un',
    fatorCompra: String(item?.fatorCompra ?? 1),
  })
  const [erro, setErro] = useState('')
  const qc = useQueryClient()
  // Formulário edita preço de referência comercial, nunca o custo pequeno por g.
  const [novoFornecedor, setNovoFornecedor] = useState(false)
  const [fornecedorForm, setFornecedorForm] = useState({
    nome: '',
    telefone: '',
  })
  const [cadastrado, setCadastrado] = useState<Fornecedor | null>(null)
  const cadastrarFornecedor = useMutation({
    mutationFn: () =>
      api<Fornecedor>('/fornecedores', {
        method: 'POST',
        body: {
          nome: fornecedorForm.nome.trim(),
          telefone: fornecedorForm.telefone.trim(),
        },
      }),
    onSuccess: (fornecedor) => {
      setCadastrado(fornecedor)
      setForm((prev) => ({ ...prev, fornecedorId: fornecedor.id }))
      setNovoFornecedor(false)
      setErro('')
      void qc.invalidateQueries({ queryKey: ['fornecedores'] })
    },
    onError: (e) =>
      setErro(
        e instanceof Error
          ? e.message
          : 'Não foi possível cadastrar o fornecedor',
      ),
  })
  function alterarUnidades(modificacoes: Partial<typeof form>) {
    const anterior = {
      unidade: form.unidade,
      unidadeCompra: form.unidadeCompra,
      fatorCompra: numeroDecimal(form.fatorCompra),
    }
    const custoAtual = custoPorUnidadeControle(
      numeroDecimal(form.custoMedio),
      unidadeReferencia(anterior),
      anterior,
    )
    const proximo = { ...form, ...modificacoes }
    // Converter também o custo na troca g ↔ kg ou ml ↔ L.
    // Não aproveitar preço de unidades incompatíveis.
    const custoConvertido =
      custoAtual == null
        ? 0
        : (converterCustoControle(
            custoAtual,
            anterior.unidade,
            proximo.unidade,
          ) ?? 0)
    const refProxima = {
      unidade: proximo.unidade,
      unidadeCompra: proximo.unidadeCompra,
      fatorCompra: numeroDecimal(proximo.fatorCompra),
      custoMedio: custoConvertido,
    }
    const ref = precoPorReferencia(refProxima)
    setForm({
      ...proximo,
      custoMedio: ref == null ? form.custoMedio : String(ref),
    })
  }
  const unidadeAtual = {
    unidade: form.unidade,
    unidadeCompra: form.unidadeCompra,
    fatorCompra: numeroDecimal(form.fatorCompra),
  }
  const custoInterno = custoPorUnidadeControle(
    numeroDecimal(form.custoMedio),
    unidadeReferencia(unidadeAtual),
    unidadeAtual,
  )
  const salvar = useMutation({
    mutationFn: () =>
      api(item ? `/estoque/itens/${item.id}` : '/estoque/itens', {
        method: item ? 'PATCH' : 'POST',
        body: {
          nome: form.nome.trim(),
          fornecedorId: form.fornecedorId,
          unidade: form.unidade,
          minimo: numeroDecimal(form.minimo),
          custoMedio: custoInterno,
          unidadeCompra: form.unidadeCompra,
          fatorCompra: numeroDecimal(form.fatorCompra),
          ...(!item
            ? { quantidadeAtual: numeroDecimal(form.quantidadeAtual) }
            : {}),
        },
      }),
    onSuccess: onClose,
    onError: (e) =>
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar'),
  })
  const excluir = useMutation({
    mutationFn: () => api(`/estoque/itens/${item!.id}`, { method: 'DELETE' }),
    onSuccess: onClose,
    onError: (e) =>
      setErro(e instanceof Error ? e.message : 'Não foi possível excluir'),
  })
  return (
    <Modal
      open
      title={item ? 'Editar insumo' : 'Novo insumo'}
      onClose={onClose}
    >
      <fieldset
        disabled={salvar.isPending || excluir.isPending}
        className="space-y-4"
      >
        <AjudaContextual
          artigo="insumos"
          rotulo="Como cadastrar este insumo?"
        />
        <Field label="Nome">
          <Input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
        </Field>
        <Field
          label="Fornecedor habitual"
          hint="Selecione um fornecedor cadastrado ou crie um novo nesta tela."
        >
          <Select
            value={form.fornecedorId}
            onChange={(e) => setForm({ ...form, fornecedorId: e.target.value })}
          >
            <option value="">Sem fornecedor definido</option>
            {[
              ...fornecedores,
              ...(cadastrado &&
              !fornecedores.some((f) => f.id === cadastrado.id)
                ? [cadastrado]
                : []),
            ]
              .filter((f) => f.ativo !== false || f.id === form.fornecedorId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                  {f.ativo === false ? ' (inativo)' : ''}
                </option>
              ))}
          </Select>
        </Field>
        <button
          type="button"
          className="text-xs font-semibold text-brand-600 underline dark:text-brand-400"
          onClick={() => setNovoFornecedor((v) => !v)}
        >
          {novoFornecedor
            ? 'Cancelar novo fornecedor'
            : '+ Cadastrar fornecedor'}
        </button>
        {novoFornecedor && (
          <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-800 dark:bg-slate-800">
            <Field label="Nome do fornecedor">
              <Input
                value={fornecedorForm.nome}
                maxLength={150}
                onChange={(e) =>
                  setFornecedorForm((prev) => ({
                    ...prev,
                    nome: e.target.value,
                  }))
                }
              />
            </Field>
            <Field
              label="Telefone / WhatsApp com DDD"
              hint="Necessário para enviar pedidos de reposição pelo wa.me."
            >
              <Input
                value={fornecedorForm.telefone}
                inputMode="tel"
                type="tel"
                maxLength={22}
                placeholder="(11) 99999-9999"
                onChange={(e) =>
                  setFornecedorForm((prev) => ({
                    ...prev,
                    telefone: e.target.value,
                  }))
                }
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              loading={cadastrarFornecedor.isPending}
              disabled={
                fornecedorForm.nome.trim().length < 2 ||
                fornecedorForm.telefone.replace(/\D/g, '').length < 10
              }
              onClick={() => cadastrarFornecedor.mutate()}
            >
              Salvar e selecionar fornecedor
            </Button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Unidade de controle / consumo"
            hint={
              item
                ? 'Mudanças são bloqueadas se houver saldo, receita ou histórico.'
                : undefined
            }
          >
            <Select
              value={form.unidade}
              onChange={(e) =>
                alterarUnidades({
                  unidade: e.target.value,
                  ...(!item ? { unidadeCompra: e.target.value } : {}),
                })
              }
            >
              {[...new Set([form.unidade, ...UNIDADES])].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
          <Field label="Quantidade mínima">
            <Input
              inputMode="decimal"
              value={form.minimo}
              onChange={(e) => setForm({ ...form, minimo: e.target.value })}
            />
          </Field>
          <Field
            label={`Preço de referência (R$ / ${unidadeReferencia(unidadeAtual)})`}
            hint="Informe valor por kg, litro, unidade ou embalagem. O sistema guarda automaticamente o custo proporcional por grama ou ml."
          >
            <Input
              inputMode="decimal"
              value={form.custoMedio}
              onChange={(e) => setForm({ ...form, custoMedio: e.target.value })}
            />
          </Field>
          {custoInterno != null && Number.isFinite(custoInterno) && (
            <p className="text-xs text-slate-500 sm:col-span-2 dark:text-slate-400">
              Referência:{' '}
              {formatarPrecoReferencia({
                ...unidadeAtual,
                custoMedio: custoInterno,
              })}
              {['g', 'ml'].includes(form.unidade) &&
                ' · Custo proporcional detalhado é calculado internamente.'}
            </p>
          )}
          {!item && (
            <Field label="Saldo inicial">
              <Input
                inputMode="decimal"
                value={form.quantidadeAtual}
                onChange={(e) =>
                  setForm({ ...form, quantidadeAtual: e.target.value })
                }
              />
            </Field>
          )}
          <Field label="Unidade habitual de compra">
            <Select
              value={form.unidadeCompra}
              onChange={(e) =>
                alterarUnidades({ unidadeCompra: e.target.value })
              }
            >
              {UNIDADES.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
          {['cx', 'pct'].includes(form.unidadeCompra) && (
            <Field
              label={`Quantidade em ${form.unidade} por ${form.unidadeCompra}`}
            >
              <Input
                inputMode="decimal"
                value={form.fatorCompra}
                onChange={(e) =>
                  alterarUnidades({ fatorCompra: e.target.value })
                }
              />
            </Field>
          )}
        </div>
        {erro && (
          <p role="alert" className="text-sm text-rose-600">
            {erro}
          </p>
        )}
        <Button
          loading={salvar.isPending}
          disabled={
            !form.nome.trim() ||
            custoInterno === null ||
            !Number.isFinite(custoInterno) ||
            ![
              form.minimo,
              form.custoMedio,
              form.fatorCompra,
              ...(!item ? [form.quantidadeAtual] : []),
            ].every((v) => Number.isFinite(numeroDecimal(v)))
          }
          onClick={() => salvar.mutate()}
        >
          Salvar insumo
        </Button>
        {item && (
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-sm text-rose-600">
              Exclusão definitiva
            </summary>
            <p className="my-3 text-sm">
              Permitida somente sem saldo, receitas ou histórico. Prefira
              arquivar.
            </p>
            <Button
              variant="danger"
              loading={excluir.isPending}
              onClick={() =>
                window.confirm('Excluir definitivamente este cadastro?') &&
                excluir.mutate()
              }
            >
              Excluir cadastro sem vínculos
            </Button>
          </details>
        )}
      </fieldset>
    </Modal>
  )
}
function Movimentar({
  item,
  onClose,
}: {
  item: InventoryItem
  onClose: () => void
}) {
  const [tipo, setTipo] = useState('entrada'),
    [qtd, setQtd] = useState(''),
    [unidade, setUnidade] = useState(item.unidadeCompra || item.unidade),
    [valor, setValor] = useState(''),
    [observacao, setObs] = useState(''),
    [erro, setErro] = useState('')
  const envio = useRef<{ chave: string; body: unknown } | null>(null)
  const [travado, setTravado] = useState(false)
  const convertido = converterQuantidade(
    numeroDecimal(qtd),
    unidade,
    item.unidade,
    item.unidadeCompra,
    item.fatorCompra,
  )
  const simulacao =
    tipo === 'entrada'
      ? simularCompra(item, numeroDecimal(qtd), unidade, numeroDecimal(valor))
      : null
  const salvar = useMutation({
    mutationFn: () =>
      api('/estoque/movimentacoes', {
        method: 'POST',
        body: envio.current!.body,
        idempotencyKey: envio.current!.chave,
      }),
    onSuccess: onClose,
    onError: (e) => {
      if (e instanceof ApiError && e.status < 500) {
        envio.current = null
        setTravado(false)
      }
      setErro(e instanceof Error ? e.message : 'Envio não confirmado')
    },
  })
  function confirmar() {
    if (!envio.current) {
      envio.current = {
        chave: crypto.randomUUID(),
        body: {
          tipo,
          itemId: item.id,
          qtd: numeroDecimal(qtd),
          unidade,
          observacao: observacao.trim() || null,
          ...(tipo === 'entrada' && valor
            ? { valorTotalCompra: numeroDecimal(valor) }
            : {}),
        },
      }
      setTravado(true)
    }
    salvar.mutate()
  }
  return (
    <Modal
      open
      title={`Movimentar: ${item.nome}`}
      onClose={() => !travado && onClose()}
    >
      <fieldset disabled={travado} className="space-y-4">
        <AjudaContextual
          artigo="movimentacoes"
          rotulo="Como movimentar o estoque?"
        />
        <Field label="Operação">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="entrada">Entrada / compra</option>
            <option value="saida">Saída</option>
            <option value="ajuste">Corrigir saldo para</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tipo === 'ajuste' ? 'Novo saldo' : 'Quantidade'}>
            <Input
              inputMode="decimal"
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
            />
          </Field>
          <Field label="Unidade informada">
            <Select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
            >
              {unidadesCompativeis(
                item.unidade,
                item.unidadeCompra,
                item.fatorCompra,
              ).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
        </div>
        {tipo === 'entrada' && (
          <Field
            label="Valor total da compra (R$)"
            hint="Opcional. Sem valor, mantém o custo médio atual."
          >
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </Field>
        )}
        <p className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
          Quantidade no controle:{' '}
          {convertido === null
            ? 'Unidade/quantidade inválida'
            : `${convertido.toLocaleString('pt-BR')} ${item.unidade}`}
          {tipo === 'entrada' &&
            valor &&
            convertido !== null &&
            convertido > 0 && (
              <>
                <br />
                Preço da compra:{' '}
                {simulacao
                  ? formatarPrecoReferencia({
                      ...item,
                      custoMedio: simulacao.custoPorControle,
                    })
                  : 'Valor inválido'}
              </>
            )}
        </p>
        <Field label="Motivo / observação">
          <Input
            value={observacao}
            onChange={(e) => setObs(e.target.value)}
            maxLength={300}
          />
        </Field>
      </fieldset>
      {erro && (
        <p role="alert" className="my-3 text-sm text-rose-600">
          {travado
            ? 'Resposta não confirmada. Repita a mesma operação para conferir sem duplicar. '
            : ''}
          {erro}
        </p>
      )}
      <Button
        className="mt-4 w-full"
        loading={salvar.isPending}
        disabled={
          !travado &&
          (convertido === null ||
            convertido < 0 ||
            (tipo !== 'ajuste' && convertido === 0) ||
            (!!valor &&
              (!Number.isFinite(numeroDecimal(valor)) ||
                numeroDecimal(valor) <= 0)))
        }
        onClick={confirmar}
      >
        {travado ? 'Conferir o mesmo lançamento' : 'Registrar movimentação'}
      </Button>
    </Modal>
  )
}
