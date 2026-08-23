import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
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
  const maxHora = Math.max(...Object.values(r.vendasPorHora), 1)

  return (
    <div className="p-6">
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
        <KpiCard icon="🧾" label="Pedidos pagos" value={String(r.totalPedidos)} />
        <KpiCard icon="💰" label="Faturamento" value={brl(r.faturamentoBruto)} highlight />
        <KpiCard icon="📈" label="Ticket médio" value={brl(r.ticketMedio)} />
        <KpiCard icon="⏱️" label="Período" value={PERIODOS.find((p) => p.id === periodo)?.label ?? ''} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">Vendas por hora</h3>
          <div className="flex h-40 items-end gap-1">
            {Object.entries(r.vendasPorHora).map(([hora, valor]) => (
              <div key={hora} className="group flex flex-1 flex-col items-center justify-end" title={`${hora}h — ${brl(valor)}`}>
                <span className="mb-0.5 hidden text-[9px] font-bold text-brand-600 group-hover:block">
                  {valor > 0 ? brl(valor).replace('R$', '').trim() : ''}
                </span>
                <div
                  className="w-full rounded-t bg-brand-500 transition group-hover:bg-brand-600"
                  style={{ height: `${Math.max(2, (valor / maxHora) * 100)}%`, opacity: valor > 0 ? 1 : 0.15 }}
                />
                <span className="mt-1 text-[9px] text-slate-400">{hora}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold text-slate-700">Por forma de pagamento</h3>
          {Object.keys(r.vendasPorFormaPagamento).length === 0 ? (
            <p className="text-sm text-slate-400">Sem vendas no período.</p>
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

function KpiCard({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`flex items-center gap-4 p-5 ${highlight ? 'bg-gradient-to-br from-brand-50 to-white' : ''}`}>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-xl">{icon}</span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`text-lg font-bold ${highlight ? 'text-brand-600' : 'text-slate-800'}`}>{value}</p>
      </div>
    </Card>
  )
}

function RankingList({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data)
  if (entries.length === 0) return <p className="text-sm text-slate-400">Sem dados.</p>
  const max = entries[0][1] || 1
  return (
    <ul className="space-y-2">
      {entries.map(([nome, qtd]) => (
        <li key={nome} className="flex items-center gap-2 text-sm">
          <span className="w-32 truncate font-semibold text-slate-700">{nome}</span>
          <div className="h-2 flex-1 rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${(qtd / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right font-bold text-slate-500">{qtd}</span>
        </li>
      ))}
    </ul>
  )
}
