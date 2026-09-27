import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { usePedido, useProdutos } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { Order } from '../../types'
import { Badge, Button, Card, ErrorState, Field, Input, LoadingScreen } from '../../components/ui'
import { brl, dataHora } from '../../lib/format'
import { imprimir, linhasRecibo } from '../../lib/impressora'

const FORMAS = [
  { id: 'dinheiro', label: '💵 Dinheiro' },
  { id: 'pix', label: '⚡ PIX' },
  { id: 'credito', label: '💳 Crédito' },
  { id: 'debito', label: '🏦 Débito' },
] as const

export default function PagamentoPage() {
  const { pedidoId = '' } = useParams()
  const navigate = useNavigate()
  const { me } = useAuth()
  const rid = me?.restaurantId

  const pedido = usePedido(rid, pedidoId)

  const produtos = useProdutos(rid)

  const [forma, setForma] = useState<string>('dinheiro')
  const [valor, setValor] = useState('')
  const [valorRecebido, setValorRecebido] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const registrar = useMutation({
    mutationFn: () =>
      api(`/pagamentos/${pedidoId}`, {
        method: 'POST',
        body: {
          tipo: forma,
          valor: Number(valor.replace(',', '.')),
          troco:
            forma === 'dinheiro' && valorRecebido
              ? Math.max(0, Number(valorRecebido.replace(',', '.')) - Number(valor.replace(',', '.')))
              : null,
        },
      }),
    onSuccess: (data) => {
      const pago = (data as Order).status === 'pago'
      if (pago) navigate('/caixa')
      else resetValores()
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao registrar pagamento'),
  })

  function resetValores() {
    setValor('')
    setValorRecebido('')
    setErro(null)
  }

  function imprimirRecibo() {
    if (!pedido.data) return
    imprimir(
      `Recibo ${pedidoId}`,
      linhasRecibo(
        'PDV Lanchonete',
        pedido.data,
        pedido.data.itens,
        (pid) => produtos.data?.find((x) => x.id === pid)?.nome ?? 'Produto',
      ),
    )
  }

  if (pedido.isLoading) return <LoadingScreen />
  if (pedido.isError) return <ErrorState error={pedido.error} />

  const p = pedido.data!
  const jaPago = p.pagamentos.reduce((s, pg) => s + pg.valor, 0)
  const restante = Math.max(0, Math.round((p.total - jaPago) * 100) / 100)
  const quitado = restante <= 0.009

  const trocoCalculado =
    forma === 'dinheiro' && valorRecebido
      ? Number(valorRecebido.replace(',', '.')) - Number(valor.replace(',', '.'))
      : null

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link to="/caixa" className="text-xs font-semibold text-brand-600 hover:underline">
        ← Voltar ao caixa
      </Link>
      <h1 className="mt-1 text-xl font-bold text-slate-800">Pagamento</h1>
      <p className="text-sm text-slate-500">Pedido de {dataHora(p.criadoEm)} · <Badge value={p.status} /></p>

      <Card className="mt-4 divide-y divide-slate-100">
        <ul>
          {p.itens.filter((i) => i.status !== 'cancelado').map((i) => (
            <li key={i.id} className="flex justify-between px-5 py-2 text-sm">
              <span className="text-slate-700">{i.qtd}× produto</span>
              <span className="font-semibold">{brl(i.qtd * i.precoUnitario)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-bold">Total do pedido</span>
          <span className="text-lg font-bold text-brand-600">{brl(p.total)}</span>
        </div>
        {p.pagamentos.length > 0 && (
          <div className="space-y-1 px-5 py-3">
            <p className="text-xs font-semibold uppercase text-slate-400">Pagamentos registrados</p>
            {p.pagamentos.map((pg) => (
              <div key={pg.id} className="flex justify-between text-sm">
                <span className="capitalize text-slate-600">{pg.tipo}</span>
                <span className="font-semibold text-emerald-600">− {brl(pg.valor)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-dashed pt-2 text-sm font-bold text-slate-700">
              <span>Restante</span>
              <span>{brl(restante)}</span>
            </div>
          </div>
        )}
      </Card>

      {quitado ? (
        <Card className="mt-4 bg-emerald-50 p-8 text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 font-bold text-emerald-700">Pedido quitado!</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => imprimirRecibo()}>
              🖨 Recibo
            </Button>
            <Button onClick={() => navigate('/caixa')}>Voltar ao caixa</Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="mt-4 space-y-4 p-5">
            <div className="grid grid-cols-4 gap-2">
              {FORMAS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setForma(f.id)}
                  className={`rounded-lg border px-2 py-2.5 text-xs font-bold transition ${
                    forma === f.id
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={`Valor (${restante > 0 ? `restante ${brl(restante)}` : ''})`}>
                <Input
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder={restante.toFixed(2).replace('.', ',')}
                />
              </Field>
              {forma === 'dinheiro' && (
                <Field label="Recebido (troco)">
                  <Input
                    inputMode="decimal"
                    value={valorRecebido}
                    onChange={(e) => setValorRecebido(e.target.value)}
                    placeholder="0,00"
                  />
                </Field>
              )}
            </div>

            {trocoCalculado !== null && (
              <p className={`text-sm font-bold ${trocoCalculado >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {trocoCalculado >= 0 ? `Troco: ${brl(trocoCalculado)}` : 'Valor recebido menor que o pagamento'}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setValor(restante.toFixed(2))}>
                Valor exato ({brl(restante)})
              </Button>
            </div>

            {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}

            <Button
              className="w-full py-2.5"
              loading={registrar.isPending}
              disabled={!valor || Number(valor.replace(',', '.')) <= 0 || (trocoCalculado ?? 0) < 0}
              onClick={() => registrar.mutate()}
            >
              Registrar {FORMAS.find((f) => f.id === forma)?.label}
            </Button>
          </Card>

          {forma === 'pix' && <PixHint />}
        </>
      )}
    </div>
  )
}

function PixHint() {
  return (
    <Card className="mt-4 p-5 text-center text-sm text-slate-500">
      <p className="font-semibold text-slate-700">PIX</p>
      <p>A chave PIX configurada nas Configurações aparecerá aqui com QR Code (próxima fase).</p>
    </Card>
  )
}
