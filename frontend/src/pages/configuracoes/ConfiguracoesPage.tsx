import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { imprimir } from '../../lib/impressora'
import { useTheme, type Tema } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import type { AppUser, Configuracoes as ConfigType } from '../../types'
import { Badge, Button, Card, ErrorState, Field, Input, LoadingScreen, Modal, Select } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'

export default function ConfiguracoesPage() {
  const config = useQuery({ queryKey: ['configuracoes'], queryFn: () => api<ConfigType>('/configuracoes') })
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: () => api<AppUser[]>('/usuarios') })

  if (config.isLoading) return <LoadingScreen />
  if (config.isError) return <ErrorState error={config.error} />

  return (
    <div className="p-6">
      <PageHeader title="Configurações" subtitle="Dados do restaurante, impressão, aparência e usuários" />

      <div className="grid gap-6 lg:grid-cols-2">
        <AparenciaCard />
        <ConfigForm initial={config.data!} />
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 className="font-bold text-slate-700">Usuários</h3>
            {(usuarios.data ?? []).length > 0 && (
              <span className="text-xs text-slate-500">{usuarios.data!.length} usuário(s)</span>
            )}
          </div>
          {usuarios.isLoading ? (
            <LoadingScreen />
          ) : usuarios.isError ? (
            <div className="p-5"><ErrorState error={usuarios.error} /></div>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {(usuarios.data ?? []).map((u) => (
                  <UsuarioRow key={u.id} usuario={u} />
                ))}
              </ul>
              <div className="border-t border-slate-100 p-4">
                <NovoUsuarioButton />
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ aparência
const TEMAS: { valor: Tema; label: string; desc: string }[] = [
  { valor: 'claro', label: '☀️ Claro', desc: 'Fundo branco, ideal para ambientes iluminados' },
  { valor: 'escuro', label: '🌙 Escuro', desc: 'Fundo escuro, confortável para uso noturno' },
]

/** Preferência POR USUÁRIO: cada login tem seu tema salvo no Firestore (doc do usuário). */
function AparenciaCard() {
  const { tema, setTema } = useTheme()

  return (
    <Card className="space-y-4 p-6">
      <h3 className="font-bold text-slate-700 dark:text-slate-200">Aparência</h3>
      <p className="-mt-2 text-xs text-slate-500">
        Salvo por usuário — cada pessoa do restaurante pode ter o seu tema.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMAS.map((t) => (
          <button
            key={t.valor}
            onClick={() => setTema(t.valor)}
            className={`rounded-xl border p-4 text-left transition ${
              tema === t.valor
                ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-400 dark:bg-brand-500/10'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
            }`}
          >
            <span className="block text-sm font-semibold text-slate-700 dark:text-slate-100">{t.label}</span>
            <span className="mt-1 block text-xs text-slate-500">{t.desc}</span>
            {tema === t.valor && (
              <span className="mt-2 inline-block text-xs font-bold text-brand-600 dark:text-brand-300">✓ em uso</span>
            )}
          </button>
        ))}
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ config
function ConfigForm({ initial }: { initial: ConfigType }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    ...initial,
    baixaEstoqueAutomatica: initial.baixaEstoqueAutomatica !== false,
    cardapioDigitalAtivo: initial.cardapioDigitalAtivo !== false,
  })
  useEffect(
    () =>
      setForm({
        ...initial,
        baixaEstoqueAutomatica: initial.baixaEstoqueAutomatica !== false,
        cardapioDigitalAtivo: initial.cardapioDigitalAtivo !== false,
      }),
    [initial],
  )
  const [testeImpressora, setTesteImpressora] = useState<string | null>(null)

  const salvar = useMutation({
    mutationFn: () => api('/configuracoes', { method: 'PUT', body: form }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configuracoes'] }),
  })

  async function testarImpressora() {
    try {
      const via = await imprimir('Teste de impressora', [
        { texto: '=== TESTE DE IMPRESSORA ===', alinhamento: 'centro', negrito: true, grande: true },
        { texto: form.nome || 'PDV Lanchonete', alinhamento: 'centro' },
        { texto: new Date().toLocaleString('pt-BR'), alinhamento: 'centro' },
        { texto: 'Se voce leu isto, a impressora esta pronta.', negrito: true },
      ])
      if (via !== 'cancelado') setTesteImpressora(via === 'bluetooth' ? '✓ enviado à impressora bluetooth' : '✓ aberto para impressão do navegador')
    } catch (e) {
      setTesteImpressora(e instanceof Error ? e.message : 'Falha na impressão')
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <h3 className="font-bold text-slate-700 dark:text-slate-200">Restaurante & impressora</h3>
      <Field label="Nome do restaurante">
        <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Moeda"><Input value={form.moeda} disabled /></Field>
        <Field label="Timezone"><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></Field>
        <Field label="Impressora (tipo)">
          <Select value={form.impressoraTipo} onChange={(e) => setForm({ ...form, impressoraTipo: e.target.value })}>
            {['bluetooth', 'usb', 'rede', 'nenhuma'].map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Endereço / MAC">
          <Input value={form.impressoraEndereco} onChange={(e) => setForm({ ...form, impressoraEndereco: e.target.value })} />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="secondary" className="!py-1.5 !text-xs" onClick={() => void testarImpressora()}>
          🖨 Testar impressora
        </Button>
        {testeImpressora && <span className="text-xs font-semibold text-slate-500">{testeImpressora}</span>}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600">
        <input
          type="checkbox"
          checked={form.cardapioDigitalAtivo}
          onChange={(e) => setForm({ ...form, cardapioDigitalAtivo: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Cardápio digital (QR na mesa)
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Cliente escaneia o QR e vê o cardápio — pedidos só com o atendente.
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600">
        <input
          type="checkbox"
          checked={form.baixaEstoqueAutomatica}
          onChange={(e) => setForm({ ...form, baixaEstoqueAutomatica: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Descontar estoque ao iniciar preparo
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Quando ligado, os ingredientes da receita de cada produto são baixados automaticamente
            do estoque no início do preparo. Admin/gerente podem alterar.
          </span>
        </span>
      </label>

      <Button loading={salvar.isPending} onClick={() => salvar.mutate()} className="w-full">
        Salvar configurações
      </Button>
      {salvar.isSuccess && !salvar.isPending && (
        <p className="text-center text-xs font-semibold text-emerald-600">✓ salvo</p>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ usuários
const PAPEIS = ['gerente', 'caixa', 'garcom', 'cozinha'] as const

function UsuarioRow({ usuario }: { usuario: AppUser }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [papel, setPapel] = useState(usuario.papel)

  const atualizar = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/usuarios/${usuario.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      setEditando(false)
    },
  })

  const desativar = useMutation({
    mutationFn: () => api(`/usuarios/${usuario.id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })

  return (
    <li className="flex items-center justify-between px-5 py-3">
      {editando ? (
        <div className="flex flex-1 items-center gap-2">
          <Select value={papel} onChange={(e) => setPapel(e.target.value)} className="!py-1.5">
            {[...PAPEIS].map((p) => <option key={p}>{p}</option>)}
            <option>admin</option>
          </Select>
          <Button variant="success" className="!px-3 !py-1.5 !text-xs" loading={atualizar.isPending} onClick={() => atualizar.mutate({ papel })}>
            OK
          </Button>
          <Button variant="ghost" className="!px-2 !py-1.5 !text-xs" onClick={() => setEditando(false)}>
            ✕
          </Button>
        </div>
      ) : (
        <>
          <div>
            <p className="text-sm font-semibold text-slate-700">{usuario.nome}</p>
            <p className="text-xs text-slate-500">{usuario.email ?? usuario.id}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge value={usuario.papel} />
            {usuario.papel !== 'admin' && (
              <>
                <button onClick={() => setEditando(true)} className="text-xs font-semibold text-brand-600 hover:underline">
                  Papel
                </button>
                <button
                  onClick={() => window.confirm(`Desativar ${usuario.nome}?`) && desativar.mutate()}
                  className="text-xs font-semibold text-rose-400 hover:text-rose-600"
                >
                  Desativar
                </button>
              </>
            )}
          </div>
        </>
      )}
    </li>
  )
}

function NovoUsuarioButton() {
  const qc = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState({ nome: '', email: '', senha: '', papel: 'caixa' })
  const [erro, setErro] = useState<string | null>(null)

  const criar = useMutation({
    mutationFn: () => api('/usuarios', { method: 'POST', body: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      setAberto(false)
      setForm({ nome: '', email: '', senha: '', papel: 'caixa' })
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao criar usuário'),
  })

  return (
    <>
      <Button variant="secondary" className="w-full" onClick={() => setAberto(true)}>
        + Adicionar usuário
      </Button>

      <Modal title="Adicionar usuário" open={aberto} onClose={() => setAberto(false)}>
        <div className="space-y-3">
          <Field label="Nome"><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
          <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Senha (mín. 6 caracteres)">
            <Input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
          </Field>
          <Field label="Papel">
            <Select value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}>
              {PAPEIS.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
          <Button
            className="w-full"
            loading={criar.isPending}
            disabled={!form.nome.trim() || !form.email.trim() || form.senha.length < 6}
            onClick={() => criar.mutate()}
          >
            Criar usuário
          </Button>
        </div>
      </Modal>
    </>
  )
}
