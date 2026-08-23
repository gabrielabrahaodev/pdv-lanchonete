/** Fetch público (sem Authorization) para os endpoints do cardápio digital. */
const BASE = import.meta.env.VITE_API_URL ?? ''

export async function apiPublico<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: options.method ?? 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* sem corpo */
  }
  if (!res.ok) {
    const detail = data?.detail ?? `Erro ${res.status}`
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return data as T
}
