import { auth } from './firebase'

const BASE = import.meta.env.VITE_API_URL ?? ''

/** Base da API (para montar URLs de <img>, ex.: foto do produto). */
export const API_BASE = BASE

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  idempotencyKey?: string
  paymentIdempotencyKey?: string
}

async function token(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new ApiError(401, 'Não autenticado')
  return user.getIdToken()
}

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const t = await token()
  const res = await fetch(`${BASE}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${t}`,
      ...(options.paymentIdempotencyKey ? { 'X-Idempotency-Key': options.paymentIdempotencyKey } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })

  if (res.status === 204) return undefined as T

  let data: any = null
  try {
    data = await res.json()
  } catch {
    // resposta sem corpo
  }

  if (!res.ok) {
    const detail =
      data?.detail ??
      (typeof data === 'string' ? data : null) ??
      `Erro ${res.status}`
    throw new ApiError(res.status, typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return data as T
}
