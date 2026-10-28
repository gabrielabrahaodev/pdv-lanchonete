/**
 * Cache curto, exclusivo do cardápio PÚBLICO, sem dados de usuário ou token.
 * sessionStorage acelera recarregamentos do QR na mesma aba. Uma nova aba
 * faz uma consulta normal, e preços nunca são reutilizados após a validade.
 */
export const VALIDADE_CACHE_CARDAPIO_MS = 30_000

export type ProdutoPublico = {
  id: string
  nome: string
  categoriaId: string
  preco: number
  imagemUrl?: string | null
  temImagem?: boolean
  variacoes?: { id: string; nome: string; precoAdicional: number }[]
}

export type CategoriaPublica = { id: string; nome: string; icone?: string | null }

export type CardapioPublico = {
  categorias: CategoriaPublica[]
  produtos: ProdutoPublico[]
}

export type CacheCardapio = {
  data: CardapioPublico
  atualizadoEm: number
}

function chave(restaurantId: string): string {
  return `nexocomanda:cardapio-publico:v1:${encodeURIComponent(restaurantId)}`
}

export function cardapioValido(dado: unknown): dado is CardapioPublico {
  if (!dado || typeof dado !== 'object') return false
  const d = dado as Partial<CardapioPublico>
  return Array.isArray(d.categorias) && Array.isArray(d.produtos) &&
    d.categorias.every((c) => c && typeof c.id === 'string' && typeof c.nome === 'string') &&
    d.produtos.every((p) =>
      p && typeof p.id === 'string' && typeof p.nome === 'string' &&
      typeof p.categoriaId === 'string' && typeof p.preco === 'number' &&
      Number.isFinite(p.preco),
    )
}

export function lerCacheCardapio(restaurantId: string, agora = Date.now()): CacheCardapio | null {
  if (!restaurantId || typeof sessionStorage === 'undefined') return null
  try {
    const valor = sessionStorage.getItem(chave(restaurantId))
    if (!valor) return null
    const salvo: unknown = JSON.parse(valor)
    if (!salvo || typeof salvo !== 'object') return null
    const c = salvo as Partial<CacheCardapio>
    if (
      typeof c.atualizadoEm !== 'number' ||
      !Number.isFinite(c.atualizadoEm) ||
      c.atualizadoEm > agora ||
      agora - c.atualizadoEm >= VALIDADE_CACHE_CARDAPIO_MS ||
      !cardapioValido(c.data)
    ) {
      sessionStorage.removeItem(chave(restaurantId))
      return null
    }
    return { data: c.data, atualizadoEm: c.atualizadoEm }
  } catch {
    // Navegação privada, quota excedida ou sessão bloqueada não impedem a API.
    return null
  }
}

export function salvarCacheCardapio(
  restaurantId: string,
  data: CardapioPublico,
  atualizadoEm = Date.now(),
): void {
  if (!restaurantId || !cardapioValido(data) || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(chave(restaurantId), JSON.stringify({ data, atualizadoEm }))
  } catch {
    // Cache é uma otimização opcional: jamais bloqueia a exibição do cardápio.
  }
}
