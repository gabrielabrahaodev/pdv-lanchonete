import manifesto from './mapa.json' with { type: 'json' }
export { manifesto }
export type PerfilWiki =
  | {
      uid: string
      restaurantId?: string | null
      papel?: string | null
      souDono?: boolean
    }
  | null
  | undefined
export function podeLer(artigo: { perfis: string[] }, me: PerfilWiki) {
  return (
    !!me &&
    ((me.souDono && artigo.perfis.includes('owner')) ||
      (!!me.restaurantId && artigo.perfis.includes(me.papel ?? '')) ||
      (!me.restaurantId && artigo.perfis.length === 5))
  )
}
export function telaAtual(path: string) {
  return manifesto.telas.find((t) =>
    new RegExp('^' + t.rota.replace(/:[^/]+/g, '[^/]+') + '/?$').test(path),
  )
}
export function podeVoltar(path: string, me: PerfilWiki): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path))
    return false
  const tela = telaAtual(path)
  if (!tela || !me || tela.acesso === 'publico') return false
  if (tela.acesso === 'owner') return !!me.souDono
  if (tela.acesso === 'autenticado') return true
  if (!me.restaurantId) return false
  return tela.acesso === 'gestao'
    ? ['admin', 'gerente'].includes(me.papel ?? '')
    : tela.acesso === 'financeiro'
      ? ['admin', 'gerente', 'caixa'].includes(me.papel ?? '')
      : true
}
export function artigoDaSecao(
  grupo: keyof typeof manifesto.secoes,
  secao: string,
) {
  const mapa = manifesto.secoes[grupo] as Record<string, string>
  return mapa[secao]
}
export type OrigemWiki = {
  pathname: string
  search: string
  hash: string
  key: string
  state: null
  uid: string
  rid: string | null
  nome: string
}
export function origemValida(
  state: unknown,
  me: PerfilWiki,
): OrigemWiki | null {
  const o = (state as { origemWiki?: OrigemWiki } | null)?.origemWiki
  return o &&
    me &&
    o.uid === me.uid &&
    o.rid === (me.restaurantId ?? null) &&
    typeof o.pathname === 'string' &&
    typeof o.key === 'string' &&
    typeof o.nome === 'string' &&
    (o.search === '' || o.search === '?add=1') &&
    o.hash === '' &&
    podeVoltar(o.pathname, me)
    ? o
    : null
}

const consultas = new Map<
  string,
  { uid: string; rid: string | null; pathname: string; search: string }
>()
export function memorizarConsulta(
  key: string,
  uid: string,
  rid: string | null,
  pathname: string,
  search: string,
) {
  if (consultas.size >= 32) consultas.delete(consultas.keys().next().value!)
  consultas.set(key, { uid, rid, pathname, search })
}
export function consultaDaOrigem(o: OrigemWiki): string {
  const salvo = consultas.get(o.key)
  return salvo?.uid === o.uid &&
    salvo.rid === o.rid &&
    salvo.pathname === o.pathname
    ? salvo.search
    : o.search
}
