import { recuperarSenha } from '../lib/conta'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button, Card, Field, Input } from '../components/ui'

export default function LoginPage() {
  const { login, registrar } = useAuth()
  const [params] = useSearchParams()
  // Chegada via link de convite (?t=CODE): começa já no modo criar conta,
  // sem e-mail pré-preenchido, e mostra banner explicativo
  const convidado = !!params.get('t')
  const [email, setEmail] = useState(convidado ? '' : 'admin@restaurante.com')
  const [senha, setSenha] = useState('')
  const [criando, setCriando] = useState(convidado)
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recuperacao,setRecuperacao] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      if (criando) await registrar(email.trim(), senha)
      else await login(email.trim(), senha)
    } catch (err: any) {
      const code = String(err?.code ?? '')
      if (code.includes('email-already-in-use')) {
        setErro('Este e-mail já possui conta. Faça login.')
      } else if (code.includes('weak-password')) {
        setErro('A senha precisa ter pelo menos 6 caracteres.')
      } else if (code.includes('invalid-email')) {
        setErro('E-mail inválido.')
      } else if (
        code.includes('invalid-credential') ||
        code.includes('user-not-found') ||
        code.includes('wrong-password')
      ) {
        setErro('E-mail ou senha incorretos.')
      } else if (code.includes('too-many-requests')) {
        setErro('Muitas tentativas. Tente novamente em instantes.')
      } else if (criando) {
        setErro('Falha ao criar conta. Verifique os dados e tente de novo.')
      } else {
        setErro('Falha no login. Verifique sua conexão.')
      }
    } finally {
      setLoading(false)
    }
  }

  function alternarModo() {
    setErro(null)
    if (!criando && email === 'admin@restaurante.com') setEmail('')
    setCriando((c) => !c)
  }

  return (
    <div className="grid min-h-full place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-200">
            <UtensilsCrossed className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">NexoComanda</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {criando ? 'Crie sua conta para começar' : 'Entre com sua conta para continuar'}
          </p>
        </div>

        {convidado && (
          <div className="mb-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30">
            <span aria-hidden="true">🎉 </span>Você recebeu um convite! Crie sua conta (ou entre) para configurar o seu estabelecimento.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="E-mail" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
          </Field>
          <Field label="Senha" required>
            <div className="relative">
              <Input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                minLength={criando ? 6 : undefined}
                autoComplete={criando ? 'new-password' : 'current-password'}
                placeholder={criando ? 'mínimo 6 caracteres' : '••••••••'}
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={mostrarSenha}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-slate-500 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-500 dark:hover:text-slate-300"
              >
                {mostrarSenha ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </Field>

          {erro && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {erro}
            </p>
          )}

          <Button type="submit" loading={loading} className="w-full py-2.5">
            {criando ? 'Criar conta' : 'Entrar'}
          </Button>
        </form>

        {!criando && <Button variant="ghost" className="mt-3 w-full" disabled={loading || !email.trim()} onClick={async()=>{setLoading(true);setErro(null);setRecuperacao(await recuperarSenha(email));setLoading(false)}}>Esqueci minha senha</Button>}
        {recuperacao && <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">{recuperacao}</p>}

        <button
          type="button"
          onClick={alternarModo}
          className="mt-4 w-full text-xs font-semibold text-slate-500 transition hover:text-brand-600 dark:hover:text-brand-300"
        >
          {criando ? 'Já tem conta? Entrar' : 'Novo por aqui? Criar conta'}
        </button>
      </Card>
    </div>
  )
}
