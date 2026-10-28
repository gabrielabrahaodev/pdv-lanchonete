import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ClipboardList, MessageCircle, PackageCheck, XCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { brl, dataHora } from '../../lib/format'
import { numeroDecimal } from '../../lib/precificacao'
import { formatarPrecoReferencia, simularCompra, unidadeReferencia } from '../../lib/custosInsumos'
import { unidadesCompativeis, converterQuantidade } from '../../lib/unidades'
import { criarMensagemReposicao, urlWhatsApp } from '../../lib/reposicaoMensagem'
import { useAuth } from '../../context/AuthContext'
import type { Configuracoes, GrupoReposicao, PedidoReposicao } from '../../types'
import { Button, Card, ErrorState, Field, Input, LoadingScreen, Modal, Select } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'

type Pendente = {
  fornecedorId: string
  fornecedorNome: string
  mensagem: string
  itens: { itemId: string; quantidade: number }[]
}

function lerPendente(chave: string): Pendente | null {
  try {
    const salvo = sessionStorage.getItem(chave)
    if (!salvo) return null
    const dado = JSON.parse(salvo) as Pendente
    if (typeof dado.fornecedorId !== 'string' || !Array.isArray(dado.itens) || !dado.itens.length) return null
    return dado
  } catch { return null }
}

function converter(valor: string): number {
  return numeroDecimal(valor)
}

