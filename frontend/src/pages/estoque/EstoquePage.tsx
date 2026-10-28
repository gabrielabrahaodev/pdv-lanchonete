import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { useEstoque, useMovimentacoes } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { InventoryItem, StockMovement } from '../../types'
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
  return (
    <div className="space-y-5 p-3 sm:p-6">
      <PageHeader
        title="Estoque"
        subtitle="Insumos, compras e movimentações"
        actions={
          gestao && (
            <Button onClick={() => setEditar('novo')}>Novo insumo</Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="sm:max-w-xs"
          aria-label="Buscar insumo"
          placeholder="Buscar insumo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={alertas}
            onChange={(e) => setAlertas(e.target.checked)}
          />
          Somente alertas
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={arquivados}
            onChange={(e) => setArquivados(e.target.checked)}
          />
          Incluir arquivados
        </label>
        <Button
          variant="secondary"
          onClick={() =>
            baixarCsv(
              'estoque',
              ['Nome', 'Saldo', 'Unidade', 'Mínimo', 'Custo médio', 'Ativo'],
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
          Exportar CSV
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-rose-600">
          {erro}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {itens.map((i) => (
            <Card key={i.id} className="min-w-0 space-y-3 p-4">
              <div>
                <h2 className="break-words text-lg font-bold">{i.nome}</h2>
                <p className="text-sm text-slate-500">
                  {i.ativo === false
                    ? 'Arquivado'
                    : i.quantidadeAtual <= i.minimo
                      ? 'Atenção: saldo no mínimo ou abaixo'
                      : 'Ativo'}
                </p>
              </div>
              <p className="text-2xl font-bold">
                {i.quantidadeAtual.toLocaleString('pt-BR')}{' '}
                <span className="text-sm">{i.unidade}</span>
              </p>
              <p className="text-sm">
                Mínimo: {i.minimo} {i.unidade}
                <br />
                Custo médio: {custoUnitario(i.custoMedio)} / {i.unidade}
              </p>
              <div className="flex flex-wrap gap-2">
                {gestao && (
                  <>
                    <Button variant="secondary" onClick={() => setEditar(i)}>
                      Editar
                    </Button>
                    <Button
                      disabled={i.ativo === false}
                      onClick={() => setMovItem(i)}
                    >
                      Movimentar
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={arquivar.isPending}
                      onClick={() =>
                        window.confirm(
                          i.ativo === false
                            ? `Reativar ${i.nome}?`
                            : `Arquivar ${i.nome}? Receitas e histórico serão preservados.`,
                        ) && arquivar.mutate(i)
                      }
                    >
                      {i.ativo === false ? 'Reativar' : 'Arquivar'}
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={() => setHistItem(i)}>
                  Histórico
                </Button>
              </div>
            </Card>
          ))}
          {!itens.length && (
            <Card className="p-6">Nenhum insumo encontrado.</Card>
          )}
        </div>
        <Card className="min-w-0 p-4">
          <h2 className="mb-3 font-bold">Últimas movimentações</h2>
          {movimentos.isError ? (
            <ErrorState error={movimentos.error} />
          ) : (
            <Movimentos
              lista={movimentos.data ?? []}
              itens={estoque.data ?? []}
            />
          )}
        </Card>
      </div>
      {editar && (
        <Cadastro
          item={editar === 'novo' ? null : editar}
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
              <p className="mb-3 text-sm text-slate-500">
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
          <p className="text-xs text-slate-500">
            {dataHora(m.criadoEm)} · {m.observacao ?? 'Sem observação'}
          </p>
        </li>
      ))}
      {!lista.length && (
        <li className="text-sm text-slate-500">Sem movimentações.</li>
      )}
    </ul>
  )
}
function Cadastro({
  item,
  onClose,
}: {
  item: InventoryItem | null
  onClose: () => void
}) {
  const [form, setForm] = useState({
    nome: item?.nome ?? '',
    unidade: item?.unidade ?? 'un',
    minimo: String(item?.minimo ?? 0),
    custoMedio: String(item?.custoMedio ?? 0),
    quantidadeAtual: '0',
    unidadeCompra: item?.unidadeCompra ?? item?.unidade ?? 'un',
    fatorCompra: String(item?.fatorCompra ?? 1),
  })
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: () =>
      api(item ? `/estoque/itens/${item.id}` : '/estoque/itens', {
        method: item ? 'PATCH' : 'POST',
        body: {
          nome: form.nome.trim(),
          unidade: form.unidade,
          minimo: numeroDecimal(form.minimo),
          custoMedio: numeroDecimal(form.custoMedio),
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
        <Field label="Nome">
          <Input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
        </Field>
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
                setForm({
                  ...form,
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
            label={`Custo por ${form.unidade} (R$)`}
            hint="Correções são registradas no histórico. Compras recalculam o custo médio."
          >
            <Input
              inputMode="decimal"
              value={form.custoMedio}
              onChange={(e) => setForm({ ...form, custoMedio: e.target.value })}
            />
          </Field>
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
                setForm({ ...form, unidadeCompra: e.target.value })
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
                  setForm({ ...form, fatorCompra: e.target.value })
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
                Custo desta compra: {brl(
                  numeroDecimal(valor) / convertido,
                )} / {item.unidade}
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
