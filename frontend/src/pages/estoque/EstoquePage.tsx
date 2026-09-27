import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { baixarCsv } from '../../lib/csv'
import { useEstoque, useMovimentacoes } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { InventoryItem } from '../../types'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, LoadingScreen, Modal, Select } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
import { brl, dataHora } from '../../lib/format'

export default function EstoquePage() {
  const { me } = useAuth()
  const [apenasAlertas, setApenasAlertas] = useState(false)
  const [novoAberto, setNovoAberto] = useState(false)
  const [movItem, setMovItem] = useState<InventoryItem | null>(null)

  const estoqueQ = useEstoque(me?.restaurantId)
  const movimentacoes = useMovimentacoes(me?.restaurantId)

  const itens = {
    isLoading: estoqueQ.isLoading,
    isError: estoqueQ.isError,
    error: estoqueQ.error,
    data: apenasAlertas
      ? (estoqueQ.data ?? []).filter((i) => (i.quantidadeAtual ?? 0) <= (i.minimo ?? 0))
      : (estoqueQ.data ?? []),
  }

  if (itens.isLoading) return <LoadingScreen />
  if (itens.isError) return <ErrorState error={itens.error} />

  return (
    <div className="p-6">
      <PageHeader
        title="Estoque"
        subtitle={`${itens.data?.length ?? 0} item(ns)`}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={apenasAlertas} onChange={(e) => setApenasAlertas(e.target.checked)} className="h-4 w-4 accent-brand-600" />
              Somente alertas
            </label>
            <Button variant="secondary" onClick={() => exportarItens(itens.data ?? [])}>⬇ CSV</Button>
            <Button onClick={() => setNovoAberto(true)}>+ Novo item</Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3">Saldo</th>
                <th className="px-5 py-3">Mínimo</th>
                <th className="px-5 py-3">Custo médio</th>
                <th className="px-5 py-3 text-right">Movimentar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(itens.data ?? []).map((item) => {
                const alerta = item.quantidadeAtual <= item.minimo
                return (
                  <tr key={item.id} className={alerta ? 'bg-amber-50/60' : ''}>
                    <td className="px-5 py-3 font-semibold text-slate-800">{item.nome}</td>
                    <td className={`px-5 py-3 font-bold ${alerta ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {item.quantidadeAtual} {item.unidade}
                      {alerta && ' ⚠️'}
                    </td>
                    <td className="px-5 py-3 text-slate-400">{item.minimo}</td>
                    <td className="px-5 py-3">{brl(item.custoMedio)}</td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="secondary" className="!px-3 !py-1 !text-xs" onClick={() => setMovItem(item)}>
                        Movimentar
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {(itens.data ?? []).length === 0 && <EmptyState icon="📦" message="Nenhum item de estoque." />}
        </Card>

        <Card className="overflow-hidden">
          <p className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-700">Últimas movimentações</p>
          <ul className="max-h-[60vh] divide-y divide-slate-50 overflow-y-auto">
            {(movimentacoes.data ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <div>
                  <Badge value={m.tipo} />
                  <span className="ml-2 text-xs text-slate-400">{dataHora(m.criadoEm)}</span>
                </div>
                <span className={`font-bold ${m.tipo === 'entrada' ? 'text-emerald-600' : m.tipo === 'saida' ? 'text-rose-500' : 'text-sky-600'}`}>
                  {m.tipo === 'ajuste' ? '=' : m.tipo === 'entrada' ? '+' : '−'}{m.qtd}
                </span>
              </li>
            ))}
            {(movimentacoes.data ?? []).length === 0 && (
              <li className="px-5 py-8 text-center text-xs text-slate-400">Sem movimentações.</li>
            )}
          </ul>
        </Card>
      </div>

      <NovoItemModal open={novoAberto} onClose={() => setNovoAberto(false)} />
      {movItem && (
        <MovimentacaoModal
          item={movItem}
          onClose={() => {
            setMovItem(null)
          }}
        />
      )}
    </div>
  )
}

function exportarItens(itens: InventoryItem[]) {
  baixarCsv(
    'estoque',
    ['Item', 'Saldo', 'Unidade', 'Mínimo', 'Custo médio'],
    itens.map((i) => [i.nome, i.quantidadeAtual, i.unidade, i.minimo, i.custoMedio]),
  )
}

function NovoItemModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ nome: '', unidade: 'un', quantidadeAtual: '', minimo: '', custoMedio: '' })

  const criar = useMutation({
    mutationFn: () =>
      api('/estoque/itens', {
        method: 'POST',
        body: {
          nome: form.nome.trim(),
          unidade: form.unidade,
          quantidadeAtual: Number(form.quantidadeAtual.replace(',', '.')) || 0,
          minimo: Number(form.minimo.replace(',', '.')) || 0,
          custoMedio: Number(form.custoMedio.replace(',', '.')) || 0,
        },
      }),
    onSuccess: () => {
      setForm({ nome: '', unidade: 'un', quantidadeAtual: '', minimo: '', custoMedio: '' })
      onClose()
    },
  })

  return (
    <Modal title="Novo item de estoque" open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nome"><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unidade">
            <Select value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })}>
              {['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct'].map((u) => <option key={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Quantidade inicial">
            <Input inputMode="decimal" value={form.quantidadeAtual} onChange={(e) => setForm({ ...form, quantidadeAtual: e.target.value })} />
          </Field>
          <Field label="Mínimo (alerta)">
            <Input inputMode="decimal" value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} />
          </Field>
          <Field label="Custo médio (R$)">
            <Input inputMode="decimal" value={form.custoMedio} onChange={(e) => setForm({ ...form, custoMedio: e.target.value })} />
          </Field>
        </div>
        <Button className="w-full" loading={criar.isPending} disabled={!form.nome.trim()} onClick={() => criar.mutate()}>
          Criar item
        </Button>
      </div>
    </Modal>
  )
}

function MovimentacaoModal({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [tipo, setTipo] = useState<'entrada' | 'saida' | 'ajuste'>('entrada')
  const [qtd, setQtd] = useState('')
  const [observacao, setObservacao] = useState('')

  const registrar = useMutation({
    mutationFn: () =>
      api('/estoque/movimentacoes', {
        method: 'POST',
        body: { tipo, itemId: item.id, qtd: Number(qtd.replace(',', '.')), observacao: observacao || null },
      }),
    onSuccess: () => {
      onClose()
    },
  })

  return (
    <Modal title={`Movimentar — ${item.nome}`} open onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(['entrada', 'saida', 'ajuste'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`rounded-lg border px-2 py-2 text-xs font-bold capitalize transition ${
                tipo === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
              }`}
            >
              {t === 'ajuste' ? '= ajustar para' : t === 'entrada' ? '+ entrada' : '− saída'}
            </button>
          ))}
        </div>
        <Field label={tipo === 'ajuste' ? `Novo saldo (${item.unidade})` : `Quantidade (${item.unidade})`}>
          <Input inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" autoFocus />
        </Field>
        <Field label="Observação (opcional)">
          <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: compra do dia" />
        </Field>
        <Button className="w-full" loading={registrar.isPending} disabled={!qtd} onClick={() => registrar.mutate()}>
          Registrar movimentação
        </Button>
      </div>
    </Modal>
  )
}
