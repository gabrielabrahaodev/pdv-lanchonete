/** API pública do cardápio, sem token de autenticação. */
const URL_API_PRODUCAO = 'https://pdv-lanchonete-dwiw.onrender.com'
const LOCAL = typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)

/**
 * O Vite injeta VITE_API_URL na compilação. Se ela for omitida ao publicar
 * o frontend, Firebase Hosting serve index.html para /api/* (HTTP 200 HTML).
 * Para a consulta pública, usa a API conhecida em produção como fallback.
 * Em desenvolvimento, preserva o proxy Vite local.
 */
export const API_PUBLICA_BASE = (
  (import.meta.env.VITE_API_URL || '').trim() ||
  (LOCAL || import.meta.env.DEV ? '' : URL_API_PRODUCAO)
).replace(/\/+$/, '')

const LIMITE_ESPERA_MS = 65_000

type OpcoesPublicas = {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

function mensagemHttp(status: number): string {
  if (status === 403) return 'O cardápio digital está desativado neste restaurante. Consulte um atendente.'
  if (status === 404) return 'Cardápio não encontrado. Peça ao atendente para conferir o QR Code.'
  if (status === 429) return 'Muitos acessos ao cardápio. Aguarde um pouco antes de tentar novamente.'
  if (status >= 500) return 'O servidor do cardápio está indisponível no momento. Tente novamente.'
  return 'Não foi possível obter o cardápio. Tente novamente ou consulte um atendente.'
}

/** Impede espera indefinida e respostas HTML incorretas no lugar do JSON da API. */
export async function apiPublico<T = unknown>(path: string, options: OpcoesPublicas = {}): Promise<T> {
  const controller = new AbortController()
  let excedeuTempo = false
  const cancelar = () => controller.abort()
  const timeout = setTimeout(() => {
    excedeuTempo = true
    controller.abort()
  }, LIMITE_ESPERA_MS)

  options.signal?.addEventListener('abort', cancelar, { once: true })
  if (options.signal?.aborted) controller.abort()

  try {
    const res = await fetch(`${API_PUBLICA_BASE}/api${path}`, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    })

    const tipo = res.headers.get('content-type') ?? ''
    if (!tipo.includes('application/json')) {
      throw new Error('O servidor não retornou os dados do cardápio. Verifique a conexão e tente novamente.')
    }

    let data: unknown
    try {
      data = await res.json()
    } catch {
      throw new Error('A resposta do cardápio veio incompleta. Tente novamente.')
    }

    if (!res.ok) throw new Error(mensagemHttp(res.status))
    if (data == null || typeof data !== 'object') {
      throw new Error('O servidor retornou dados inválidos. Tente novamente.')
    }
    return data as T
  } catch (e) {
    if (excedeuTempo) {
      throw new Error('O servidor demorou mais que o esperado. Aguarde alguns instantes e toque em Tentar novamente.')
    }
    // Sinais de cancelamento do React Query não são erros para mostrar ao usuário.
    if (options.signal?.aborted) throw e
    if (e instanceof TypeError || (e instanceof DOMException && e.name === 'NetworkError')) {
      throw new Error('Não foi possível conectar ao servidor do cardápio. Confira sua internet e tente novamente.')
    }
    throw e
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', cancelar)
  }
}
