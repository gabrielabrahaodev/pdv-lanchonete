import {useState} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {api} from '../../lib/api'
import {useAuth} from '../../context/AuthContext'
import type {Fornecedor} from '../../types'
import {Button,Card,ErrorState,Field,Input,LoadingScreen,Modal,Select} from '../../components/ui'
import {PageHeader} from '../../components/layout/AppLayout'
// ------------------------------------------------------------------ fornecedores
export default function FornecedoresPage() {
  const qc = useQueryClient()
  const { me } = useAuth()
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('ativos')
  const [detalhe, setDetalhe] = useState<Fornecedor | null>(null)
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState({ nome: '', nomeFantasia: '', documento: '', telefone: '', whatsapp: '', email: '', endereco: '', observacoes: '', condicaoPagamento: '', prazoEntregaDias: '' })
  const [erro, setErro] = useState<string | null>(null)

  const fornecedores = useQuery({ queryKey: ['fornecedores', me?.restaurantId, me?.papel], queryFn: () => api<Fornecedor[]>('/fornecedores'), staleTime: 120000, gcTime: 600000 })

  const salvar = useMutation({
    mutationFn: () => {
      const body = {
        nome: form.nome.trim(),
        nomeFantasia: form.nomeFantasia, whatsapp: form.whatsapp, endereco: form.endereco, condicaoPagamento: form.condicaoPagamento, prazoEntregaDias: form.prazoEntregaDias === '' ? null : Number(form.prazoEntregaDias),
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
      qc.invalidateQueries({ queryKey: ['fornecedores', me?.restaurantId, me?.papel] })
      setAberto(false)
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao salvar fornecedor'),
  })

  const ativar = useMutation({mutationFn: (f: Fornecedor) => api(`/fornecedores/${f.id}`, {method:'PATCH', body:{ativo:f.ativo === false}}), onSuccess: () => qc.invalidateQueries({queryKey:['fornecedores']}), onError:(e) => setErro(e.message)})
  const excluir = useMutation({
    mutationFn: (id: string) => api(`/fornecedores/${id}`, { method: 'DELETE' }),
    onError: (e) => setErro(e.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fornecedores', me?.restaurantId, me?.papel] }),
  })

  const acoes = (f: Fornecedor) => <div className="flex flex-wrap gap-2">              <button
                onClick={() => {
                  setEditandoId(f.id)
                  setForm({
                    nome: f.nome,
                    nomeFantasia:f.nomeFantasia ?? '', whatsapp:f.whatsapp ?? '', endereco:f.endereco ?? '', condicaoPagamento:f.condicaoPagamento ?? '', prazoEntregaDias:String(f.prazoEntregaDias ?? ''),
                    documento: f.documento ?? '',
                    telefone: f.telefone ?? '',
                    email: f.email ?? '',
                    observacoes: f.observacoes ?? '',
                  })
                  setErro(null)
                  setAberto(true)
                }}
                className="text-xs font-semibold text-brand-600 action-button"
              >
                Editar
              </button>
              <Button variant="secondary" onClick={() => setDetalhe(f)}>Detalhes</Button>
              <Button variant="secondary" loading={ativar.isPending} onClick={() => ativar.mutate(f)}>{f.ativo === false ? 'Ativar' : 'Desativar'}</Button>
              <button
                onClick={() => window.confirm(`Excluir fornecedor "${f.nome}"?`) && excluir.mutate(f.id)}
                className="text-xs font-semibold text-rose-400 action-button hover:text-rose-600"
              >
                Excluir
              </button>
</div>
  const lista = (fornecedores.data ?? []).filter(f => (situacao === 'todos' || (situacao === 'ativos' ? f.ativo !== false : f.ativo === false)) && [f.nome, f.nomeFantasia, f.documento, f.telefone, f.whatsapp, f.email].join(' ').toLowerCase().includes(busca.toLowerCase()))
  return (<div className="pdv-page p-3 sm:p-5 lg:p-6 text-slate-800 dark:text-slate-100"><PageHeader title="Fornecedores" subtitle="Cadastros e contatos do restaurante" />
    <div className="mb-3 flex flex-wrap gap-2"><Input aria-label="Buscar fornecedor" placeholder="Nome, documento ou contato" value={busca} onChange={e=>setBusca(e.target.value)} className="sm:!w-80"/><Select aria-label="Situação" value={situacao} onChange={e=>setSituacao(e.target.value)} className="sm:!w-48"><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></Select></div>
    {erro && <p role="alert" className="mb-3 text-rose-600">{erro}</p>}
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-slate-800">
        <h3 className="font-bold text-slate-700 dark:text-slate-200">Fornecedores</h3>
        <Button
          variant="secondary"
          className="!px-3 !py-1.5 !text-xs"
          onClick={() => {
            setEditandoId(null)
            setForm({ nome: '', nomeFantasia: '', documento: '', telefone: '', whatsapp: '', email: '', endereco: '', observacoes: '', condicaoPagamento: '', prazoEntregaDias: '' })
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
      ) : lista.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum fornecedor cadastrado.</p>
      ) : (
        <ul className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {lista.map((f) => (
            <li key={f.id} className="flex min-w-0 flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{f.nome}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {[f.documento, f.telefone].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {acoes(f)}
            </li>
          ))}
        </ul>
      )}

      <div className="hidden overflow-x-auto lg:block"><table className="pdv-table w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400"><tr>{['Fornecedor','Documento / contato','Situação','Ações'].map(t=><th key={t} className="p-3" scope="col">{t}</th>)}</tr></thead><tbody>{lista.map(f=><tr key={f.id} className="border-t border-slate-200 dark:border-slate-700"><td className="p-3 font-semibold">{f.nome}<p className="text-xs font-normal text-slate-500 dark:text-slate-400">{f.nomeFantasia}</p></td><td className="p-3">{[f.documento, f.whatsapp || f.telefone, f.email].filter(Boolean).join(' · ')}</td><td className="p-3">{f.ativo===false?'Inativo':'Ativo'}</td><td className="p-2">{acoes(f)}</td></tr>)}</tbody></table></div>
      <Modal title={editandoId ? 'Editar fornecedor' : 'Novo fornecedor'} open={aberto} onClose={() => setAberto(false)}>
        <div className="space-y-3">
          <Field label="Nome"><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
            <Field label="CPF/CNPJ"><Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></Field>
            <Field label="Telefone"><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></Field>
          </div>
          <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Nome fantasia"><Input value={form.nomeFantasia} onChange={e=>setForm({...form,nomeFantasia:e.target.value})}/></Field>
          <Field label="WhatsApp"><Input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})}/></Field>
          <Field label="Endereço"><Input value={form.endereco} onChange={e=>setForm({...form,endereco:e.target.value})}/></Field>
          <Field label="Condição de pagamento"><Input value={form.condicaoPagamento} onChange={e=>setForm({...form,condicaoPagamento:e.target.value})}/></Field>
          <Field label="Prazo de entrega (dias)"><Input type="number" min="0" max="365" value={form.prazoEntregaDias} onChange={e=>setForm({...form,prazoEntregaDias:e.target.value})}/></Field>
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
    <Modal title={detalhe?.nome ?? 'Fornecedor'} open={!!detalhe} onClose={()=>setDetalhe(null)}>{detalhe && <dl className="space-y-3 break-words">{Object.entries({Fantasia:detalhe.nomeFantasia,Documento:detalhe.documento,Telefone:detalhe.telefone,WhatsApp:detalhe.whatsapp,Email:detalhe.email,Endereço:detalhe.endereco,Pagamento:detalhe.condicaoPagamento,'Entrega (dias)':detalhe.prazoEntregaDias,Observações:detalhe.observacoes}).map(([k,v])=><div key={k}><dt className="text-xs text-slate-500 dark:text-slate-400">{k}</dt><dd>{v ?? 'Não informado'}</dd></div>)}</dl>}</Modal>
    </div>
  )
}
