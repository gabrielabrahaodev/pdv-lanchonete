import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Banknote, Clock3, ReceiptText, TrendingUp } from 'lucide-react'
import { api } from '../../lib/api'
import { baixarCsv } from '../../lib/csv'
import type { ReportSummary } from '../../types'
import { Button, Card, ErrorState, LoadingScreen, Select } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { brl, diasAtrasISO } from '../../lib/format'

const PERIODOS = [
  { id: 'hoje', label: 'Hoje', dias: 0 },
  { id: '7d', label: '7 dias', dias: 7 },
  { id: '30d', label: '30 dias', dias: 30 },
]

export default function RelatoriosPage() {
  const [periodo, setPeriodo] = useState('hoje')

  const resumo = useQuery({
    queryKey: ['relatorios', periodo],
    queryFn: () => {
      const inicio = diasAtrasISO(PERIODOS.find((p) => p.id === periodo)?.dias ?? 0)
      return api<ReportSummary>(`/relatorios/resumo?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(new Date().toISOString())}`)
    },
  })

  if (resumo.isLoading) return <LoadingScreen />
  if (resumo.isError) return <ErrorState error={resumo.error} />

  const r = resumo.data!
  const horas = Object.entries(r.vendasPorHora ?? {}).sort(([a], [b]) => a.localeCompare(b))
  const maxHora = Math.max(0, ...horas.map(([, valor]) => Number(valor) || 0))

  return (
    <div className="p-3 sm:p-6">
      <PageHeader
        title="Relatórios"
        subtitle="Vendas do período (pedidos pagos)"
        actions={
          <>
            <Select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-36">
              {PERIODOS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
            <Button variant="secondary" onClick={exportarResumo(r, periodo)}>⬇ CSV</Button>
            <Link to="/relatorios/fechamento-caixa">
              <Button variant="secondary">Fechamento de caixa</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<ReceiptText className="h-5 w-5" aria-hidden="true" />} label="Pedidos pagos" value={String(r.totalPedidos)} />
        <KpiCard icon={<Banknote className="h-5 w-5" aria-hidden="true" />} label="Faturamento" value={brl(r.faturamentoBruto)} highlight />
        <KpiCard icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />} label="Ticket médio" value={brl(r.ticketMedio)} />
        <KpiCard icon={<Clock3 className="h-5 w-5" aria-hidden="true" />} label="Período" value={PERIODOS.find((p) => p.id === periodo)?.label ?? ''} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-700">Vendas por hora</h3>
            <span className="text-xs text-slate-500">Passe o mouse nas barras para ver o valor</span>
          </div>
          {maxHora <= 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-500">Sem vendas no período.</div>
          ) : (
            <div className="flex h-40 items-end gap-1 overflow-x-auto pb-1">
              {horas.map(([hora, rawValor]) => {
                const valor = Number(rawValor) || 0
                const alturaPx = valor > 0 ? Math.max(4, (valor / maxHora) * 108) : 2
                return (
                  <div
                    key={hora}
                    className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                    title={`${hora}h — ${brl(valor)}`}
                    aria-label={`${hora} horas: ${brl(valor)}`}
                  >
                    <div className="flex min-h-0 w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t bg-brand-500 transition-colors group-hover:bg-brand-600"
                        style={{ height: `${alturaPx}px`, opacity: valor > 0 ? 1 : 0.12 }}
                      />
                    </div>
                    <span className="mt-1 text-[9px] leading-3 text-slate-500">{hora}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">Por forma de pagamento</h3>
          {Object.keys(r.vendasPorFormaPagamento ?? {}).length === 0 ? (
            <p className="text-sm text-slate-500">Sem vendas no período.</p>
          ) : (
            <ul className="space-y-3">
              {Object.entries(r.vendasPorFormaPagamento).map(([forma, valor]) => {
                const pct = r.faturamentoBruto > 0 ? (valor / r.faturamentoBruto) * 100 : 0
                return (
                  <li key={forma}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-semibold capitalize text-slate-600">{forma}</span>
                      <span className="text-slate-500">{brl(valor)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-700">Top produtos</h3>
          <RankingList data={r.topProdutos} />
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-700">Top categorias</h3>
          <RankingList data={r.topCategorias} />
        </Card>
      </div>
    </div>
  )
}

function exportarResumo(r: ReportSummary, periodo: string) {
  return () => {
    const linhas: (string | number)[][] = [
      ['RESUMO', '', ''],
      ['Período', PERIODOS.find((p) => p.id === periodo)?.label ?? periodo, ''],
      ['Pedidos pagos', r.totalPedidos, ''],
      ['Faturamento', r.faturamentoBruto, ''],
      ['Ticket médio', r.ticketMedio, ''],
      [],
      ['VENDAS POR HORA', '', ''],
      ...Object.entries(r.vendasPorHora).map(([h, v]) => [`${h}h`, v, '']),
      [],
      ['POR FORMA DE PAGAMENTO', '', ''],
      ...Object.entries(r.vendasPorFormaPagamento).map(([f, v]) => [f, v, '']),
      [],
      ['TOP PRODUTOS', '', ''],
      ...Object.entries(r.topProdutos).map(([p, q]) => [p, q, '']),
      [],
      ['TOP CATEGORIAS', '', ''],
      ...Object.entries(r.topCategorias).map(([c, q]) => [c, q, '']),
      [],
      ['FINANCEIRO', '', ''],
      ['Total despesas', r.financeiro?.totalDespesas ?? 0, ''],
      ['CMV estimado', r.financeiro?.cmvEstimado ?? 0, ''],
      ['Resultado gerencial', r.financeiro?.resultadoGerencial ?? 0, ''],
    ]
    baixarCsv(`relatorio-vendas-${periodo}`, ['Métrica', 'Valor', ''], linhas)
  }
}

function KpiCard({ icon, label, value, highlight }: { icon: ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`flex items-center gap-4 p-5 ${highlight ? 'bg-gradient-to-br from-brand-50 to-white dark:from-brand-500/10 dark:to-slate-900' : ''}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`truncate text-lg font-bold tabular-nums ${highlight ? 'text-brand-600' : 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
      </div>
    </Card>
  )
}

function RankingList({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data ?? {})
  if (entries.length === 0) return <p className="text-sm text-slate-500">Sem dados.</p>
  const max = Math.max(1, ...entries.map(([, value]) => Number(value) || 0))
  return (
    <ul className="space-y-2">
      {entries.map(([nome, qtd]) => (
        <li key={nome} className="flex items-center gap-2 text-sm">
          <span className="w-32 truncate font-semibold text-slate-700" title={nome}>{nome}</span>
          <div className="h-2 flex-1 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${(qtd / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right font-bold text-slate-500">{qtd}</span>
        </li>
      ))}
    </ul>
  )
}
