import { VersaoAppCard } from '../../components/AtualizacaoPwa'
import { AjudaContextual } from '../../wiki/componentes/AjudaContextual'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { recuperarSenha, erroConta } from '../../lib/conta'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { imprimir } from '../../lib/impressora'
import { useTheme, type Tema } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import type { AppUser, Configuracoes as ConfigType } from '../../types'
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  LoadingScreen,
  Modal,
  Select,
} from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'

export default function ConfiguracoesPage() {
  const { me } = useAuth()
  const gestao = ['admin', 'gerente'].includes(me?.papel ?? '')
  const config = useQuery({
    queryKey: ['configuracoes'],
    queryFn: () => api<ConfigType>('/configuracoes'),
  })
  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api<AppUser[]>('/usuarios'),
    enabled: gestao,
  })

  if (config.isLoading) return <LoadingScreen />
  if (config.isError) return <ErrorState error={config.error} />

  return (
    <div className="p-3 sm:p-6">
      <PageHeader
        title="Configurações"
        subtitle="Dados do restaurante, impressão, aparência e usuários"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <AparenciaCard />
        <VersaoAppCard />
        <Card className="space-y-3 p-5">
          <h2 className="font-bold">Seu login e perfil</h2>
          <Link
            to="/minha-conta"
            className="inline-flex min-h-11 items-center font-semibold text-brand-600"
          >
            Abrir Minha conta
          </Link>
          <p className="text-sm">
            Altere seu nome, senha e e-mail com verificação de segurança.
          </p>
        </Card>
        {gestao && (
          <>
            <ConfigForm initial={config.data!} />
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div><h3 className="font-bold text-slate-700 dark:text-slate-200">Usuários</h3><AjudaContextual artigo="usuarios" rotulo="Como gerenciar usuários?" /></div>
                {(usuarios.data ?? []).length > 0 && (
                  <span className="text-xs text-slate-500">
                    {usuarios.data!.length} usuário(s)
                  </span>
                )}
              </div>
              {usuarios.isLoading ? (
                <LoadingScreen />
              ) : usuarios.isError ? (
                <div className="p-5">
                  <ErrorState error={usuarios.error} />
                </div>
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
          </>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ aparência
const TEMAS: { valor: Tema; label: string; desc: string }[] = [
  {
    valor: 'claro',
    label: '☀️ Claro',
    desc: 'Fundo branco, ideal para ambientes iluminados',
  },
  {
    valor: 'escuro',
    label: '🌙 Escuro',
    desc: 'Fundo escuro, confortável para uso noturno',
  },
]

/** Preferência POR USUÁRIO: cada login tem seu tema salvo no Firestore (doc do usuário). */
function AparenciaCard() {
  const { tema, setTema } = useTheme()

  return (
    <Card className="space-y-4 p-6">
      <h3 className="font-bold text-slate-700 dark:text-slate-200">
        Aparência
      </h3>
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
            <span className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
              {t.label}
            </span>
            <span className="mt-1 block text-xs text-slate-500">{t.desc}</span>
            {tema === t.valor && (
              <span className="mt-2 inline-block text-xs font-bold text-brand-600 dark:text-brand-300">
                ✓ em uso
              </span>
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
    onError: (e) =>
      setTesteImpressora(
        e instanceof Error ? e.message : 'Não foi possível salvar',
      ),
  })

  async function testarImpressora() {
    try {
      const via = await imprimir('Teste de impressora', [
        {
          texto: '=== TESTE DE IMPRESSORA ===',
          alinhamento: 'centro',
          negrito: true,
          grande: true,
        },
        { texto: form.nome || 'PDV Lanchonete', alinhamento: 'centro' },
        { texto: new Date().toLocaleString('pt-BR'), alinhamento: 'centro' },
        { texto: 'Se voce leu isto, a impressora esta pronta.', negrito: true },
      ])
      if (via !== 'cancelado')
        setTesteImpressora(
          via === 'bluetooth'
            ? '✓ enviado à impressora bluetooth'
            : '✓ aberto para impressão do navegador',
        )
    } catch (e) {
      setTesteImpressora(e instanceof Error ? e.message : 'Falha na impressão')
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <h3 className="font-bold text-slate-700 dark:text-slate-200">
        Restaurante & impressora
      </h3>
      <Field label="Nome do restaurante">
        <Input
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
        />
      </Field>
      <Field label="Endereço de entrega do restaurante" hint="Utilizado nos pedidos de reposição enviados aos fornecedores. Informe rua, número, bairro, cidade e CEP.">
        <Input
          value={form.endereco ?? ''}
          maxLength={500}
          placeholder="Rua, número, bairro, cidade - UF, CEP"
          onChange={(e) => setForm({ ...form, endereco: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Moeda">
          <Input value={form.moeda} disabled />
        </Field>
        <Field label="Timezone">
          <Input
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          />
        </Field>
        <Field label="Impressora (tipo)">
          <Select
            value={form.impressoraTipo}
            onChange={(e) =>
              setForm({ ...form, impressoraTipo: e.target.value })
            }
          >
            {['bluetooth', 'usb', 'rede', 'nenhuma'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Endereço / MAC">
          <Input
            value={form.impressoraEndereco}
            onChange={(e) =>
              setForm({ ...form, impressoraEndereco: e.target.value })
            }
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          className="!py-1.5 !text-xs"
          onClick={() => void testarImpressora()}
        >
          🖨 Testar impressora
        </Button>
        {testeImpressora && (
          <span className="text-xs font-semibold text-slate-500">
            {testeImpressora}
          </span>
        )}
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600">
        <input
          type="checkbox"
          checked={form.cardapioDigitalAtivo}
          onChange={(e) =>
            setForm({ ...form, cardapioDigitalAtivo: e.target.checked })
          }
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
          onChange={(e) =>
            setForm({ ...form, baixaEstoqueAutomatica: e.target.checked })
          }
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        <span>
          <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Descontar estoque ao iniciar preparo
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Quando ligado, os ingredientes da receita de cada produto são
            baixados automaticamente do estoque no início do preparo.
            Admin/gerente podem alterar.
          </span>
        </span>
      </label>

      <Button
        loading={salvar.isPending}
        onClick={() => salvar.mutate()}
        className="w-full"
      >
        Salvar configurações
      </Button>
      {salvar.isSuccess && !salvar.isPending && (
        <p className="text-center text-xs font-semibold text-emerald-600">
          ✓ salvo
        </p>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ usuários
const PAPEIS = ['gerente', 'caixa', 'garcom', 'cozinha'] as const

function UsuarioRow({ usuario }: { usuario: AppUser }) {
  const { me } = useAuth()
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false),
    [nome, setNome] = useState(usuario.nome),
    [papel, setPapel] = useState(usuario.papel),
    [erro, setErro] = useState(''),
    [ok, setOk] = useState('')
  const permitido =
    me?.papel === 'admin' || !['admin', 'gerente'].includes(usuario.papel)
  const salvar = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/usuarios/${usuario.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      setEditando(false)
      setErro('')
    },
    onError: (e) => setErro(erroConta(e)),
  })
  const recuperar = useMutation({
    mutationFn: async () => {
      const alvo = await api<{ email: string }>(
        `/usuarios/${usuario.id}/recuperacao`,
        { method: 'POST' },
      )
      return recuperarSenha(alvo.email)
    },
    onSuccess: setOk,
    onError: (e) => setErro(erroConta(e)),
  })
  return (
    <li className="min-w-0 space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold">{usuario.nome}</p>
          <p className="break-all text-xs text-slate-500">
            {usuario.email ?? usuario.id}
          </p>
          <p className="text-xs">{usuario.ativo ? 'Ativo' : 'Desativado'}</p>
        </div>
        <Badge value={usuario.papel} />
      </div>
      {editando && (
        <div className="space-y-3">
          <Field label="Nome do usuário">
            <Input
              value={nome}
              maxLength={150}
              onChange={(e) => setNome(e.target.value)}
            />
          </Field>
          <Field label="Papel no restaurante">
            <Select
              disabled={me?.uid === usuario.id}
              value={papel}
              onChange={(e) => setPapel(e.target.value)}
            >
              {[
                ...new Set([
                  usuario.papel,
                  ...PAPEIS,
                  ...(me?.papel === 'admin' ? ['admin'] : []),
                ]),
              ]
                .filter(
                  (p) =>
                    me?.papel === 'admin' || !['admin', 'gerente'].includes(p),
                )
                .map((p) => (
                  <option key={p}>{p}</option>
                ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              loading={salvar.isPending}
              disabled={!nome.trim()}
              onClick={() =>
                salvar.mutate({
                  nome: nome.trim(),
                  ...(papel !== usuario.papel ? { papel } : {}),
                })
              }
            >
              Salvar usuário
            </Button>
            <Button variant="ghost" onClick={() => setEditando(false)}>
              Cancelar edição
            </Button>
          </div>
        </div>
      )}
      {permitido && !editando && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditando(true)}>
            Editar
          </Button>
          <Button
            variant="ghost"
            loading={recuperar.isPending}
            onClick={() => recuperar.mutate()}
          >
            Redefinir senha
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              setOk(
                'Para corrigir o login com segurança, o titular deve abrir Minha conta e enviar a verificação ao novo e-mail. Se perdeu o acesso, use a recuperação de senha; casos sem acesso à caixa postal exigem validação de identidade pelo suporte responsável.',
              )
            }
          >
            Orientar correção de login
          </Button>
          <Button
            variant="ghost"
            loading={salvar.isPending}
            onClick={() =>
              window.confirm(
                `${usuario.ativo ? 'Desativar' : 'Reativar'} ${usuario.nome}?`,
              ) && salvar.mutate({ ativo: !usuario.ativo })
            }
          >
            {usuario.ativo ? 'Desativar' : 'Reativar'}
          </Button>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-sm text-rose-600">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="text-sm text-slate-600 dark:text-slate-300">
          {ok}
        </p>
      )}
    </li>
  )
}

function NovoUsuarioButton() {
  const { me } = useAuth()
  const qc = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState({
    nome: '',
    email: '',
    senha: '',
    papel: 'caixa',
  })
  const [erro, setErro] = useState<string | null>(null)

  const criar = useMutation({
    mutationFn: () => api('/usuarios', { method: 'POST', body: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      setAberto(false)
      setForm({ nome: '', email: '', senha: '', papel: 'caixa' })
    },
    onError: (e) =>
      setErro(e instanceof Error ? e.message : 'Erro ao criar usuário'),
  })

  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setAberto(true)}
      >
        + Adicionar usuário
      </Button>

      <Modal
        title="Adicionar usuário"
        open={aberto}
        onClose={() => setAberto(false)}
      >
        <div className="space-y-3">
          <Field label="Nome">
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Senha (mín. 6 caracteres)">
            <Input
              type="password"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
            />
          </Field>
          <Field label="Papel">
            <Select
              value={form.papel}
              onChange={(e) => setForm({ ...form, papel: e.target.value })}
            >
              {PAPEIS.filter(
                (p) => p !== 'gerente' || me?.papel === 'admin',
              ).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          {erro && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {erro}
            </p>
          )}
          <Button
            className="w-full"
            loading={criar.isPending}
            disabled={
              !form.nome.trim() || !form.email.trim() || form.senha.length < 6
            }
            onClick={() => criar.mutate()}
          >
            Criar usuário
          </Button>
        </div>
      </Modal>
    </>
  )
}
