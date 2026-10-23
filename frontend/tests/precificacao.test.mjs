import { test } from 'node:test'
import assert from 'node:assert/strict'
import { precificar } from '../.test-build/lib/precificacao.js'
const estoque = [
  { id: 'carne', nome: 'Carne', unidade: 'kg', custoMedio: 40 },
  { id: 'pao', nome: 'Pão', unidade: 'un', custoMedio: 2 },
]
const receita = [{ itemId: 'carne', qtd: '0,15' }, { itemId: 'pao', qtd: '1' }]
test('custo proporcional em kg e unidade, acréscimo e margem sobre venda', () => {
  const r = precificar(receita, estoque, '50')
  assert.equal(r.custo, 8)
  assert.equal(r.preco, 12)
  assert.equal(r.lucro, 4)
  assert.ok(Math.abs(r.margemVenda - 100 / 3) < 1e-10)
})
test('aceita 0% e percentuais acima de 100% sobre o custo', () => {
  assert.equal(precificar(receita, estoque, '0').preco, 8)
  assert.equal(precificar(receita, estoque, '150').preco, 20)
})
test('não sugere preço com receita incompleta ou custo desconhecido', () => {
  for (const receita of [[], [{ itemId: 'ausente', qtd: '1' }], [{ itemId: 'pao', qtd: '' }], [{ itemId: 'pao', qtd: '-1' }]]) {
    assert.equal(precificar(receita, estoque, '50').preco, null)
  }
  for (const custoMedio of [0, -1, NaN, Infinity, undefined]) {
    assert.equal(precificar([{ itemId: 'pao', qtd: '1' }], [{ ...estoque[1], custoMedio }], '50').preco, null)
  }
})
test('rejeita percentuais vazios, negativos, inválidos e infinitos', () => {
  for (const percentual of ['', ' ', '-1', 'abc', 'Infinity', '1e309']) {
    assert.equal(precificar(receita, estoque, percentual).preco, null)
  }
})
test('arredonda o preço para cima em centavos sem centavo espúrio', () => {
  assert.equal(precificar([{ itemId: 'pao', qtd: '1' }], [{ ...estoque[1], custoMedio: 0.1 }], '10').preco, 0.11)
  assert.equal(precificar(receita, estoque, '33,33').preco, 10.67)
})
test('alterar quantidade ou custo recalcula a sugestão', () => {
  assert.equal(precificar([{ itemId: 'carne', qtd: '0,3' }], estoque, '50').preco, 18)
  assert.equal(precificar(receita, [{ ...estoque[0], custoMedio: 60 }, estoque[1]], '50').preco, 16.5)
})

test('custo e preço por unidade consideram o rendimento da receita', () => {
  const r = precificar(receita, estoque, '50', 4)
  assert.equal(r.custo, 2)
  assert.equal(r.preco, 3)
  assert.equal(r.lucro, 1)
  for (const rendimento of [0, -1, NaN, Infinity]) {
    assert.equal(precificar(receita, estoque, '50', rendimento).preco, null)
  }
})
