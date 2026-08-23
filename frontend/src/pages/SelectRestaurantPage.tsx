import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { auth } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { Button, Card, Field, Input, LoadingScreen } from '../components/ui'
import type { AuthMe } from '../types'

export default function SelectRestaurantPage() {
  const { me, logout, loading: authLoading, fbUser, refreshMe } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<AuthMe>('/auth/me'),
    enabled: !!fbUser,
  })

  if (authLoading || (fbUser && isLoading)) return <LoadingScreen />
  if (!fbUser) return null

  const restaurantId = data?.restaurantId ?? me?.restaurantId

  return (
    <div className="grid min-h-full place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-2xl text-white shadow-lg shadow-brand-200">
          🏪
        </div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          {restaurantId ? (data?.restaurantNome ?? 'Restaurante') : 'Bem-vindo!'}
        </h1>

        {restaurantId ? (
          <>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Conectado ao restaurante <span className="font-semibold">{data?.restaurantNome ?? data?.restaurantId}</span>
            </p>
            <a href="/caixa">
              <Button className="mt-6 w-full py-2.5">Ir para o Caixa →</Button>
            </a>
          </>
        ) : (
          <PrimeiroRestauranteForm />
        )}

        <button
          onClick={() => logout()}
          className="mt-4 text-xs font-semibold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
        >
          Sair da conta
        </button>
      </Card>
    </div>
  )
}

/** Onboarding: conta autenticada SEM claim restaurantId cria o próprio estabelecimento. */
function PrimeiroRestauranteForm() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { refreshMe } = useAuth()
  const [nome, setNome] = useState('')
  const [mesas, setMesas] = useState('12')
  const [erro, setErro] = useState<string | null>(null)

  const criar = useMutation({
    mutationFn: () =>
      api<{ restaurantId: string; restaurantNome: string }>('/restaurantes/primeiro', {
        method: 'POST',
        body: { nome: nome.trim(), quantidadeMesas: Number(mesas) || 0 },
      }),
    onSuccess: async () => {
      // claims {restaurantId, papel} só valem no próximo token — forçar refresh
      if (auth.currentUser) await auth.currentUser.getIdToken(true)
      await refreshMe()
      qc.invalidateQueries({ queryKey: ['auth-me'] })
      navigate('/caixa')
    },
    onError: (e) => setErro(e instanceof Error ? e.message : 'Erro ao criar estabelecimento'),
  })

  return (
    <div className="mt-2 text-left">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Sua conta ainda não está vinculada a nenhum restaurante. Crie seu primeiro estabelecimento:
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          criar.mutate()
        }}
        className="space-y-3"
      >
        <Field label="Nome do estabelecimento">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex.: Lanchonete do Zé"
            required
            minLength={2}
          />
        </Field>
        <Field label="Quantidade de mesas">
          <Input
            inputMode="numeric"
            value={mesas}
            onChange={(e) => setMesas(e.target.value.replace(/\D/g, ''))}
            placeholder="0–50"
          />
        </Field>
        {erro && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {erro}
          </p>
        )}
        <Button type="submit" className="w-full py-2.5" loading={criar.isPending} disabled={!nome.trim()}>
          🚀 Criar meu estabelecimento
        </Button>
      </form>
    </div>
  )
}
