/** Versão do build, injetada pelo Vite; não consulta Firebase. */
declare const __APP_VERSION__: string
export const VERSAO_ATUAL = __APP_VERSION__

export async function consultarVersaoPublicada(): Promise<string | null> {
  if (import.meta.env.DEV) return null
  const url = new URL('/version.json', window.location.origin)
  url.searchParams.set('_', String(Date.now()))
  const resposta = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!resposta.ok || !resposta.headers.get('content-type')?.includes('application/json')) return null
  const dados: unknown = await resposta.json()
  if (!dados || typeof dados !== 'object' || !('version' in dados)) return null
  const versao = (dados as { version?: unknown }).version
  return typeof versao === 'string' && /^[a-zA-Z0-9._-]{6,100}$/.test(versao) ? versao : null
}

export function versaoDiferente(remota: string | null) {
  return Boolean(remota && remota !== VERSAO_ATUAL)
}

/**
 * Atualização explícita. Não apaga IndexedDB, dados do Firebase Auth ou
 * localStorage. Apenas caches do Workbox/Wiki, que são reconstruíveis.
 */
export async function forcarAtualizacao(versao: string = VERSAO_ATUAL): Promise<void> {
  const confirmado = window.confirm(
    'Atualizar o NexoComanda agora? Alterações ainda não salvas em pedidos ou formulários podem ser perdidas.',
  )
  if (!confirmado) return
  try {
    if ('serviceWorker' in navigator) {
      const registro = await navigator.serviceWorker.getRegistration()
      if (registro) {
        await registro.update()
        if (registro.waiting) {
          const controladorMudou = new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
            window.setTimeout(resolve, 2500)
          })
          registro.waiting.postMessage({ type: 'SKIP_WAITING' })
          await controladorMudou
        }
      }
    }
  } catch (erro) {
    console.warn('Atualização do service worker indisponível; tentando recarga de rede.', erro)
  }
  if ('caches' in window) {
    try {
      const nomes = await caches.keys()
      await Promise.all(
        nomes.filter((nome) => nome.startsWith('workbox-') || nome === 'wiki-artigos')
          .map((nome) => caches.delete(nome)),
      )
    } catch (erro) {
      console.warn('Não foi possível limpar o cache estático.', erro)
    }
  }
  const destino = new URL(window.location.href)
  destino.searchParams.set('_versao', versao.slice(0, 40))
  window.location.replace(destino.toString())
}
