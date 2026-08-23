import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { CashSession } from '../../types'
import { Badge, Button, Card, ErrorState, Field, Input, LoadingScreen, Modal } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { brl, dataHora } from '../../lib/format'

export default function FechamentoCaixaPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'abrir' | 'suprimento' | 'sangria' | 'fechar' | null>(null)

  const sessoes = useQuery({
    queryKey: ['caixa', 'sessoes'],
    queryFn: () => api<CashSession[]>('/caixa/sessoes'),
    refetchInterval: 20_000,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['caixa'] })

  if (sessoes.isLoading) return <LoadingScreen />
  if (sessoes.isError) return <ErrorState error={sessoes.error} />

  const atual = (sessoes.data ?? []).find((s) => s.status === 'aberto')
  const historico = (sessoes.data ?? []).filter((s) => s.status === 'fechado')

  return (
    <div className="p-6">
      <PageHeader
        title="Fechamento de caixa"
        subtitle="Sessões de caixa do restaurante"
        actions={
          atual ? (
            <>
              <Button variant="secondary" onClick={() => setModal('suprimento')}>+ Suprimento</Button>
              <Button variant="secondary" onClick={() => setModal('sangria')}>− Sangria</Button>
              <Button variant="danger" onClick={() => setModal('fechar')}>Fechar caixa</Button>
            </>
          ) : (
            <Button onClick={() => setModal('abrir')}>Abrir caixa</Button>
          )
        }
      />

      {atual ? (
        <Card className="mb-6 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-slate-700">Sessão aberta · {dataHora(atual.abertoEm)}</h3>
            <Badge value="aberto" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <Linha label="Fundo de troco" valor={brl(atual.valorInicial)} />
            <Linha label="Total em vendas" valor={brl(atual.totalVendas)} destaque />
            <Linha label="Recebido" valor={brl(atual.totalRecebido)} />
            <Linha label="Suprimentos" valor={brl(atual.suprimentos)} />
            <Linha label="Sangrias" valor={brl(atual.sangrias)} />
          </div>

          {Object.keys(atual.vendasPorFormaPagamento ?? {}).length > 0 && (
            <div className="mt-4 border-t border-dashed pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Vendas por forma de pagamento</p>
              <div className="flex flex-wrap gap-4 text-sm">
                {Object.entries(atual.vendasPorFormaPagamento ?? {}).map(([forma, v]) => (
                  <span key={forma} className="capitalize text-slate-600">{forma}: <b>{brl(v)}</b></span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-600">
              Esperado em caixa:{' '}
              <b className="text-slate-800">
                {brl(atual.valorInicial + atual.totalRecebido + atual.suprimentos - atual.sangrias)}
              </b>
            </p>
          </div>
        </Card>
      ) : (
        <Card className="mb-6 p-8 text-center text-sm text-slate-400">
          Nenhuma sessão de caixa aberta.
        </Card>
      )}

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Histórico</h2>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-5 py-3">Abertura</th>
              <th className="px-5 py-3">Fechamento</th>
              <th className="px-5 py-3">Vendas</th>
              <th className="px-5 py-3">Esperado</th>
              <th className="px-5 py-3">Contado</th>
              <th className="px-5 py-3">Diferença</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {historico.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-3 text-slate-500">{dataHora(s.abertoEm)}</td>
                <td className="px-5 py-3 text-slate-500">{dataHora(s.fechadoEm)}</td>
                <td className="px-5 py-3 font-semibold">{brl(s.totalVendas)}</td>
                <td className="px-5 py-3">{brl(s.resumoFechamento?.esperadoEmCaixa ?? 0)}</td>
                <td className="px-5 py-3">{s.resumoFechamento?.valorContado != null ? brl(s.resumoFechamento.valorContado) : '—'}</td>
                <td className={`px-5 py-3 font-bold ${
                  s.resumoFechamento?.diferenca == null
                    ? 'text-slate-300'
                    : Math.abs(s.resumoFechamento.diferenca) < 0.01
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                }`}>
                  {s.resumoFechamento?.diferenca != null ? brl(s.resumoFechamento.diferenca) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {historico.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Sem sessões fechadas ainda.</p>}
      </Card>

      <SessaoModais modal={modal} onClose={() => setModal(null)} onDone={invalidate} sessaoAtual={atual} />
    </div>
  )
}

function Linha({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${destaque ? 'text-brand-600' : 'text-slate-800'}`}>{valor}</p>
    </div>
  )
}

function SessaoModais({
  modal,
  onClose,
  onDone,
  sessaoAtual,
}: {
  modal: 'abrir' | 'suprimento' | 'sangria' | 'fechar' | null
  onClose: () => void
  onDone: () => void
  sessaoAtual?: CashSession
}) {
  const [valor, setValor] = useState('')
  const [obs, setObs] = useState('')

  const acao = useMutation({
    mutationFn: async () => {
      const v = Number(valor.replace(',', '.')) || 0
      if (modal === 'abrir') return api('/caixa/abrir', { method: 'POST', body: { valorInicial: v } })
      if (modal === 'suprimento') return api('/caixa/suprimento', { method: 'POST', body: { valor: v, observacao: obs || null } })
      if (modal === 'sangria') return api('/caixa/sangria', { method: 'POST', body: { valor: v, observacao: obs || null } })
      return api('/caixa/fechar', { method: 'POST', body: { valorContado: v > 0 ? v : null } })
    },
    onSuccess: () => {
      onDone()
      setValor('')
      setObs('')
      onClose()
    },
  })

  const titulos = { abrir: 'Abrir caixa', suprimento: 'Suprimento (entrada)', sangria: 'Sangria (retirada)', fechar: 'Fechar caixa' }
  const labels = {
    abrir: 'Valor de abertura',
    suprimento: 'Valor entrado',
    sangria: 'Valor retirado',
    fechar: 'Valor contado em dinheiro (opcional)',
  }

  return (
    <Modal title={modal ? titulos[modal] : ''} open={!!modal} onClose={onClose}>
      <div className="space-y-4">
        {modal && modal !== 'abrir' && sessaoAtual && modal !== 'fechar' && (
          <p className="text-xs text-slate-400">Sessão aberta desde {dataHora(sessaoAtual.abertoEm)}</p>
        )}
        {modal === 'fechar' && sessaoAtual && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Esperado: <b>{brl(sessaoAtual.valorInicial + sessaoAtual.totalRecebido + sessaoAtual.suprimentos - sessaoAtual.sangrias)}</b>
          </p>
        )}
        <Field label={modal ? labels[modal] : ''}>
          <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" autoFocus />
        </Field>
        {(modal === 'suprimento' || modal === 'sangria') && (
          <Field label="Observação">
            <Input value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>
        )}
        {acao.isError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{String(acao.error)}</p>}
        <Button
          variant={modal === 'fechar' ? 'danger' : 'primary'}
          className="w-full"
          loading={acao.isPending}
          disabled={modal !== 'fechar' && !valor}
          onClick={() => acao.mutate()}
        >
          Confirmar
        </Button>
      </div>
    </Modal>
  )
}
