import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { auth } from '../lib/firebase'
import { Store } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Button, Card, Field, Input, LoadingScreen } from '../components/ui'
import type { AuthMe } from '../types'

export default function SelectRestaurantPage() {
  const { me, logout, loading: authLoading, fbUser } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<AuthMe>('/auth/me'),
    enabled: !!fbUser,
  })

  if (authLoading || (fbUser && isLoading)) return <LoadingScreen />
  if (!fbUser) return <Navigate to="/login" replace />
  // Operador da PLATAFORMA não cria estabelecimento próprio
  if (me?.souDono && !me.restaurantId) return <Navigate to="/plataforma" replace />

  const restaurantId = data?.restaurantId ?? me?.restaurantId

  return (
    <div className="grid min-h-full place-items-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-200">
          <Store className="h-7 w-7" aria-hidden="true" />
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
          className="mt-4 text-xs font-semibold text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
        >
          Sair da conta
        </button>
      </Card>
    </div>
  )
}

/** Onboarding: conta autenticada SEM claim restaurantId cria o próprio estabelecimento. */

const PRESETS_MESAS = [0, 6, 12, 24]

const chipCls = (ativo: boolean) =>
  `rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
    ativo
      ? 'bg-brand-600 text-white ring-brand-600'
      : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
  }`

function PrimeiroRestauranteForm() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { refreshMe } = useAuth()
  const [params] = useSearchParams()
  // Convite de provisionamento (plano da plataforma) chega via ?t=CODE
  const convite = params.get('t') ?? ''
  const [nome, setNome] = useState('')
  const [mesas, setMesas] = useState('12')
  const [outroMesas, setOutroMesas] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const criar = useMutation({
    mutationFn: () =>
      api<{ restaurantId: string; restaurantNome: string }>('/restaurantes/primeiro', {
        method: 'POST',
        body: { nome: nome.trim(), quantidadeMesas: Number(mesas) || 0, token: convite || undefined },
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
        Sua conta ainda não está vinculada a nenhum restaurante.{' '}
        {convite ? 'Use o convite recebido para criar o seu:' : 'Crie seu primeiro estabelecimento:'}
      </p>
      {!convite && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Novos estabelecimentos são criados por convite. Sem um link de convite válido, a criação será bloqueada.
        </p>
      )}
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
          <div className="flex flex-wrap gap-1.5">
            {PRESETS_MESAS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setOutroMesas(false)
                  setMesas(String(n))
                }}
                className={chipCls(!outroMesas && mesas === String(n))}
              >
                {n === 0 ? 'Sem salão' : `${n} mesas`}
              </button>
            ))}
            <button type="button" onClick={() => setOutroMesas(true)} className={chipCls(outroMesas)}>
              Outro
            </button>
          </div>
          {outroMesas && (
            <Input
              inputMode="numeric"
              value={mesas}
              onChange={(e) => setMesas(e.target.value.replace(/\D/g, ''))}
              placeholder="0–50"
              className="mt-2"
            />
          )}
        </Field>
        {erro && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            {erro}
          </p>
        )}
        <Button type="submit" className="w-full py-2.5" loading={criar.isPending} disabled={!nome.trim()}>
          Criar meu estabelecimento
        </Button>
      </form>
    </div>
  )
}
