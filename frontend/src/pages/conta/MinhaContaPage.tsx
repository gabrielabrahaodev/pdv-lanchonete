import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import {
  mudarSenha,
  solicitarEmail,
  erroConta,
  recuperarSenha,
} from '../../lib/conta'
import { Button, Card, Field, Input } from '../../components/ui'
import { PageHeader } from '../../components/layout/AppLayout'
export default function MinhaContaPage() {
  const { me, fbUser, refreshMe, logout } = useAuth()
  const [nome, setNome] = useState(me?.perfil?.nome ?? ''),
    [email, setEmail] = useState(''),
    [atual, setAtual] = useState(''),
    [nova, setNova] = useState(''),
    [repetir, setRepetir] = useState(''),
    [erro, setErro] = useState(''),
    [ok, setOk] = useState('')
  const salvar = useMutation({
    mutationFn: async (
      acao: 'nome' | 'senha' | 'email' | 'sincronizar' | 'recuperar',
    ) => {
      setErro('')
      setOk('')
      if (acao === 'nome') {
        await api('/usuarios/me', {
          method: 'PATCH',
          body: { nome: nome.trim() },
        })
        await refreshMe()
        return 'Nome atualizado.'
      }
      if (acao === 'senha') {
        if (nova !== repetir)
          throw new Error('A confirmação da senha não confere.')
        await mudarSenha(atual, nova)
        setAtual('')
        setNova('')
        setRepetir('')
        await logout()
        return 'Senha alterada. Entre novamente.'
      }
      if (acao === 'email') {
        await solicitarEmail(atual, email)
        setAtual('')
        setEmail('')
        return 'Enviamos a verificação ao novo endereço. Confirme o link; depois entre novamente ou use Atualizar login verificado.'
      }
      if (acao === 'recuperar') return recuperarSenha(fbUser?.email ?? '')
      await fbUser?.reload()
      await fbUser?.getIdToken(true)
      await api('/usuarios/me/sincronizar-login', { method: 'POST' })
      await refreshMe()
      return 'Login verificado e perfil sincronizados.'
    },
    onSuccess: (msg) => setOk(msg),
    onError: (e) => setErro(erroConta(e)),
  })
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-3 sm:p-6">
      <PageHeader
        title="Minha conta"
        subtitle="Dados pessoais e segurança do seu login"
      />
      {erro && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 p-3 text-rose-700 dark:bg-rose-950 dark:text-rose-200"
        >
          {erro}
        </p>
      )}
      {ok && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-emerald-800"
        >
          {ok}
        </p>
      )}
      <fieldset disabled={salvar.isPending} className="space-y-5">
        <Card className="space-y-4 p-4 sm:p-6">
          <h2 className="font-bold">Seu perfil</h2>
          <p className="break-words text-sm">
            Login: {fbUser?.email ?? me?.email}
            <br />
            Papel: {me?.papel}
            <br />
            Restaurante: {me?.restaurantNome}
          </p>
          <p className="text-xs text-slate-500">
            Administrador do restaurante e dono da plataforma são permissões
            diferentes.
          </p>
          <Field label="Seu nome">
            <Input
              autoComplete="name"
              value={nome}
              maxLength={150}
              onChange={(e) => setNome(e.target.value)}
            />
          </Field>
          <Button disabled={!nome.trim()} onClick={() => salvar.mutate('nome')}>
            Salvar nome
          </Button>
        </Card>
        <Card className="space-y-4 p-4 sm:p-6">
          <h2 className="font-bold">Alterar credenciais</h2>
          <p className="text-sm text-slate-500">
            Informe sua senha atual para autorizar uma mudança. O novo e-mail só
            passa a valer após verificação.
          </p>
          <Field label="Senha atual">
            <Input
              type="password"
              autoComplete="current-password"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nova senha">
              <Input
                type="password"
                autoComplete="new-password"
                value={nova}
                onChange={(e) => setNova(e.target.value)}
              />
            </Field>
            <Field label="Confirmar nova senha">
              <Input
                type="password"
                autoComplete="new-password"
                value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
              />
            </Field>
          </div>
          <Button
            disabled={!atual || nova.length < 6 || nova !== repetir}
            onClick={() => salvar.mutate('senha')}
          >
            Alterar senha e sair
          </Button>
          <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
            <Field label="Novo e-mail de login">
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button
              className="mt-3"
              disabled={!atual || !email.includes('@')}
              onClick={() => salvar.mutate('email')}
            >
              Enviar verificação ao novo e-mail
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => salvar.mutate('sincronizar')}
            >
              Atualizar login verificado
            </Button>
            <Button variant="ghost" onClick={() => salvar.mutate('recuperar')}>
              Receber recuperação de senha
            </Button>
          </div>
        </Card>
      </fieldset>
    </div>
  )
}
