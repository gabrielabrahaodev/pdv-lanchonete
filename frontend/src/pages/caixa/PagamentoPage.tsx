import { AjudaContextual } from '../../wiki/componentes/AjudaContextual'
import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { usePedido, useProdutos, useSessaoAtual } from '../../hooks/useFirestore'
import { useAuth } from '../../context/AuthContext'
import type { Order } from '../../types'
import { Badge, ButtonLink, Button, Card, ErrorState, Field, Input, LoadingScreen } from '../../components/ui'
import { brl, dataHora } from '../../lib/format'
import { imprimir, linhasRecibo, identificacaoPedido } from '../../lib/impressora'

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
  const sessao = useSessaoAtual(rid)
  const [entregarProntos, setEntregarProntos] = useState(false)
  const envio = useRef<{chave:string; body:{tipo:string; valor:number; troco:number|null; entregarProntos:boolean}} | null>(null)
  const [bloqueado, setBloqueado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const registrar = useMutation({
    mutationFn: () => {
      if (!envio.current) {
        const p = pedido.data
        if (!p) throw new ApiError(404, 'Pedido não encontrado')
        const restante = Math.max(0, Math.round((p.total - p.pagamentos.reduce((s,pg) => s+pg.valor,0))*100)/100)
        const quantia = p.tipo === 'balcao' ? restante : Number(valor.replace(',', '.'))
        envio.current = {chave:crypto.randomUUID(), body:{tipo:forma, valor:quantia,
          troco: forma === 'dinheiro' && valorRecebido ? Math.max(0,Number(valorRecebido.replace(',','.'))-quantia) : null,
          entregarProntos: p.tipo === 'balcao' && entregarProntos}}
      }
      setBloqueado(true)
      return api<Order>(`/pagamentos/${pedidoId}`, {method:'POST', body:envio.current.body, paymentIdempotencyKey:envio.current.chave})
    },
    onSuccess: (data) => {
      const pago = (data as Order).status === 'pago'
      envio.current = null
      setBloqueado(false)
      setErro(null)
      if (pago && (data as Order).tipo !== 'balcao') navigate('/caixa')
      else resetValores()
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) { envio.current = null; setBloqueado(false) }
      setErro(envio.current ? 'Pagamento não confirmado. Tente novamente: a mesma operação será conferida sem duplicar o recebimento.' : e instanceof Error ? e.message : 'Erro ao registrar pagamento')
    },
  })

  const cancelar = useMutation({
    mutationFn: () => api(`/pedidos/${pedidoId}/cancelar`, {method:'POST'}),
    onSuccess: () => navigate('/caixa'),
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao cancelar'),
  })
  const entregar = useMutation({
    mutationFn: () => api(`/cozinha/pedidos/${pedidoId}/itens/status`, {method:'PATCH', body:{itemIds:pedido.data?.itens.filter(i => i.status === 'pronto').map(i => i.id), novoStatus:'entregue'}}),
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao entregar'),
    onSuccess: () => setErro(null),
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
        me?.restaurantNome ?? 'PDV Lanchonete',
        pedido.data,
        pedido.data.itens,
        (pid) => produtos.data?.find((x) => x.id === pid)?.nome ?? 'Produto',
      ),
    )
  }

  if (pedido.isLoading) return <LoadingScreen />
  if (pedido.isError) return <ErrorState error={pedido.error} />

  const p = pedido.data
  if (!p) return <p className="p-6">Pedido não encontrado.</p>
  if (p.status === 'cancelado') return <div className="p-6">Pedido cancelado. <Link to="/caixa">Voltar ao caixa</Link></div>
  const balcao = p.tipo === 'balcao'
  const jaPago = p.pagamentos.reduce((s, pg) => s + pg.valor, 0)
  const restante = Math.max(0, Math.round((p.total - jaPago) * 100) / 100)
  const quitado = restante <= 0.009

  const quantia = balcao ? restante : Number(valor.replace(',', '.'))
  const prontos = p.itens.filter(i => i.status === 'pronto')
  const trocoCalculado =
    forma === 'dinheiro' && valorRecebido
      ? Number(valorRecebido.replace(',', '.')) - quantia
      : null

  return (
    <div className="mx-auto w-full max-w-2xl pdv-page p-3 sm:p-5 lg:p-6">
      <Link to="/caixa" className="text-xs font-semibold text-brand-600 action-button">
        ← Voltar ao caixa
      </Link>
      <h1 className="mt-1 text-xl font-bold text-slate-800 dark:text-slate-100">{balcao ? 'Pagamento — venda direta' : 'Pagamento'}</h1>
        <AjudaContextual />
      <p className="text-sm text-slate-500 dark:text-slate-400">{identificacaoPedido(p)} · {dataHora(p.criadoEm)} · <Badge value={p.status} /></p>

      <Card className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        <ul>
          {p.itens.filter((i) => i.status !== 'cancelado').map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-3 px-5 py-2 text-sm">
              <span className="min-w-0 break-words text-slate-700 dark:text-slate-100">{i.qtd}× {i.produtoNome ?? produtos.data?.find(prod => prod.id === i.produtoId)?.nome ?? 'Produto'} · {i.status}</span>
              <span className="shrink-0 font-semibold">{brl(i.qtd * i.precoUnitario)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-bold">Total do pedido</span>
          <span className="text-lg font-bold tabular-nums text-brand-600">{brl(p.total)}</span>
        </div>
        {p.pagamentos.length > 0 && (
          <div className="space-y-1 px-5 py-3">
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Pagamentos registrados</p>
            {p.pagamentos.map((pg) => (
              <div key={pg.id} className="flex justify-between text-sm">
                <span className="capitalize text-slate-600 dark:text-slate-300">{pg.tipo}</span>
                <span className="font-semibold text-emerald-600">− {brl(pg.valor)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-dashed pt-2 text-sm font-bold text-slate-700 dark:text-slate-100">
              <span>Restante</span>
              <span>{brl(restante)}</span>
            </div>
          </div>
        )}
      </Card>

      {!balcao && p.mesaId && !quitado && <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">Ao quitar todo o saldo, a mesa será liberada e sairá da cozinha. O estado físico dos itens será preservado; reservas da estufa sem entrega confirmada ficarão aguardando conferência.</p>}
      {p.reservaConferenciaPendente && <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-300">Existem reservas aguardando conferência em Produção e Estufa.</p>}
      {erro && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{erro}</p>}
      {quitado ? (
        <Card className="mt-4 bg-emerald-50 p-8 text-center dark:bg-emerald-950/40">
          <p className="text-3xl">✅</p>
          <p className="mt-2 font-bold text-emerald-700 dark:text-emerald-300">Pedido quitado!</p>
          {balcao && p.itens.some(i => ['pendente','preparo'].includes(i.status)) && <p className="mt-2 text-sm">O preparo continua na cozinha como {identificacaoPedido(p)}.</p>}
          {balcao && prontos.length > 0 && <Button className="mt-3" loading={entregar.isPending} onClick={() => entregar.mutate()}>Confirmar entrega dos itens prontos</Button>}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {balcao && <ButtonLink to="/caixa/venda-direta">Nova venda</ButtonLink>}
            <Button variant="secondary" onClick={() => imprimirRecibo()}>
              🖨 Recibo
            </Button>
            <Button onClick={() => navigate('/caixa')}>Voltar ao caixa</Button>
          </div>
        </Card>
      ) : (
        <>
          {balcao && !sessao.isLoading && !sessao.data && <p role="alert" className="mt-4 text-rose-600">Abra o caixa para receber esta venda.</p>}
          <Card className="mt-4 space-y-4 p-5">
            <fieldset disabled={bloqueado || cancelar.isPending} className="space-y-4">
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

            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
              <Field label={`Valor (${restante > 0 ? `restante ${brl(restante)}` : ''})`}>
                <Input
                  inputMode="decimal"
                  value={balcao ? restante.toFixed(2).replace('.', ',') : valor}
                  readOnly={balcao}
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

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setValor(restante.toFixed(2))}>
                Valor exato ({brl(restante)})
              </Button>
            </div>

            {balcao && prontos.length > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={entregarProntos} onChange={e => setEntregarProntos(e.target.checked)} />Confirmar também a entrega dos itens prontos. Os que precisam de preparo continuam na cozinha.</label>}
            </fieldset>

            <Button
              className="w-full py-2.5"
              loading={registrar.isPending}
              disabled={cancelar.isPending || (!bloqueado && (!Number.isFinite(quantia) || quantia <= 0 || (trocoCalculado !== null && (!Number.isFinite(trocoCalculado) || trocoCalculado < 0)) || (balcao && (!sessao.data || sessao.isError || sessao.isLoading))))}
              onClick={() => registrar.mutate()}
            >
              {bloqueado && registrar.isError ? 'Tentar novamente' : balcao ? `Confirmar pagamento ${brl(restante)}` : `Registrar ${FORMAS.find((f) => f.id === forma)?.label}`}
            </Button>
            {balcao && jaPago === 0 && <Button variant="secondary" disabled={bloqueado} loading={cancelar.isPending} onClick={() => window.confirm('Cancelar esta venda? Reservas da estufa serão liberadas. Insumos já consumidos não serão estornados.') && cancelar.mutate()}>Cancelar venda</Button>}
          </Card>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Confirme apenas após receber o dinheiro ou verificar a aprovação do PIX/cartão.</p>
          {forma === 'pix' && <PixHint />}
        </>
      )}
    </div>
  )
}

function PixHint() {
  return (
    <Card className="mt-4 p-5 text-center text-sm text-slate-500 dark:text-slate-400">
      <p className="font-semibold text-slate-700 dark:text-slate-100">PIX</p>
      <p>A chave PIX configurada nas Configurações aparecerá aqui com QR Code (próxima fase).</p>
    </Card>
  )
}
