import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { baixarCsv } from '../../lib/csv'
import { brl, dataHora } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import type {
  AppUser,
  Despesa,
  DespesaCategoria,
  Fornecedor,
  ResumoFinanceiro,
} from '../../types'
import { Badge, Button, Card, ErrorState, Field, Input, LoadingScreen, Modal, Select } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'

const CATEGORIAS: { valor: DespesaCategoria; label: string }[] = [
  { valor: 'insumo', label: 'Insumo / mercadoria' },
  { valor: 'folha', label: 'Folha (funcionário)' },
  { valor: 'conta_fixa', label: 'Conta fixa' },
  { valor: 'outra', label: 'Outra' },
]

const labelCategoria = (c: string) => CATEGORIAS.find((x) => x.valor === c)?.label ?? c

function mesAtual(): { inicio: string; fim: string } {
  const agora = new Date()
  const ini = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 1)
  return { inicio: ini.toISOString(), fim: fim.toISOString() }
}

export default function FinanceiroPage() {
  return (
    <div className="min-w-0 w-full max-w-full overflow-x-hidden p-3 sm:p-6">
      <PageHeader title="Financeiro" subtitle="Fornecedores, despesas e resultado do mês" />
      <div className="grid min-w-0 w-full max-w-full gap-4 sm:gap-6 lg:grid-cols-2">
        <ResumoMesCard />
        <FornecedoresCard />
        <div className="min-w-0 lg:col-span-2">
          <DespesasCard />
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ resumo
function ResumoMesCard() {
  const { inicio, fim } = mesAtual()
  const resumo = useQuery({
    queryKey: ['resumo-financeiro', inicio],
    queryFn: () =>
      api<{ financeiro: ResumoFinanceiro }>(
        `/relatorios/resumo?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
      ),
  })

  if (resumo.isLoading) return <LoadingScreen />
  if (resumo.isError) return <ErrorState error={resumo.error} />

  const f = resumo.data!.financeiro
  const positivo = f.resultadoGerencial >= 0

  return (
    <Card className="min-w-0 space-y-4 p-4 sm:p-6">
      <h3 className="font-bold text-slate-700 dark:text-slate-200">Resultado do mês</h3>
      <div className="flex min-w-0 flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-baseline sm:justify-between sm:p-4 dark:bg-slate-800">
        <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Receita</span>
        <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{brl(f.resultadoGerencial + f.totalDespesas)}</span>
      </div>
      <ul className="space-y-1.5 text-sm">
        {(Object.entries(f.despesasPorCategoria) as [DespesaCategoria, number][]).map(([cat, val]) => (
          <li key={cat} className="flex min-w-0 flex-col gap-1 text-slate-600 sm:flex-row sm:justify-between dark:text-slate-300">
            <span>{labelCategoria(cat)}</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">− {brl(val)}</span>
          </li>
        ))}
        <li className="flex min-w-0 flex-col gap-1 border-t border-slate-100 pt-1.5 font-semibold text-slate-700 sm:flex-row sm:justify-between dark:border-slate-700 dark:text-slate-200">
          <span>Total de despesas</span>
          <span className="text-rose-600 dark:text-rose-400">− {brl(f.totalDespesas)}</span>
        </li>
      </ul>
      <p className="text-xs text-slate-500">CMV estimado (baixas de receita × custo médio): {brl(f.cmvEstimado)}</p>
      <div className={`rounded-xl p-4 ${positivo ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-rose-50 dark:bg-rose-950/40'}`}>
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Resultado</span>
          <span className={`break-words text-2xl font-extrabold tabular-nums sm:text-3xl ${positivo ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {positivo ? '+' : ''}{brl(f.resultadoGerencial)}
          </span>
        </div>
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ despesas
type DespesaForm = {
  categoria: DespesaCategoria
  descricao: string
  valor: string
  data: string
  vencimento: string
  fornecedorId: string
  usuarioId: string
  formaPagamento: string
  observacoes: string
}

function despesaVazia(): DespesaForm {
  return {
    categoria: 'insumo',
    descricao: '',
    valor: '',
    data: new Date().toISOString().slice(0, 10),
    vencimento: '',
    fornecedorId: '',
    usuarioId: '',
    formaPagamento: '',
    observacoes: '',
  }
}

function DespesasCard() {
  const qc = useQueryClient()
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<DespesaForm>(despesaVazia())
  const [erro, setErro] = useState<string | null>(null)

  const despesas = useQuery({ queryKey: ['despesas'], queryFn: () => api<Despesa[]>('/despesas') })
  const fornecedores = useQuery({ queryKey: ['fornecedores'], queryFn: () => api<Fornecedor[]>('/fornecedores') })
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => api<AppUser[]>('/usuarios') })

  function abrirNova() {
    setEditandoId(null)
    setForm(despesaVazia())
    setErro(null)
    setAberto(true)
  }

  function abrirEdicao(d: Despesa) {
    setEditandoId(d.id)
    setForm({
      categoria: d.categoria,
      descricao: d.descricao,
      valor: String(d.valor).replace('.', ','),
      data: (d.data ?? '').slice(0, 10),
      vencimento: (d.vencimento ?? '').slice(0, 10),
      fornecedorId: d.fornecedorId ?? '',
      usuarioId: d.usuarioId ?? '',
      formaPagamento: d.formaPagamento ?? '',
      observacoes: d.observacoes ?? '',
    })
    setErro(null)
    setAberto(true)
  }

  const salvar = useMutation({
    mutationFn: () => {
      const body = {
        categoria: form.categoria,
        descricao: form.descricao.trim(),
        valor: Number(form.valor.replace(',', '.')),
        data: new Date(form.data + 'T12:00:00Z').toISOString(),
        vencimento: form.vencimento ? new Date(form.vencimento + 'T12:00:00Z').toISOString() : null,
        fornecedorId: form.categoria === 'insumo' && form.fornecedorId ? form.fornecedorId : null,
        usuarioId: form.categoria === 'folha' && form.usuarioId ? form.usuarioId : null,
        formaPagamento: form.formaPagamento || null,
        observacoes: form.observacoes || null,
      }
      return editandoId
        ? api(`/despesas/${editandoId}`, { method: 'PATCH', body })
        : api('/despesas', { method: 'POST', body })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despesas'] })
      qc.invalidateQueries({ queryKey: ['resumo-financeiro'] })
      setAberto(false)
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar despesa'),
  })

  const pagar = useMutation({
    mutationFn: (id: string) => api(`/despesas/${id}/pagar`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despesas'] })
      qc.invalidateQueries({ queryKey: ['resumo-financeiro'] })
    },
  })

  const reabrir = useMutation({
    mutationFn: (id: string) => api(`/despesas/${id}`, { method: 'PATCH', body: { ativoPago: false } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despesas'] })
      qc.invalidateQueries({ queryKey: ['resumo-financeiro'] })
    },
  })

  const excluir = useMutation({
    mutationFn: (id: string) => api(`/despesas/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['despesas'] })
      qc.invalidateQueries({ queryKey: ['resumo-financeiro'] })
    },
  })

  const lista = (despesas.data ?? []).filter(
    (d) =>
      (!filtroStatus || d.status === filtroStatus) && (!filtroCat || d.categoria === filtroCat),
  )

  return (
    <Card className="overflow-hidden">
      <div className="flex min-w-0 flex-col items-stretch gap-2 border-b border-slate-100 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-5 sm:py-4 dark:border-slate-800">
        <h3 className="mr-auto font-bold text-slate-700 dark:text-slate-200">Despesas</h3>
        <Select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="w-full !py-2 !text-xs sm:!w-auto sm:!py-1.5">
          <option value="">Todos os status</option>
          <option value="pendente">Pendentes</option>
          <option value="pago">Pagas</option>
        </Select>
        <Select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} className="w-full !py-2 !text-xs sm:!w-auto sm:!py-1.5">
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c.valor} value={c.valor}>{c.label}</option>
          ))}
        </Select>
        <Button variant="secondary" className="!px-3 !py-1.5 !text-xs" onClick={exportarDespesas(lista)}>
          ⬇ CSV
        </Button>
        <Button variant="secondary" className="!px-3 !py-1.5 !text-xs" onClick={abrirNova}>
          + Despesa
        </Button>
      </div>

      {despesas.isLoading ? (
        <LoadingScreen />
      ) : despesas.isError ? (
        <div className="p-5"><ErrorState error={despesas.error} /></div>
      ) : lista.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhuma despesa encontrada.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {lista.map((d) => (
            <li key={d.id} className="flex min-w-0 flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-slate-700 dark:text-slate-200">{d.descricao}</p>
                <p className="break-words text-xs text-slate-500">
                  {labelCategoria(d.categoria)} · competência {dataHora(d.data)}
                  {d.status === 'pago' && ` · paga em ${dataHora(d.pagoEm)}`}
                </p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:shrink-0 sm:justify-end">
                <Badge value={d.status} />
                <span className={`shrink-0 text-sm font-bold tabular-nums ${d.status === 'pago' ? 'text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
                  {brl(d.valor)}
                </span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {d.status === 'pendente' ? (
                    <button onClick={() => pagar.mutate(d.id)} disabled={pagar.isPending} className="min-h-9 text-xs font-semibold text-emerald-600 hover:underline disabled:opacity-50">Marcar paga</button>
                  ) : (
                    <button onClick={() => reabrir.mutate(d.id)} disabled={reabrir.isPending} className="min-h-9 text-xs font-semibold text-sky-600 hover:underline disabled:opacity-50">Reabrir</button>
                  )}
                  <button onClick={() => abrirEdicao(d)} className="min-h-9 text-xs font-semibold text-brand-600 hover:underline">Editar</button>
                  <button onClick={() => window.confirm(`Excluir "${d.descricao}"?`) && excluir.mutate(d.id)} className="min-h-9 text-xs font-semibold text-rose-400 hover:text-rose-600">Excluir</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal title={editandoId ? 'Editar despesa' : 'Nova despesa'} open={aberto} onClose={() => setAberto(false)}>
        <div className="space-y-3">
          <Field label="Categoria">
            <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as DespesaCategoria })}>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Descrição">
            <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="ex.: Compra de carne" />
          </Field>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <Input inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
            </Field>
            <Field label="Data (competência)">
              <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </Field>
            <Field label="Vencimento (opcional)">
              <Input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
            </Field>
            <Field label="Forma de pagamento">
              <Select value={form.formaPagamento} onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })}>
                <option value="">—</option>
                {['dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'boleto'].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Select>
            </Field>
          </div>
          {form.categoria === 'insumo' && (
            <Field label="Fornecedor">
              <Select value={form.fornecedorId} onChange={(e) => setForm({ ...form, fornecedorId: e.target.value })}>
                <option value="">— sem fornecedor —</option>
                {(fornecedores.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </Select>
            </Field>
          )}
          {form.categoria === 'folha' && (
            <Field label="Funcionário">
              <Select value={form.usuarioId} onChange={(e) => setForm({ ...form, usuarioId: e.target.value })}>
                <option value="">— selecione —</option>
                {(usuarios.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Observações">
            <Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </Field>
          {erro && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{erro}</p>
          )}
          <Button
            className="w-full"
            loading={salvar.isPending}
            disabled={!form.descricao.trim() || !form.data || !(Number(form.valor.replace(',', '.')) > 0)}
            onClick={() => salvar.mutate()}
          >
            Salvar despesa
          </Button>
        </div>
      </Modal>
    </Card>
  )
}

function exportarDespesas(lista: Despesa[]) {
  return () => {
    baixarCsv(
      'despesas',
      ['Descrição', 'Categoria', 'Valor', 'Competência', 'Vencimento', 'Status', 'Pago em', 'Forma', 'Observações'],
      lista.map((d) => [
        d.descricao,
        labelCategoria(d.categoria),
        d.valor,
        (d.data ?? '').slice(0, 10),
        (d.vencimento ?? '').slice(0, 10),
        d.status,
        d.pagoEm ? dataHora(d.pagoEm) : '',
        d.formaPagamento ?? '',
        d.observacoes ?? '',
      ]),
    )
  }
}

// ------------------------------------------------------------------ fornecedores
function FornecedoresCard() {
  const qc = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', documento: '', telefone: '', email: '', observacoes: '' })
  const [erro, setErro] = useState<string | null>(null)

  const fornecedores = useQuery({ queryKey: ['fornecedores'], queryFn: () => api<Fornecedor[]>('/fornecedores') })

  const salvar = useMutation({
    mutationFn: () => {
      const body = {
        nome: form.nome.trim(),
        documento: form.documento || null,
        telefone: form.telefone || null,
        email: form.email || null,
        observacoes: form.observacoes || null,
      }
      return editandoId
        ? api(`/fornecedores/${editandoId}`, { method: 'PATCH', body })
        : api('/fornecedores', { method: 'POST', body })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fornecedores'] })
      setAberto(false)
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar fornecedor'),
  })

  const excluir = useMutation({
    mutationFn: (id: string) => api(`/fornecedores/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fornecedores'] }),
  })

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-slate-800">
        <h3 className="font-bold text-slate-700 dark:text-slate-200">Fornecedores</h3>
        <Button
          variant="secondary"
          className="!px-3 !py-1.5 !text-xs"
          onClick={() => {
            setEditandoId(null)
            setForm({ nome: '', documento: '', telefone: '', email: '', observacoes: '' })
            setErro(null)
            setAberto(true)
          }}
        >
          + Fornecedor
        </Button>
      </div>

      {fornecedores.isLoading ? (
        <LoadingScreen />
      ) : fornecedores.isError ? (
        <div className="p-5"><ErrorState error={fornecedores.error} /></div>
      ) : (fornecedores.data ?? []).length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhum fornecedor cadastrado.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(fornecedores.data ?? []).map((f) => (
            <li key={f.id} className="flex min-w-0 flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{f.nome}</p>
                <p className="truncate text-xs text-slate-500">
                  {[f.documento, f.telefone].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <button
                onClick={() => {
                  setEditandoId(f.id)
                  setForm({
                    nome: f.nome,
                    documento: f.documento ?? '',
                    telefone: f.telefone ?? '',
                    email: f.email ?? '',
                    observacoes: f.observacoes ?? '',
                  })
                  setErro(null)
                  setAberto(true)
                }}
                className="text-xs font-semibold text-brand-600 hover:underline"
              >
                Editar
              </button>
              <button
                onClick={() => window.confirm(`Excluir fornecedor "${f.nome}"?`) && excluir.mutate(f.id)}
                className="text-xs font-semibold text-rose-400 hover:text-rose-600"
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal title={editandoId ? 'Editar fornecedor' : 'Novo fornecedor'} open={aberto} onClose={() => setAberto(false)}>
        <div className="space-y-3">
          <Field label="Nome"><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <Field label="CPF/CNPJ"><Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></Field>
            <Field label="Telefone"><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></Field>
          </div>
          <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Observações"><Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></Field>
          {erro && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{erro}</p>
          )}
          <Button className="w-full" loading={salvar.isPending} disabled={!form.nome.trim()} onClick={() => salvar.mutate()}>
            Salvar fornecedor
          </Button>
        </div>
      </Modal>
    </Card>
  )
}
