import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { brl, dataHora } from '../../lib/format'
import { numeroDecimal } from '../../lib/precificacao'
import { useAuth } from '../../context/AuthContext'
import { useLotesProducao, useHistoricoProducao, useProdutos, useEstoque } from '../../hooks/useFirestore'
import { Button, Card, ErrorState, Field, Input, LoadingScreen, Select } from '../../components/ui'
import type { MovimentoProducao } from '../../types'

const NOMES: Record<MovimentoProducao['tipo'], string> = {
  producao: 'Produção', reserva: 'Reserva', entrega: 'Entrega', liberacao: 'Reserva liberada',
  perda: 'Perda / ajuste', conversao_saida: 'Conversão — saída', conversao_entrada: 'Conversão — entrada',
}

type Envio = { path: string; body: unknown; chave: string }

export default function ProducaoPage() {
  const { me } = useAuth()
  const rid = me?.restaurantId
  const operar = ['admin', 'gerente', 'caixa', 'cozinha'].includes(me?.papel ?? '')
  const lotes = useLotesProducao(rid)
  const produtos = useProdutos(rid)
  const estoque = useEstoque(rid)
  const historico = useHistoricoProducao(operar ? rid : null)
  const [aba, setAba] = useState<'disponiveis' | 'produzir' | 'historico'>('disponiveis')
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30000); return () => clearInterval(t) }, [])
  const [busca, setBusca] = useState('')
  const [localFiltro, setLocalFiltro] = useState('')
  const [form, setForm] = useState({ produtoId: '', receitas: '1', quantidade: '', validade: '', local: 'Estufa', observacao: '' })
  const [loteId, setLoteId] = useState('')
  const [acao, setAcao] = useState<'perda' | 'converter'>('perda')
  const [ajuste, setAjuste] = useState({ quantidade: '1', motivo: 'vencimento', observacao: '', destino: '', quantidadeDestino: '' })
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [bloqueado, setBloqueado] = useState(false)
  const envio = useRef<Envio | null>(null)
  const salvar = useMutation({
    mutationFn: (dados: Envio) => api(dados.path, {method: 'POST', body: dados.body, idempotencyKey: dados.chave}),
    onSuccess: () => { envio.current = null; setBloqueado(false); setErro(''); setSucesso('Lançamento registrado. Os saldos serão atualizados automaticamente.'); setLoteId(''); setAba('disponiveis') },
    onError: (e) => {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) { envio.current = null; setBloqueado(false) }
      setErro(envio.current ? 'Envio não confirmado. Tente novamente para conferir o mesmo lançamento, sem duplicá-lo.' : e instanceof Error ? e.message : 'Não foi possível registrar.')
    },
  })
  function enviar(path: string, body: unknown) {
    if (envio.current) return
    const dados = {path, body, chave: crypto.randomUUID()}
    envio.current = dados; setBloqueado(true); setErro(''); setSucesso(''); salvar.mutate(dados)
  }
  const lista = lotes.data ?? []
  const prontos = (produtos.data ?? []).filter((p) => p.modoEstoque === 'antecipado' && p.ativo)
  const produto = prontos.find((p) => p.id === form.produtoId)
  const lote = lista.find((l) => l.id === loteId)
  const receitas = numeroDecimal(form.receitas)
  const quantidade = Number(form.quantidade)
  const custoReceita = (produto?.ingredientes ?? []).reduce((s, i) => s + i.qtd * (estoque.data?.find((e) => e.id === i.itemId)?.custoMedio ?? 0), 0)
  const custo = custoReceita * receitas
  const vencido = (validade: string) => new Date(validade).getTime() <= agora
  const filtrados = lista.filter((l) => (!localFiltro || l.local === localFiltro) && l.produtoNome.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => +new Date(a.validade) - +new Date(b.validade))
  const disponiveis = lista.reduce((s, l) => s + (vencido(l.validade) ? 0 : Math.max(0, l.saldo - l.reservado)), 0)
  const baixos = prontos.filter((p) => lista.reduce((s, l) => s + (l.produtoId === p.id && !vencido(l.validade) ? Math.max(0, l.saldo - l.reservado) : 0), 0) <= (p.estoqueMinimo ?? 0))
  const reservados = lista.reduce((s, l) => s + l.reservado, 0)
  const vencidos = lista.reduce((s, l) => s + (vencido(l.validade) ? l.saldo : 0), 0)

  if (lotes.isLoading || produtos.isLoading) return <LoadingScreen />
  if (lotes.isError || produtos.isError) return <ErrorState error={lotes.error ?? produtos.error} />

  return <div className="mx-auto w-full max-w-6xl space-y-5 p-3 sm:p-6">
    <header className="pl-14 md:pl-0">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Produção e Estufa</h1>
      <p className="mt-1 text-sm text-slate-500">Prepare os lotes, acompanhe a validade e entregue sem consumir ingredientes duas vezes.</p>
    </header>
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
      {[['Disponíveis', disponiveis], ['Reservados nos pedidos', reservados], ['Vencidos — retirar da venda', vencidos]].map(([nome, valor]) =>
        <Card key={nome} className="p-4"><p className="text-xs text-slate-500">{nome}</p><p className="mt-1 text-2xl font-bold">{valor}</p></Card>)}
    </div>
    {baixos.length > 0 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Saldo disponível no mínimo ou esgotado: {baixos.map((p) => p.nome).join(', ')}.</p>}
    <nav className="flex flex-wrap gap-2" aria-label="Seções de produção">
      <Button variant={aba === 'disponiveis' ? 'primary' : 'secondary'} onClick={() => setAba('disponiveis')}>Disponíveis</Button>
      {operar && <><Button variant={aba === 'produzir' ? 'primary' : 'secondary'} onClick={() => setAba('produzir')}>Produzir</Button>
        <Button variant={aba === 'historico' ? 'primary' : 'secondary'} onClick={() => setAba('historico')}>Histórico e perdas</Button></>}
    </nav>
    {erro && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{erro}
      {bloqueado && !salvar.isPending && <Button className="mt-2 block" onClick={() => envio.current && salvar.mutate(envio.current)}>Tentar novamente</Button>}
    </div>}
    {sucesso && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{sucesso}</p>}
    {aba === 'disponiveis' && <>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input aria-label="Buscar produto pronto" placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select aria-label="Local de armazenamento" value={localFiltro} onChange={(e) => setLocalFiltro(e.target.value)}>
          <option value="">Todos os locais</option>{[...new Set(lista.map((l) => l.local))].map((l) => <option key={l}>{l}</option>)}
        </Select>
      </div>
      {filtrados.length === 0 && <Card className="p-6 text-center text-sm text-slate-500">Nenhum lote disponível neste filtro. Cadastre um produto com o modo “Produzido antecipadamente” e registre sua produção.</Card>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtrados.map((l) => {
        const expirado = vencido(l.validade)
        const proximo = !expirado && +new Date(l.validade) - agora < 86400000
        return <Card key={l.id} className="min-w-0 space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words font-bold">{l.produtoNome}</h2>
            <span className={`rounded-full px-2 py-1 text-xs ${expirado ? 'bg-rose-100 text-rose-800' : proximo ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{expirado ? 'Vencido' : proximo ? 'Vence em até 24 h' : 'Disponível'}</span>
          </div>
          <p className="text-xs text-slate-500">{l.local} · Lote {l.id.slice(0, 8)} · {l.unidade}</p>
          <p className="text-2xl font-bold">{expirado ? 0 : l.saldo - l.reservado} <span className="text-sm font-normal">livres</span></p>
          <p className="text-sm">Saldo físico: {l.saldo} · Reservados: {l.reservado}</p>
          <p className="text-xs">Produzido: {dataHora(l.criadoEm)}<br />Validade: {dataHora(l.validade)}<br />Custo por {l.unidade}: {brl(l.custoUnitario)}</p>
          {operar && <div className="flex flex-wrap gap-2">
            <Button disabled={bloqueado} variant="secondary" onClick={() => { setLoteId(l.id); setAcao('perda'); setAjuste({...ajuste, quantidade:'1', observacao:''}) }}>Registrar perda / ajuste</Button>
            <Button disabled={bloqueado || expirado} variant="secondary" onClick={() => { setLoteId(l.id); setAcao('converter'); setAjuste({...ajuste, quantidade:'1', observacao:''}) }}>Converter em fatias/unidades</Button>
          </div>}
        </Card>
      })}</div>
      {lote && operar && <Card className="p-4 sm:p-6">
        <h2 className="mb-4 font-bold">{acao === 'perda' ? 'Perda / ajuste de saída' : 'Converter apresentação'} — {lote.produtoNome}</h2>
        <fieldset disabled={bloqueado} className="grid gap-4 sm:grid-cols-2">
          <Field label={`Quantidade de origem (${lote.unidade})`}><Input type="number" min="1" max={lote.saldo-lote.reservado} step="1" value={ajuste.quantidade} onChange={(e) => setAjuste({...ajuste, quantidade:e.target.value})} /></Field>
          {acao === 'perda' ? <Field label="Motivo"><Select value={ajuste.motivo} onChange={(e) => setAjuste({...ajuste, motivo:e.target.value})}>
            <option value="vencimento">Vencimento</option><option value="queima">Queima</option><option value="quebra">Quebra</option><option value="consumo_interno">Consumo interno</option><option value="ajuste">Ajuste de contagem (saída)</option>
          </Select></Field> : <>
            <Field label="Produto de destino"><Select value={ajuste.destino} onChange={(e) => setAjuste({...ajuste, destino:e.target.value})}><option value="">Selecione…</option>{prontos.filter((p) => p.id !== lote.produtoId).map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.unidadeVenda ?? 'un'})</option>)}</Select></Field>
            <Field label="Quantidade obtida"><Input type="number" min="1" step="1" value={ajuste.quantidadeDestino} onChange={(e) => setAjuste({...ajuste, quantidadeDestino:e.target.value})} /></Field>
            <p className="text-sm text-slate-500">Ex.: 1 bolo vira 12 fatias. A conversão preserva o custo total, o local e a validade; não consome ingredientes novamente.</p>
          </>}
          <Field label="Observação obrigatória"><Input maxLength={300} value={ajuste.observacao} onChange={(e) => setAjuste({...ajuste, observacao:e.target.value})} /></Field>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><Button loading={salvar.isPending} disabled={!Number.isInteger(Number(ajuste.quantidade)) || Number(ajuste.quantidade) <= 0 || ajuste.observacao.trim().length < 3 || (acao === 'converter' && (!ajuste.destino || !Number.isInteger(Number(ajuste.quantidadeDestino)) || Number(ajuste.quantidadeDestino) <= 0))} onClick={() => enviar(`/producao/lotes/${lote.id}/${acao === 'perda' ? 'perdas' : 'converter'}`, acao === 'perda'
            ? {quantidade:Number(ajuste.quantidade), motivo:ajuste.motivo, observacao:ajuste.observacao.trim()}
            : {produtoDestinoId:ajuste.destino, quantidadeOrigem:Number(ajuste.quantidade), quantidadeDestino:Number(ajuste.quantidadeDestino), observacao:ajuste.observacao.trim()})}>Confirmar lançamento</Button>
            <Button variant="secondary" onClick={() => setLoteId('')}>Fechar formulário</Button></div>
        </fieldset>
      </Card>}
    </>}
    {aba === 'produzir' && operar && <Card className="max-w-3xl p-4 sm:p-6">
      <h2 className="mb-2 font-bold">Registrar um lote produzido</h2>
      <p className="mb-4 text-sm text-slate-500">Informe as receitas utilizadas e a quantidade realmente aproveitada. Registrar produção sempre consome os ingredientes, mesmo com a baixa automática de pedidos desligada.</p>
      {prontos.length === 0 && <p className="mb-4 text-sm">Primeiro <Link className="text-brand-600 underline" to="/produtos/novo">cadastre um produto</Link> com modo de estoque “Produzido antecipadamente”.</p>}
      <fieldset disabled={bloqueado} className="grid gap-4 sm:grid-cols-2">
        <Field label="Produto"><Select value={form.produtoId} onChange={(e) => {const p=prontos.find((x)=>x.id===e.target.value); setForm({...form, produtoId:e.target.value, quantidade:String((p?.rendimentoReceita ?? 1) * receitas)})}}>
          <option value="">Selecione…</option>{prontos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </Select></Field>
        <Field label="Receitas utilizadas" hint="Ex.: 2 receitas inteiras ou 0,5 receita."><Input inputMode="decimal" value={form.receitas} onChange={(e) => setForm({...form, receitas:e.target.value})} /></Field>
        <Field label={`Quantidade realmente produzida (${produto?.unidadeVenda ?? 'un'})`} hint={`Previsto: ${Number.isFinite(receitas) ? receitas * (produto?.rendimentoReceita ?? 1) : '—'}. Informe o rendimento aproveitável.`}><Input type="number" min="1" step="1" value={form.quantidade} onChange={(e) => setForm({...form, quantidade:e.target.value})} /></Field>
        <Field label="Validade do lote"><Input type="datetime-local" value={form.validade} onChange={(e) => setForm({...form, validade:e.target.value})} /></Field>
        <Field label="Local de armazenamento"><Input maxLength={80} value={form.local} onChange={(e) => setForm({...form, local:e.target.value})} placeholder="Estufa, balcão, geladeira…" /></Field>
        <Field label="Observação"><Input maxLength={300} value={form.observacao} onChange={(e) => setForm({...form, observacao:e.target.value})} /></Field>
        {produto && <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800 sm:col-span-2">
          <p className="font-semibold">Ingredientes que serão consumidos</p>
          {(produto.ingredientes ?? []).map((i) => {const e=estoque.data?.find((x)=>x.id===i.itemId); return <p key={i.itemId}>{e?.nome ?? 'Item não encontrado'}: {Number.isFinite(receitas) ? (i.qtd * receitas).toLocaleString('pt-BR') : '—'} {e?.unidade}</p>})}
          {!(produto.ingredientes?.length) && <p>Cadastre a receita antes de produzir, ou use a conversão de um lote existente.</p>}
          <p className="mt-2">Custo estimado do lote: {Number.isFinite(custo) ? brl(custo) : '—'} · Por unidade: {quantidade > 0 && Number.isFinite(custo) ? brl(custo / quantidade) : '—'}</p>
          <p className="mt-1 text-xs text-slate-500">O custo é registrado com os valores do estoque no momento da produção. Custos não cadastrados entram como zero.</p>
        </div>}
        <Button className="sm:col-span-2" loading={salvar.isPending} disabled={!produto?.ingredientes?.length || !Number.isFinite(receitas) || receitas <= 0 || !Number.isInteger(quantidade) || quantidade <= 0 || !form.validade || !form.local.trim() || estoque.isLoading || estoque.isError} onClick={() => {
          const data=new Date(form.validade)
          if (!Number.isFinite(data.getTime()) || data.getTime() <= Date.now()) {setErro('Informe uma validade futura.'); return}
          enviar('/producao/lotes', {...form, receitas, quantidade, local:form.local.trim(), validade:data.toISOString()})
        }}>Registrar produção e baixar ingredientes</Button>
      </fieldset>
    </Card>}
    {aba === 'historico' && operar && <div className="space-y-3">
      <p className="text-sm text-slate-500">Últimos 100 movimentos. Reservas não são perdas nem vendas; a entrega confirma a saída física.</p>
      {historico.isLoading ? <LoadingScreen /> : historico.isError ? <ErrorState error={historico.error} /> : (historico.data ?? []).length === 0 ? <p>Nenhum movimento registrado.</p> : (historico.data ?? []).map((m) => <Card key={m.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:justify-between">
        <div><p className="font-semibold">{NOMES[m.tipo]} · {produtos.data?.find((p) => p.id === m.produtoId)?.nome ?? m.produtoId}</p>
          <p className="text-xs text-slate-500">{dataHora(m.criadoEm)} · Lote {m.loteId.slice(0,8)} · Responsável: {m.usuarioId}</p>
          {m.motivo && <p className="text-sm">Motivo: {m.motivo.replace(/_/g,' ')}</p>}{m.observacao && <p className="break-words text-sm">{m.observacao}</p>}
        </div><div className="text-sm"><strong>{m.quantidade} unidade(s)</strong>{m.custoTotal != null && <p>Custo: {brl(m.custoTotal)}</p>}</div>
      </Card>)}
    </div>}
  </div>
}
