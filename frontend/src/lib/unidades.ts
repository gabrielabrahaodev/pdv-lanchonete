export const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct'] as const
const base: Record<string, [string, number]> = {
  kg: ['massa', 1000],
  g: ['massa', 1],
  L: ['volume', 1000],
  ml: ['volume', 1],
  un: ['unidade', 1],
}
export function converterQuantidade(
  qtd: number,
  origem: string,
  destino: string,
  compra?: string,
  fator?: number,
): number | null {
  if (!Number.isFinite(qtd) || qtd < 0) return null
  if (origem === destino) return qtd
  if (
    ['cx', 'pct'].includes(origem) &&
    origem === compra &&
    !['cx', 'pct'].includes(destino) &&
    fator &&
    fator > 0
  )
    return qtd * fator
  if (base[origem] && base[destino] && base[origem][0] === base[destino][0])
    return (qtd * base[origem][1]) / base[destino][1]
  return null
}
export function unidadesCompativeis(
  controle: string,
  compra?: string,
  fator?: number,
) {
  return [...new Set([controle, ...UNIDADES])].filter(
    (u) => converterQuantidade(1, u, controle, compra, fator) !== null,
  )
}