export default function ReposicaoPage() {
  const { me } = useAuth()
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState<'gerar' | 'gerados'>('gerar')
  const [quantidades, setQuantidades] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [pedidoReceber, setPedidoReceber] = useState<PedidoReposicao | null>(null)
  const chave = `nexocomanda:reposicao:retorno:${me?.restaurantId ?? ''}`
  const pendente = useRef<Pendente | null>(null)
  const saiu = useRef(false)

  const candidatos = useQuery({
    queryKey: ['reposicao-candidatos', me?.restaurantId],
    queryFn: () => api<GrupoReposicao[]>('/reposicao/candidatos'),
  })
  const pedidos = useQuery({
    queryKey: ['reposicao-pedidos', me?.restaurantId],
    queryFn: () => api<PedidoReposicao[]>('/reposicao/pedidos'),
  })
  const config = useQuery({
    queryKey: ['configuracoes'],
    queryFn: () => api<Configuracoes>('/configuracoes'),
  })

  function limparPendente() {
    pendente.current = null
    saiu.current = false
    setConfirmando(false)
    try { sessionStorage.removeItem(chave) } catch { /* armazenamento opcional */ }
  }

  // Ao retornar da aba do WhatsApp, perguntar se devemos REGISTRAR o pedido.
  // Abrir wa.me não é prova de envio e nunca gera pedido automaticamente.
  useEffect(() => {
    const salvo = lerPendente(chave)
    if (salvo) {
      pendente.current = salvo
      setConfirmando(true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && pendente.current) saiu.current = true
      if (document.visibilityState === 'visible' && saiu.current && pendente.current) {
        setConfirmando(true)
        saiu.current = false
      }
    }
    const onFocus = () => {
      if (saiu.current && pendente.current) {
        setConfirmando(true)
        saiu.current = false
      }
    }
    const onBlur = () => {
      if (pendente.current) saiu.current = true
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [chave])

  async function atualizar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['reposicao-candidatos', me?.restaurantId] }),
      qc.invalidateQueries({ queryKey: ['reposicao-pedidos', me?.restaurantId] }),
      qc.invalidateQueries({ queryKey: ['despesas'] }),
      qc.invalidateQueries({ queryKey: ['resumo-financeiro'] }),
      qc.invalidateQueries({ queryKey: ['movimentos'] }),
      qc.invalidateQueries({ queryKey: ['estoque'] }),
    ])
  }

  const criar = useMutation({
    mutationFn: (dados: Pendente) => api('/reposicao/pedidos', {
      method: 'POST',
      body: { fornecedorId: dados.fornecedorId, itens: dados.itens, mensagem: dados.mensagem },
    }),
    onSuccess: () => {
      limparPendente()
      setErro('')
      setFiltro('gerados')
      void atualizar()
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Falha ao registrar pedido'),
  })
  const cancelar = useMutation({
    mutationFn: (id: string) => api(`/reposicao/pedidos/${id}/cancelar`, { method: 'POST' }),
    onSuccess: () => void atualizar(),
    onError: (e) => setErro(e instanceof Error ? e.message : 'Não foi possível cancelar'),
  })

  function quantidade(grupo: GrupoReposicao, item: GrupoReposicao['itens'][number]) {
    const atual = quantidades[`${grupo.fornecedorId}:${item.itemId}`]
    return atual ?? String(Math.max(1, Math.round((item.minimo - item.saldo) * 1000) / 1000))
  }

  function abrirWhatsApp(grupo: GrupoReposicao) {
    setErro('')
    const endereco = config.data?.endereco?.trim()
    if (!endereco) { setErro('Cadastre o endereço de entrega nas Configurações antes de solicitar reposição.'); return }
    const itens = grupo.itens.map(i => ({
      itemId: i.itemId, nome: i.nome, unidade: i.unidade, quantidade: converter(quantidade(grupo, i)),
    }))
    if (itens.some(i => !Number.isFinite(i.quantidade) || i.quantidade <= 0 || i.quantidade > 1000000)) {
      setErro('Informe quantidades positivas e válidas para todos os insumos.'); return
    }
    const mensagem = criarMensagemReposicao(config.data?.nome ?? '', endereco, itens)
    const url = urlWhatsApp(grupo.telefone ?? '', mensagem)
    if (!url) {
      setErro('Telefone do fornecedor inválido. Cadastre um número brasileiro com DDD no Financeiro.')
      return
    }
    const registro = {
      fornecedorId: grupo.fornecedorId, fornecedorNome: grupo.fornecedorNome,
      mensagem, itens: itens.map(({ itemId, quantidade }) => ({ itemId, quantidade })),
    }
    // Registrar antes da abertura para não perder o blur/visibilitychange do
    // aplicativo WhatsApp (especialmente no Android e iOS).
    pendente.current = registro
    saiu.current = false
    try { sessionStorage.setItem(chave, JSON.stringify(registro)) } catch { /* resta na memória */ }
    const janela = window.open(url, '_blank')
    if (!janela) {
      limparPendente()
      setErro('O navegador bloqueou o WhatsApp. Permita pop-ups e tente novamente.')
      return
    }
    janela.opener = null
  }

  const contagemGerados = (pedidos.data ?? []).filter(p => p.status === 'gerado').length

  return (
    <div className="space-y-5 p-3 sm:p-6">
      <PageHeader title="Reposição de insumos" subtitle="Solicitações a fornecedores e recebimento de mercadorias" />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar reposição">
        <button type="button" role="tab" aria-selected={filtro === 'gerar'} onClick={() => setFiltro('gerar')}
          className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${filtro === 'gerar' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
          Pedidos a gerar {candidatos.data?.length ? `(${candidatos.data.length} fornecedores)` : ''}
        </button>
        <button type="button" role="tab" aria-selected={filtro === 'gerados'} onClick={() => setFiltro('gerados')}
          className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${filtro === 'gerados' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
          Pedidos gerados {contagemGerados ? `(${contagemGerados} aguardando)` : ''}
        </button>
      </div>
      {erro && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{erro}</p>}

      {filtro === 'gerar' && (
        <div className="space-y-4">
          {!config.isLoading && !config.data?.endereco?.trim() && (
            <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-400 p-4">
              <p className="text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="mr-2 inline h-4 w-4" />Informe o endereço de entrega do restaurante antes de enviar solicitações.</p>
              <Link to="/configuracoes" className="action-button">Cadastrar endereço</Link>
            </Card>
          )}
          {(candidatos.isLoading || config.isLoading) && <LoadingScreen />}
          {candidatos.isError && <ErrorState error={candidatos.error} />}
          {config.isError && <ErrorState error={config.error} />}
          {candidatos.isSuccess && candidatos.data.length === 0 && (
            <Card className="p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
              <p className="font-bold">Nenhuma solicitação a gerar</p>
              <p className="mt-1 text-sm text-slate-500">Verifique alertas, cadastre o fornecedor habitual nos insumos ou consulte pedidos já gerados.</p>
              <Link to="/estoque" className="action-button mt-4">Ver estoque</Link>
            </Card>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {(candidatos.data ?? []).map(grupo => (
              <Card key={grupo.fornecedorId} className="min-w-0 space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{grupo.fornecedorNome}</h2>
                    <p className="text-xs text-slate-500">{grupo.itens.length} insumo(s) com saldo baixo</p>
                    <p className="mt-1 text-xs text-slate-500">{grupo.telefone || 'Fornecedor sem telefone cadastrado'}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Reposição necessária</span>
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {grupo.itens.map(item => (
                    <li key={item.itemId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold">{item.nome}</p>
                        <p className="text-xs text-rose-600 dark:text-rose-300">Em estoque: {item.saldo} {item.unidade} · Mínimo: {item.minimo} {item.unidade}</p>
                      </div>
                      <label className="text-xs font-medium text-slate-500">
                        Pedir ({item.unidade})
                        <Input type="text" inputMode="decimal" className="mt-1 w-28"
                          value={quantidade(grupo, item)}
                          onChange={(e) => setQuantidades(prev => ({ ...prev, [`${grupo.fornecedorId}:${item.itemId}`]: e.target.value }))}
                          aria-label={`Quantidade de ${item.nome} a solicitar`} />
                      </label>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" disabled={!config.data?.endereco?.trim() || criar.isPending}
                  onClick={() => abrirWhatsApp(grupo)}>
                  <MessageCircle className="h-5 w-5" /> Enviar pedido por WhatsApp
                </Button>
                <p className="text-xs leading-5 text-slate-500">O WhatsApp abrirá com uma mensagem pronta. Ao voltar, confirme se deseja registrar o pedido no sistema; o envio não é verificado automaticamente.</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {filtro === 'gerados' && (
        <div className="space-y-4">
          {pedidos.isLoading && <LoadingScreen />}
          {pedidos.isError && <ErrorState error={pedidos.error} />}
          {pedidos.isSuccess && pedidos.data.length === 0 && (
            <Card className="p-8 text-center text-sm text-slate-500">Nenhum pedido de reposição registrado.</Card>
          )}
          {(pedidos.data ?? []).map(pedido => (
            <Card key={pedido.id} className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{pedido.fornecedorNome}</h2>
                  <p className="text-xs text-slate-500">{dataHora(pedido.criadoEm)} · {pedido.itens.length} insumo(s)</p>
                  <p className="mt-1 break-words text-xs text-slate-500">Entrega: {pedido.enderecoEntrega}</p>
                  {pedido.status === 'recebido' && (
                    <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Recebido em {pedido.dataRecebimentoLocal ?? (pedido.dataRecebimento ? pedido.dataRecebimento.slice(0, 10) : 'data não informada')}
                      {pedido.valorTotalRecebido != null && ` · Despesa gerada: ${brl(pedido.valorTotalRecebido)}`}
                    </p>
                  )}
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${pedido.status === 'gerado' ? 'bg-amber-100 text-amber-800' : pedido.status === 'recebido' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                  {pedido.status === 'gerado' ? 'Aguardando recebimento' : pedido.status === 'recebido' ? 'Recebido' : 'Cancelado'}
                </span>
              </div>
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {pedido.itens.map(item => (
                  <li key={item.itemId} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                    <span className="font-semibold">{item.nome}</span>
                    <span className="ml-2 text-slate-500">{item.quantidade} {item.unidade}</span>
                    {pedido.recebimento?.find(i => i.itemId === item.itemId) && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">Recebido: {pedido.recebimento.find(i => i.itemId === item.itemId)!.quantidade} · {brl(pedido.recebimento.find(i => i.itemId === item.itemId)!.custoUnitario)} / {item.unidade}</p>
                    )}
                  </li>
                ))}
              </ul>
              {pedido.status === 'recebido' && pedido.despesaId && (
                <Link to="/financeiro" className="action-button text-sm">Ver débito no Financeiro</Link>
              )}
              {pedido.status === 'gerado' && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setPedidoReceber(pedido)}><PackageCheck className="h-4 w-4" /> Reabastecer estoque</Button>
                  <Button variant="secondary" disabled={cancelar.isPending} onClick={() => window.confirm('Cancelar o pedido de reposição? O estoque não será alterado.') && cancelar.mutate(pedido.id)}>
                    <XCircle className="h-4 w-4" /> Cancelar
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={confirmando} title="Registrar pedido de reposição?" onClose={() => { limparPendente(); setErro('') }}>
        <div className="space-y-4">
          <p className="text-sm leading-6">Você retornou do WhatsApp. Deseja criar o pedido de reposição para <strong>{pendente.current?.fornecedorNome}</strong>?</p>
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">O sistema não consegue confirmar se a mensagem foi realmente enviada. Registre apenas se desejar acompanhar essa solicitação.</p>
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">{pendente.current?.mensagem}</pre>
          {erro && <p role="alert" className="text-sm text-rose-600">{erro}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => { limparPendente(); setErro('') }}>Não registrar</Button>
            <Button loading={criar.isPending} disabled={!pendente.current} onClick={() => pendente.current && criar.mutate(pendente.current)}>
              <ClipboardList className="h-4 w-4" /> Sim, criar pedido
            </Button>
          </div>
        </div>
      </Modal>

      {pedidoReceber && (
        <ReceberPedido pedido={pedidoReceber} onClose={() => setPedidoReceber(null)}
          onSuccess={() => { setPedidoReceber(null); void atualizar() }} />
      )}
    </div>
  )
}

function dataHojeLocal(): string {
  const d = new Date()
  // Data local do navegador, não UTC, para evitar adiantar o dia após 21h.
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

type LinhaCompra = { quantidadeCompra: string; unidadeCompra: string; valorTotalCompra: string }

function dadosIniciais(item: PedidoReposicao['itens'][number]): LinhaCompra {
  const conversao = {
    unidade: item.unidade,
    unidadeCompra: item.unidadeCompra ?? item.unidade,
    fatorCompra: item.fatorCompra,
  }
  const unidade = unidadeReferencia(conversao)
  const fator = converterQuantidade(1, unidade, item.unidade, conversao.unidadeCompra ?? undefined, conversao.fatorCompra ?? undefined)
  const qtd = fator && fator > 0 ? item.quantidade / fator : item.quantidade
  const custoPrevisto = item.quantidade * (item.custoUnitarioPrevisto ?? 0)
  return {
    unidadeCompra: unidade,
    quantidadeCompra: String(Number(qtd.toFixed(3))),
    valorTotalCompra: custoPrevisto > 0 ? custoPrevisto.toFixed(2) : '',
  }
}

function ReceberPedido({ pedido, onClose, onSuccess }: {
  pedido: PedidoReposicao
  onClose: () => void
  onSuccess: () => void
}) {
  const [linhas, setLinhas] = useState<Record<string, LinhaCompra>>(
    Object.fromEntries(pedido.itens.map(item => [item.itemId, dadosIniciais(item)])),
  )
  const [erro, setErro] = useState('')
  const [dataRecebimento, setDataRecebimento] = useState(dataHojeLocal)
  const entrada = pedido.itens.map(item => {
    const linha = linhas[item.itemId]
    const qtd = converter(linha?.quantidadeCompra ?? '')
    const valor = converter(linha?.valorTotalCompra ?? '')
    const unidadeCompra = linha?.unidadeCompra ?? item.unidade
    const referencia = {
      unidade: item.unidade,
      unidadeCompra: item.unidadeCompra ?? item.unidade,
      fatorCompra: item.fatorCompra,
    }
    return {
      itemId: item.itemId,
      quantidadeCompra: qtd,
      unidadeCompra,
      valorTotalCompra: valor,
      resumo: simularCompra(referencia, qtd, unidadeCompra, valor),
      referencia,
    }
  })
  const valorTotal = entrada.reduce((acc, item) =>
    acc + (Number.isFinite(item.valorTotalCompra) ? item.valorTotalCompra : 0), 0)
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(dataRecebimento)
    && dataRecebimento <= dataHojeLocal()
    && valorTotal > 0
    && entrada.every(i =>
      i.resumo !== null &&
      Number.isFinite(i.quantidadeCompra) && i.quantidadeCompra > 0 && i.quantidadeCompra <= 1000000 &&
      Number.isFinite(i.valorTotalCompra) && i.valorTotalCompra > 0 && i.valorTotalCompra <= 100000000 &&
      Math.abs(i.valorTotalCompra * 100 - Math.round(i.valorTotalCompra * 100)) < 0.000001 &&
      Math.abs(i.resumo.quantidadeControle * 1000 - Math.round(i.resumo.quantidadeControle * 1000)) < 0.000001,
    )

  const receber = useMutation({
    mutationFn: () => api(`/reposicao/pedidos/${pedido.id}/receber`, {
      method: 'POST',
      body: {
        dataRecebimento,
        itens: entrada.map(({ itemId, quantidadeCompra, unidadeCompra, valorTotalCompra }) => ({
          itemId, quantidadeCompra, unidadeCompra, valorTotalCompra,
        })),
      },
    }),
    onSuccess,
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao receber insumos'),
  })

  function alterar(itemId: string, alteracao: Partial<LinhaCompra>) {
    setLinhas(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...alteracao } }))
  }

  return (
    <Modal open title={`Reabastecer: ${pedido.fornecedorNome}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Informe a quantidade comprada e o valor TOTAL de cada produto. Não é
          necessário calcular o custo por grama: ele será atualizado automaticamente.
        </p>
        <Field label="Data efetiva do recebimento" hint="Pode ser retroativa; determina a data da entrada e da despesa no Financeiro.">
          <Input type="date" value={dataRecebimento} max={dataHojeLocal()}
            onChange={(e) => setDataRecebimento(e.target.value)} />
        </Field>
        {pedido.itens.map(item => {
          const linha = linhas[item.itemId]
          const prev = entrada.find(i => i.itemId === item.itemId)!
          return (
            <div key={item.itemId} className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="font-semibold">{item.nome} <span className="text-xs font-normal text-slate-500">(estoque: {item.unidade})</span></p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Qtd. comprada">
                  <Input inputMode="decimal" value={linha.quantidadeCompra}
                    onChange={(e) => alterar(item.itemId, { quantidadeCompra: e.target.value })} />
                </Field>
                <Field label="Unidade de compra">
                  <Select value={linha.unidadeCompra}
                    onChange={(e) => {
                      const novo = e.target.value
                      const antes = prev.resumo?.quantidadeControle ??
                        converterQuantidade(Number(linha.quantidadeCompra), linha.unidadeCompra, item.unidade, prev.referencia.unidadeCompra ?? undefined, prev.referencia.fatorCompra ?? undefined)
                      const porUnidade = converterQuantidade(1, novo, item.unidade, prev.referencia.unidadeCompra ?? undefined, prev.referencia.fatorCompra ?? undefined)
                      alterar(item.itemId, {
                        unidadeCompra: novo,
                        quantidadeCompra: antes != null && porUnidade ? String(Number((antes / porUnidade).toFixed(3))) : linha.quantidadeCompra,
                      })
                    }}>
                    {unidadesCompativeis(item.unidade, item.unidadeCompra, item.fatorCompra ?? undefined).map(u =>
                      <option key={u} value={u}>{u}</option>
                    )}
                  </Select>
                </Field>
              </div>
              <Field label="Valor total da linha (R$)" hint="Ex.: 2 kg por R$ 16,00. Valor da compra, não preço por grama.">
                <Input inputMode="decimal" placeholder="Ex.: 16,00" value={linha.valorTotalCompra}
                  onChange={(e) => alterar(item.itemId, { valorTotalCompra: e.target.value })} />
              </Field>
              <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {prev.resumo
                  ? <>Entrará no estoque: <strong>{prev.resumo.quantidadeControle.toLocaleString('pt-BR')} {item.unidade}</strong>
                    {' · '}Custo de referência: <strong>{formatarPrecoReferencia({ ...prev.referencia, custoMedio: prev.resumo.custoPorControle })}</strong></>
                  : 'Informe uma quantidade, unidade e valor total válidos para visualizar o custo.'}
              </div>
            </div>
          )
        })}
        <p className="text-sm font-bold">Total da compra: {brl(valorTotal)}</p>
        <p className="text-xs text-slate-500">Ao confirmar, o Financeiro registrará uma despesa de insumos pendente de pagamento, na data escolhida. O custo médio do estoque será recalculado pelas quantidades convertidas, sem arredondar o preço por grama antes da operação.</p>
        {erro && <p role="alert" className="text-sm text-rose-600">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={receber.isPending} onClick={onClose}>Voltar</Button>
          <Button variant="success" loading={receber.isPending} disabled={!valido}
            onClick={() => window.confirm(`Confirmar entrada em ${dataRecebimento} e despesa pendente de ${brl(valorTotal)}?`) && receber.mutate()}>
            <PackageCheck className="h-4 w-4" /> Confirmar recebimento
          </Button>
        </div>
      </div>
    </Modal>
  )
}
