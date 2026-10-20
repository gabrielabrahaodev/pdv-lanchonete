import type { InventoryItem } from '../types/index'

export function numeroDecimal(valor: string): number {
  const texto = valor.trim().replace(',', '.')
  return texto && /^\d+(\.\d+)?$/.test(texto) ? Number(texto) : NaN
}

/** Quantidades e custos usam a mesma unidade do estoque (ex.: 0,15 kg). */
export function precificar(
  ingredientes: { itemId: string; qtd: string }[],
  estoque: InventoryItem[],
  percentual: string,
) {
  const acrescimo = numeroDecimal(percentual)
  const linhas = ingredientes.map((ingrediente) => {
    const item = estoque.find((item) => item.id === ingrediente.itemId)
    const qtd = numeroDecimal(ingrediente.qtd)
    const valido = !!item && Number.isFinite(item.custoMedio) && item.custoMedio > 0
      && Number.isFinite(qtd) && qtd > 0
    return { item, qtd, custo: valido ? item!.custoMedio * qtd : null }
  })
  const custo = linhas.reduce((total, linha) => total + (linha.custo ?? 0), 0)
  const completo = linhas.length > 0 && linhas.every((linha) => linha.custo !== null)
    && Number.isFinite(custo) && custo > 0
  const calculado = custo * (1 + acrescimo / 100)
  // Arredonda para cima para não ficar abaixo do percentual pedido.
  const preco = completo && Number.isFinite(acrescimo) && acrescimo >= 0
    && Number.isFinite(calculado) && calculado * 100 <= Number.MAX_SAFE_INTEGER
    ? Math.ceil(Number((calculado * 100).toFixed(8))) / 100 : null
  return { linhas, custo: completo ? custo : null, preco,
    lucro: preco === null ? null : preco - custo,
    margemVenda: preco === null ? null : (preco - custo) / preco * 100 }
}
