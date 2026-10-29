import { PageHeader } from '../../components/layout/AppLayout'
import { artigoDaSecao } from '../../wiki/navegacao/contexto'
import { AjudaContextual } from '../../wiki/componentes/AjudaContextual'
import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { brl, dataHora, custoUnitario } from '../../lib/format'
import { numeroDecimal } from '../../lib/precificacao'
import { useAuth } from '../../context/AuthContext'
import {
  useLotesProducao,
  useHistoricoProducao,
  useProdutos,
  useEstoque,
  useReservasConferencia,
} from '../../hooks/useFirestore'
import {
  SummaryStrip,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  LoadingScreen,
  Select,
} from '../../components/ui'
import type { MovimentoProducao } from '../../types'

const NOMES: Record<MovimentoProducao['tipo'], string> = {
  consumo_conferencia: 'Consumo confirmado na conferência',
  producao: 'Produção',
  reserva: 'Reserva',
  entrega: 'Entrega',
  liberacao: 'Reserva liberada',
  perda: 'Perda / ajuste',
  conversao_saida: 'Conversão — saída',
  conversao_entrada: 'Conversão — entrada',
}

type Envio = { path: string; body: unknown; chave: string }

export default function ProducaoPage() {
  const { me } = useAuth()
  const rid = me?.restaurantId
  const gestor = ['admin', 'gerente', 'caixa'].includes(me?.papel ?? '')
  const conferencias = useReservasConferencia(gestor ? rid : null)
  const [etapa, setEtapa] = useState(1)
  const [manual, setManual] = useState(false)
  const [situacao, setSituacao] = useState('')
  const operar = ['admin', 'gerente', 'caixa', 'cozinha'].includes(
    me?.papel ?? '',
  )
  const lotes = useLotesProducao(rid)
  const produtos = useProdutos(rid)
  const estoque = useEstoque(rid)
  const historico = useHistoricoProducao(operar ? rid : null)
  const [aba, setAba] = useState<'disponiveis' | 'produzir' | 'historico'>(
    'disponiveis',
  )
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const [busca, setBusca] = useState('')
  const [localFiltro, setLocalFiltro] = useState('')
  const [form, setForm] = useState({
    produtoId: '',
    receitas: '1',
    quantidade: '',
    validade: '',
    local: 'Estufa',
    observacao: '',
  })
  const [loteId, setLoteId] = useState('')
  const [acao, setAcao] = useState<'perda' | 'converter'>('perda')
  const [ajuste, setAjuste] = useState({
    quantidade: '1',
    motivo: 'vencimento',
    observacao: '',
    destino: '',
    quantidadeDestino: '',
  })
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [bloqueado, setBloqueado] = useState(false)
  const envio = useRef<Envio | null>(null)
  const salvar = useMutation({
    mutationFn: (dados: Envio) =>
      api(dados.path, {
        method: 'POST',
        body: dados.body,
        idempotencyKey: dados.chave,
      }),
    onSuccess: () => {
      envio.current = null
      setBloqueado(false)
      setErro('')
      setSucesso(
        'Lançamento registrado. Os saldos serão atualizados automaticamente.',
      )
      setLoteId('')
      setAba('disponiveis')
      setEtapa(1)
      setManual(false)
      setForm((f) => ({ ...f, produtoId: '', quantidade: '', receitas: '1' }))
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        envio.current = null
        setBloqueado(false)
      }
      setErro(
        envio.current
          ? 'Envio não confirmado. Tente novamente para conferir o mesmo lançamento, sem duplicá-lo.'
          : e instanceof Error
            ? e.message
            : 'Não foi possível registrar.',
      )
    },
  })
  function enviar(path: string, body: unknown) {
    if (envio.current) return
    const dados = { path, body, chave: crypto.randomUUID() }
    envio.current = dados
    setBloqueado(true)
    setErro('')
    setSucesso('')
    salvar.mutate(dados)
  }
  const lista = lotes.data ?? []
  const prontos = (produtos.data ?? []).filter(
    (p) => p.modoEstoque === 'antecipado' && p.ativo,
  )
  const produto = prontos.find((p) => p.id === form.produtoId)
  const lote = lista.find((l) => l.id === loteId)
  const receitas = numeroDecimal(form.receitas)
  const quantidade = Number(form.quantidade)
  const custoReceita = (produto?.ingredientes ?? []).reduce(
    (s, i) =>
      s +
      i.qtd * (estoque.data?.find((e) => e.id === i.itemId)?.custoMedio ?? 0),
    0,
  )
  const custo = custoReceita * receitas
  const vencido = (validade: string) => new Date(validade).getTime() <= agora
  const estado = (l: (typeof lista)[number]) =>
    vencido(l.validade)
      ? 'vencido'
      : l.saldo - l.reservado <= 0
        ? 'sem_saldo'
        : +new Date(l.validade) - agora < 86400000
          ? 'proximo'
          : 'disponivel'
  const filtrados = lista
    .filter(
      (l) =>
        (!situacao || estado(l) === situacao) &&
        (!localFiltro || l.local === localFiltro) &&
        l.produtoNome.toLowerCase().includes(busca.toLowerCase()),
    )
    .sort((a, b) => +new Date(a.validade) - +new Date(b.validade))
  const baixos = prontos.filter(
    (p) =>
      lista.reduce(
        (s, l) =>
          s +
          (l.produtoId === p.id && !vencido(l.validade)
            ? Math.max(0, l.saldo - l.reservado)
            : 0),
        0,
      ) <= (p.estoqueMinimo ?? 0),
  )

  if (lotes.isLoading || produtos.isLoading) return <LoadingScreen />
  if (lotes.isError || produtos.isError)
    return <ErrorState error={lotes.error ?? produtos.error} />

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pdv-page p-3 sm:p-5 lg:p-6">
      <PageHeader title="Produção e Estufa" ajuda={artigoDaSecao('producao', aba)} subtitle="Prepare lotes, acompanhe validade e saldo disponível." />
      <SummaryStrip items={[
        {label: 'Lotes livres', value: lista.filter(l => !vencido(l.validade) && l.saldo > l.reservado).length},
        {label: 'Com reservas', value: lista.filter(l => l.reservado > 0).length},
        {label: 'Vencidos', value: lista.filter(l => vencido(l.validade)).length, alert: true},
      ]} />
      {baixos.length > 0 && (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          Saldo disponível no mínimo ou esgotado:{' '}
          {baixos.map((p) => p.nome).join(', ')}.
        </p>
      )}
      <nav className="flex flex-wrap gap-2" aria-label="Seções de produção">
        <Button
          variant={aba === 'disponiveis' ? 'selected' : 'secondary'}
          onClick={() => setAba('disponiveis')}
        >
          Estufa
        </Button>
        {operar && (
          <>
            <Button
              variant={aba === 'produzir' ? 'selected' : 'secondary'}
              onClick={() => setAba('produzir')}
            >
              Produzir
            </Button>
            <Button
              variant={aba === 'historico' ? 'selected' : 'secondary'}
              onClick={() => setAba('historico')}
            >
              Histórico
            </Button>
          </>
        )}
      </nav>
      {erro && (
        <div
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
        >
          {erro}
          {bloqueado && !salvar.isPending && (
            <Button
              className="mt-2 block"
              onClick={() => envio.current && salvar.mutate(envio.current)}
            >
              Tentar novamente
            </Button>
          )}
        </div>
      )}
      {sucesso && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {sucesso}
        </p>
      )}
      {aba === 'disponiveis' && (
        <>
          {gestor && (
            <Card className="space-y-3 p-4">
              <h2 className="font-bold">Conferência de mesas encerradas</h2>
              <AjudaContextual artigo="reservas" rotulo="Como conferir reservas?" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Reservas não entregues continuam bloqueadas. Confirme o destino
                físico antes de liberar ou baixar o saldo.
              </p>
              {conferencias.isError ? (
                <ErrorState error={conferencias.error} />
              ) : (
                (conferencias.data ?? []).map((p) => (
                  <div key={p.id} className="space-y-2">
                    {p.itens
                      .filter((i) => i.reservaConferenciaPendente)
                      .map((i) => (
                        <div
                          key={i.id}
                          className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                        >
                          <p className="font-semibold">
                            Mesa {p.mesaId?.replace('mesa_', '')} · {i.qtd}×{' '}
                            {i.produtoNome ?? i.produtoId}
                          </p>
                          <p className="text-xs">
                            Pedido {p.id.slice(-8)} · Estado físico registrado:{' '}
                            {i.status}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(['consumido', 'devolver'] as const).map(
                              (acao) => (
                                <Button
                                  key={acao}
                                  disabled={bloqueado}
                                  variant="secondary"
                                  onClick={() => {
                                    const motivo = window.prompt(
                                      acao === 'consumido'
                                        ? 'Confirme que estas unidades foram efetivamente retiradas/consumidas. Informe o motivo da conferência:'
                                        : 'Confirme que as unidades continuam fisicamente no lote. Informe o motivo da devolução à disponibilidade:',
                                    )
                                    if (motivo && motivo.trim().length >= 3)
                                      enviar(
                                        `/pedidos/${p.id}/itens/${i.id}/conferir-reserva`,
                                        { acao, motivo: motivo.trim() },
                                      )
                                  }}
                                >
                                  {acao === 'consumido'
                                    ? 'Confirmar consumo físico'
                                    : 'Devolver ao lote'}
                                </Button>
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                ))
              )}
              {!conferencias.isLoading && !conferencias.data?.length && (
                <p className="text-sm">
                  Nenhuma reserva pendente de conferência.
                </p>
              )}
            </Card>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              aria-label="Buscar produto pronto"
              placeholder="Buscar produto…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <Select
              aria-label="Situação do lote"
              value={situacao}
              onChange={(e) => setSituacao(e.target.value)}
            >
              <option value="">Todas as situações</option>
              <option value="disponivel">Disponível</option>
              <option value="proximo">Próximo do vencimento</option>
              <option value="vencido">Vencido</option>
              <option value="sem_saldo">Sem saldo livre</option>
            </Select>
            <Select
              aria-label="Local de armazenamento"
              value={localFiltro}
              onChange={(e) => setLocalFiltro(e.target.value)}
            >
              <option value="">Todos os locais</option>
              {[...new Set(lista.map((l) => l.local))].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </Select>
          </div>
          {filtrados.length === 0 && (
            <Card className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhum lote disponível neste filtro. Cadastre um produto com o
              modo “Produzido antecipadamente” e registre sua produção.
            </Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtrados.map((l) => {
              const expirado = vencido(l.validade)
              const proximo =
                !expirado && +new Date(l.validade) - agora < 86400000
              return (
                <Card key={l.id} className="min-w-0 space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="break-words font-bold">{l.produtoNome}</h2>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${expirado ? 'bg-rose-100 text-rose-800' : proximo ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}
                    >
                      {expirado
                        ? 'Vencido'
                        : l.saldo - l.reservado <= 0
                          ? 'Sem saldo livre'
                          : proximo
                            ? 'Vence em até 24 h'
                            : 'Disponível'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {l.local} · Lote {l.id.slice(0, 8)} · {l.unidade}
                  </p>
                  <p className="text-2xl font-bold">
                    {expirado ? 0 : l.saldo - l.reservado}{' '}
                    <span className="text-sm font-normal">livres</span>
                  </p>
                  <p className="text-sm">
                    Saldo físico: {l.saldo} · Reservados: {l.reservado}
                  </p>
                  <details className="text-xs">
                    <summary className="min-h-11 cursor-pointer py-3">
                      Detalhes do lote
                    </summary>
                    <p>
                      Produzido: {dataHora(l.criadoEm)}
                      <br />
                      Validade: {dataHora(l.validade)}
                      {gestor && (
                        <>
                          <br />
                          Custo por {l.unidade}:{' '}
                          {custoUnitario(l.custoUnitario)}
                        </>
                      )}
                    </p>
                  </details>
                  {operar && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={bloqueado}
                        variant="secondary"
                        onClick={() => {
                          setLoteId(l.id)
                          setAcao('perda')
                          setAjuste({
                            ...ajuste,
                            quantidade: '1',
                            observacao: '',
                          })
                        }}
                      >
                        Registrar perda / ajuste
                      </Button>
                      <Button
                        disabled={
                          bloqueado || expirado || l.saldo <= l.reservado
                        }
                        variant="secondary"
                        onClick={() => {
                          setLoteId(l.id)
                          setAcao('converter')
                          setAjuste({
                            ...ajuste,
                            quantidade: '1',
                            observacao: '',
                          })
                        }}
                      >
                        Converter em fatias/unidades
                      </Button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
          {lote && operar && (
            <Card className="p-4 sm:p-6">
              <AjudaContextual artigo="perdas-producao" rotulo="Como registrar perda ou conversão?" />
            <h2 className="mb-4 font-bold">
                {acao === 'perda'
                  ? 'Perda / ajuste de saída'
                  : 'Converter apresentação'}{' '}
                — {lote.produtoNome}
              </h2>
              <fieldset
                disabled={bloqueado}
                className="grid gap-4 sm:grid-cols-2"
              >
                <Field label={`Quantidade de origem (${lote.unidade})`}>
                  <Input
                    type="number"
                    min="1"
                    max={lote.saldo - lote.reservado}
                    step="1"
                    value={ajuste.quantidade}
                    onChange={(e) =>
                      setAjuste({ ...ajuste, quantidade: e.target.value })
                    }
                  />
                </Field>
                {acao === 'perda' ? (
                  <Field label="Motivo">
                    <Select
                      value={ajuste.motivo}
                      onChange={(e) =>
                        setAjuste({ ...ajuste, motivo: e.target.value })
                      }
                    >
                      <option value="vencimento">Vencimento</option>
                      <option value="queima">Queima</option>
                      <option value="quebra">Quebra</option>
                      <option value="consumo_interno">Consumo interno</option>
                      <option value="ajuste">Ajuste de contagem (saída)</option>
                    </Select>
                  </Field>
                ) : (
                  <>
                    <Field label="Produto de destino">
                      <Select
                        value={ajuste.destino}
                        onChange={(e) =>
                          setAjuste({ ...ajuste, destino: e.target.value })
                        }
                      >
                        <option value="">Selecione…</option>
                        {prontos
                          .filter((p) => p.id !== lote.produtoId)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome} ({p.unidadeVenda ?? 'un'})
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field label="Quantidade obtida">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={ajuste.quantidadeDestino}
                        onChange={(e) =>
                          setAjuste({
                            ...ajuste,
                            quantidadeDestino: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Ex.: 1 bolo vira 12 fatias. A conversão preserva o custo
                      total, o local e a validade; não consome ingredientes
                      novamente.
                    </p>
                  </>
                )}
                <Field label="Observação obrigatória">
                  <Input
                    maxLength={300}
                    value={ajuste.observacao}
                    onChange={(e) =>
                      setAjuste({ ...ajuste, observacao: e.target.value })
                    }
                  />
                </Field>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button
                    loading={salvar.isPending}
                    disabled={
                      !Number.isInteger(Number(ajuste.quantidade)) ||
                      Number(ajuste.quantidade) <= 0 ||
                      ajuste.observacao.trim().length < 3 ||
                      (acao === 'converter' &&
                        (!ajuste.destino ||
                          !Number.isInteger(Number(ajuste.quantidadeDestino)) ||
                          Number(ajuste.quantidadeDestino) <= 0))
                    }
                    onClick={() =>
                      window.confirm(
                        acao === 'perda'
                          ? 'Confirmar a retirada física destas unidades? Reservas não serão usadas.'
                          : 'Confirmar a conversão? O custo total e a validade serão preservados.',
                      ) &&
                      enviar(
                        `/producao/lotes/${lote.id}/${acao === 'perda' ? 'perdas' : 'converter'}`,
                        acao === 'perda'
                          ? {
                              quantidade: Number(ajuste.quantidade),
                              motivo: ajuste.motivo,
                              observacao: ajuste.observacao.trim(),
                            }
                          : {
                              produtoDestinoId: ajuste.destino,
                              quantidadeOrigem: Number(ajuste.quantidade),
                              quantidadeDestino: Number(
                                ajuste.quantidadeDestino,
                              ),
                              observacao: ajuste.observacao.trim(),
                            },
                      )
                    }
                  >
                    Confirmar lançamento
                  </Button>
                  <Button variant="secondary" onClick={() => setLoteId('')}>
                    Fechar formulário
                  </Button>
                </div>
              </fieldset>
            </Card>
          )}
        </>
      )}
      {aba === 'produzir' && operar && (
        <Card className="max-w-3xl p-4 sm:p-6">
          <h2 className="mb-2 text-lg font-bold">
            {etapa === 1
              ? '1. Escolher produto'
              : etapa === 2
                ? '2. Informar produção'
                : '3. Conferir e registrar'}
          </h2>
          {etapa > 1 && (
            <Button
              disabled={bloqueado}
              variant="ghost"
              onClick={() => setEtapa(etapa - 1)}
            >
              Voltar uma etapa
            </Button>
          )}
          {etapa === 1 && (
            <div className="space-y-3">
              <Input
                aria-label="Buscar produto para produzir"
                placeholder="Buscar produto para produzir"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              {prontos
                .filter((p) =>
                  p.nome.toLowerCase().includes(busca.toLowerCase()),
                )
                .map((p) => {
                  const valido =
                    !!p.ingredientes?.length &&
                    p.ingredientes.every(
                      (i) =>
                        i.qtd > 0 &&
                        estoque.data?.some((e) => e.id === i.itemId),
                    )
                  return (
                    <button
                      key={p.id}
                      disabled={
                        !valido ||
                        bloqueado ||
                        estoque.isLoading ||
                        estoque.isError
                      }
                      onClick={() => {
                        setForm({
                          ...form,
                          produtoId: p.id,
                          quantidade: String(
                            (p.rendimentoReceita ?? 1) * receitas,
                          ),
                        })
                        setManual(false)
                        setEtapa(2)
                      }}
                      className="block min-h-20 w-full rounded-xl border border-slate-200 p-4 text-left focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60 dark:border-slate-700"
                    >
                      <strong className="block">{p.nome}</strong>
                      <span className="text-sm">
                        Rende {p.rendimentoReceita ?? 1}{' '}
                        {p.unidadeVenda ?? 'un'} por receita
                      </span>
                      {!valido && (
                        <span className="block text-sm text-amber-700 dark:text-amber-300">
                          Receita ausente ou ingrediente não encontrado. Peça à
                          gestão para revisar o cadastro.
                        </span>
                      )}
                    </button>
                  )
                })}
            </div>
          )}
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Informe as receitas utilizadas e a quantidade realmente aproveitada.
            Registrar produção sempre consome os ingredientes, mesmo com a baixa
            automática de pedidos desligada.
          </p>
          {prontos.length === 0 && (
            <p className="mb-4 text-sm">
              Primeiro{' '}
              <Link className="text-brand-600 action-button" to="/produtos/novo">
                cadastre um produto
              </Link>{' '}
              com modo de estoque “Produzido antecipadamente”.
            </p>
          )}
          {etapa > 1 && (
            <fieldset
              disabled={bloqueado}
              className="grid gap-4 sm:grid-cols-2"
            >
              {etapa === 2 && (
                <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                  <Field label="Produto">
                    <Select
                      value={form.produtoId}
                      onChange={(e) => {
                        const p = prontos.find((x) => x.id === e.target.value)
                        setManual(false)
                        setForm({
                          ...form,
                          produtoId: e.target.value,
                          quantidade: String(
                            (p?.rendimentoReceita ?? 1) * receitas,
                          ),
                        })
                      }}
                    >
                      <option value="">Selecione…</option>
                      {prontos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Receitas utilizadas"
                    hint="Ex.: 2 receitas inteiras ou 0,5 receita."
                  >
                    <Input
                      inputMode="decimal"
                      value={form.receitas}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          receitas: e.target.value,
                          ...(!manual
                            ? {
                                quantidade: String(
                                  numeroDecimal(e.target.value) *
                                    (produto?.rendimentoReceita ?? 1),
                                ),
                              }
                            : {}),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={`Quantidade realmente produzida (${produto?.unidadeVenda ?? 'un'})`}
                    hint={`Previsto: ${Number.isFinite(receitas) ? receitas * (produto?.rendimentoReceita ?? 1) : '—'}. Informe o rendimento aproveitável.`}
                  >
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={form.quantidade}
                      onChange={(e) => {
                        setManual(true)
                        setForm({ ...form, quantidade: e.target.value })
                      }}
                    />
                  </Field>
                  <Field label="Validade do lote">
                    <Input
                      type="datetime-local"
                      value={form.validade}
                      onChange={(e) =>
                        setForm({ ...form, validade: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Local de armazenamento">
                    <Input
                      maxLength={80}
                      value={form.local}
                      onChange={(e) =>
                        setForm({ ...form, local: e.target.value })
                      }
                      placeholder="Estufa, balcão, geladeira…"
                    />
                  </Field>
                  <details className="sm:col-span-2">
                    <summary className="min-h-11 cursor-pointer py-3">
                      Observações (opcional)
                    </summary>
                    <Field label="Observação">
                      <Input
                        maxLength={300}
                        value={form.observacao}
                        onChange={(e) =>
                          setForm({ ...form, observacao: e.target.value })
                        }
                      />
                    </Field>
                  </details>
                  <Button
                    className="sm:col-span-2"
                    disabled={
                      !produto?.ingredientes?.length ||
                      !Number.isFinite(receitas) ||
                      receitas <= 0 ||
                      !Number.isInteger(quantidade) ||
                      quantidade <= 0 ||
                      !form.validade ||
                      !form.local.trim()
                    }
                    onClick={() => {
                      if (
                        !Number.isFinite(+new Date(form.validade)) ||
                        +new Date(form.validade) <= Date.now()
                      ) {
                        setErro('Informe uma validade futura.')
                        return
                      }
                      setEtapa(3)
                    }}
                  >
                    Conferir produção
                  </Button>
                </div>
              )}
              {etapa === 3 && (
                <div className="space-y-2 sm:col-span-2">
                  <h3 className="text-lg font-bold">{produto?.nome}</h3>
                  <p>
                    {quantidade} {produto?.unidadeVenda ?? 'un'} · {receitas}{' '}
                    receita(s)
                  </p>
                  <p>
                    Local: {form.local}
                    <br />
                    Validade: {dataHora(new Date(form.validade).toISOString())}
                  </p>
                </div>
              )}
              {produto && etapa === 3 && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800 sm:col-span-2">
                  <p className="font-semibold">
                    Ingredientes que serão consumidos
                  </p>
                  {(produto.ingredientes ?? []).map((i) => {
                    const e = estoque.data?.find((x) => x.id === i.itemId)
                    return (
                      <p key={i.itemId}>
                        {e?.nome ?? 'Item não encontrado'}:{' '}
                        {Number.isFinite(receitas)
                          ? (i.qtd * receitas).toLocaleString('pt-BR')
                          : '—'}{' '}
                        {e?.unidade} · Saldo:{' '}
                        {e?.quantidadeAtual.toLocaleString('pt-BR') ??
                          'não encontrado'}{' '}
                        {e?.unidade}
                      </p>
                    )
                  })}
                  {!produto.ingredientes?.length && (
                    <p>
                      Cadastre a receita antes de produzir, ou use a conversão
                      de um lote existente.
                    </p>
                  )}
                  {gestor && (
                    <p className="mt-2">
                      Custo estimado do lote:{' '}
                      {Number.isFinite(custo) ? brl(custo) : '—'} · Por unidade:{' '}
                      {quantidade > 0 && Number.isFinite(custo)
                        ? brl(custo / quantidade)
                        : '—'}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    O custo é registrado com os valores do estoque no momento da
                    produção. Custos não cadastrados entram como zero.
                  </p>
                </div>
              )}
              {etapa === 3 && (
                <Button
                  className="sm:col-span-2"
                  loading={salvar.isPending}
                  disabled={
                    !produto?.ingredientes?.length ||
                    !Number.isFinite(receitas) ||
                    receitas <= 0 ||
                    !Number.isInteger(quantidade) ||
                    quantidade <= 0 ||
                    !form.validade ||
                    !form.local.trim() ||
                    estoque.isLoading ||
                    estoque.isError
                  }
                  onClick={() => {
                    const data = new Date(form.validade)
                    if (
                      !Number.isFinite(data.getTime()) ||
                      data.getTime() <= Date.now()
                    ) {
                      setErro('Informe uma validade futura.')
                      return
                    }
                    enviar('/producao/lotes', {
                      ...form,
                      receitas,
                      quantidade,
                      local: form.local.trim(),
                      validade: data.toISOString(),
                    })
                  }}
                >
                  Confirmar produção
                </Button>
              )}
            </fieldset>
          )}
        </Card>
      )}
      {aba === 'historico' && operar && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Últimos 100 movimentos. Reservas não são perdas nem vendas; a
            entrega confirma a saída física.
          </p>
          {historico.isLoading ? (
            <LoadingScreen />
          ) : historico.isError ? (
            <ErrorState error={historico.error} />
          ) : (historico.data ?? []).length === 0 ? (
            <p>Nenhum movimento registrado.</p>
          ) : (
            (historico.data ?? []).map((m) => (
              <Card
                key={m.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:justify-between"
              >
                <div>
                  <p className="font-semibold">
                    {NOMES[m.tipo]} ·{' '}
                    {produtos.data?.find((p) => p.id === m.produtoId)?.nome ??
                      m.produtoId}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {dataHora(m.criadoEm)} · Lote {m.loteId.slice(0, 8)} ·
                    Responsável: {m.usuarioId}
                  </p>
                  {m.motivo && (
                    <p className="text-sm">
                      Motivo: {m.motivo.replace(/_/g, ' ')}
                    </p>
                  )}
                  {m.observacao && (
                    <p className="break-words text-sm">{m.observacao}</p>
                  )}
                </div>
                <div className="text-sm">
                  <strong>{m.quantidade} unidade(s)</strong>
                  {m.custoTotal != null && <p>Custo: {brl(m.custoTotal)}</p>}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  )
}
