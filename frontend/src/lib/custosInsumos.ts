import { converterQuantidade } from './unidades.js'

export type InsumoUnidades = {
  unidade: string
  unidadeCompra?: string | null
  fatorCompra?: number | null
  custoMedio?: number
}

/** Unidade legível para comprar e exibir preços, sem alterar o estoque legado. */
export function unidadeReferencia(item: InsumoUnidades): string {
  if (['cx', 'pct'].includes(item.unidadeCompra ?? '') && item.fatorCompra && item.fatorCompra > 0) {
    return item.unidadeCompra!
  }
  if (item.unidade === 'g') return 'kg'
  if (item.unidade === 'ml') return 'L'
  return item.unidade
}

export function quantidadeControle(
  quantidade: number,
  unidadeCompra: string,
  item: InsumoUnidades,
): number | null {
  return converterQuantidade(
    quantidade, unidadeCompra, item.unidade,
    item.unidadeCompra ?? undefined, item.fatorCompra ?? undefined,
  )
}

/** Custo informado em R$/kg, R$/L, R$/cx ou R$/un para custo de controle. */
export function custoPorUnidadeControle(
  precoReferencia: number,
  referencia: string,
  item: InsumoUnidades,
): number | null {
  if (!Number.isFinite(precoReferencia) || precoReferencia < 0) return null
  const equivalencia = quantidadeControle(1, referencia, item)
  return equivalencia && equivalencia > 0 ? precoReferencia / equivalencia : null
}

export function precoPorReferencia(item: InsumoUnidades, referencia = unidadeReferencia(item)): number | null {
  const equivalencia = quantidadeControle(1, referencia, item)
  return equivalencia != null && Number.isFinite(item.custoMedio) &&
      item.custoMedio! >= 0
    ? item.custoMedio! * equivalencia : null
}

/** Mostra valor compreensível: R$ 8,00/kg, não R$ 0,008/g. */
export function formatarPrecoReferencia(item: InsumoUnidades): string {
  const referencia = unidadeReferencia(item)
  const valor = precoPorReferencia(item, referencia)
  if (valor === null) return 'Custo não informado'
  const moeda = valor.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: 2, maximumFractionDigits: 8,
  })
  return `${moeda} / ${referencia}`
}

export function simularCompra(
  item: InsumoUnidades,
  quantidadeCompra: number,
  unidadeCompra: string,
  valorTotalCompra: number,
): { quantidadeControle: number; custoPorControle: number; custoPorReferencia: number; referencia: string } | null {
  const convertida = quantidadeControle(quantidadeCompra, unidadeCompra, item)
  if (!convertida || convertida <= 0 || !Number.isFinite(valorTotalCompra) || valorTotalCompra <= 0) return null
  const referencia = unidadeReferencia(item)
  const equivalencia = quantidadeControle(1, referencia, item)
  if (!equivalencia || equivalencia <= 0) return null
  return {
    quantidadeControle: convertida,
    custoPorControle: valorTotalCompra / convertida,
    custoPorReferencia: valorTotalCompra / convertida * equivalencia,
    referencia,
  }
}
