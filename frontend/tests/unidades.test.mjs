import test from 'node:test'
import assert from 'node:assert/strict'
import { converterQuantidade as c, unidadesCompativeis } from '../.test-build/lib/unidades.js'
import { precificar } from '../.test-build/lib/precificacao.js'
import { precoPorReferencia, custoPorUnidadeControle, formatarPrecoReferencia, simularCompra, unidadeReferencia } from '../.test-build/lib/custosInsumos.js'
test('kg/g e L/ml em ambas direções',()=>{assert.equal(c(1,'kg','g'),1000);assert.equal(c(150,'g','kg'),.15);assert.equal(c(2,'L','ml'),2000);assert.equal(c(200,'ml','L'),.2)})
test('embalagens são configuráveis por insumo',()=>{assert.equal(c(1,'cx','un','cx',100),100);assert.equal(c(2,'pct','un','pct',12),24);assert.equal(c(1,'cx','un'),null);assert.equal(c(1,'kg','L'),null);assert.equal(c(1,'ml','g'),null)})
test('unidades incompatíveis não são oferecidas',()=>{assert.deepEqual(unidadesCompativeis('kg'),['kg','g']);assert.ok(unidadesCompativeis('un','cx',100).includes('cx'))})
test('precificação carne leite e embalagem sem conversão manual',()=>{
 for(const [item,linha,custo] of [[{id:'c',unidade:'kg',custoMedio:40},{itemId:'c',qtd:'150',unidade:'g'},6],[{id:'l',unidade:'L',custoMedio:8},{itemId:'l',qtd:'200',unidade:'ml'},1.6],[{id:'e',unidade:'un',custoMedio:.5,unidadeCompra:'cx',fatorCompra:100},{itemId:'e',qtd:'3',unidade:'un'},1.5]])assert.equal(precificar([linha],[item],'50').custo,custo)
})
test('markup de 50% não é margem de 50%; rendimento e receita inválida',()=>{const r=precificar([{itemId:'i',qtd:'1'}],[{id:'i',unidade:'kg',custoMedio:20}],'50',2);assert.equal(r.custo,10);assert.equal(r.preco,15);assert.ok(Math.abs(r.margemVenda-100/3)<1e-9);assert.equal(precificar([{itemId:'i',qtd:'1',unidade:'L'}],[{id:'i',unidade:'kg',custoMedio:20}],'50').preco,null)})

test('custo comercial por kg se estoque controla em gramas', () => {
  const farinha = { unidade:'g', unidadeCompra:'kg', custoMedio:0.008 }
  assert.equal(unidadeReferencia(farinha), 'kg')
  assert.equal(precoPorReferencia(farinha), 8)
  assert.equal(formatarPrecoReferencia(farinha), 'R$ 8,00 / kg')
  assert.equal(custoPorUnidadeControle(8, 'kg', farinha), 0.008)
  assert.deepEqual(simularCompra(farinha, 2, 'kg', 16), {
    quantidadeControle:2000, custoPorControle:0.008, custoPorReferencia:8, referencia:'kg',
  })
  assert.equal(precificar([{itemId:'f',qtd:'150',unidade:'g'}],[{id:'f',...farinha}],'50').custo,1.2)
})

test('leite comprado em litro e consumido em ml', () => {
  const leite = {unidade:'ml', unidadeCompra:'L', custoMedio:0.006}
  assert.equal(unidadeReferencia(leite), 'L')
  assert.equal(precoPorReferencia(leite), 6)
  assert.equal(simularCompra(leite, 2, 'L', 12)?.quantidadeControle, 2000)
  assert.equal(custoPorUnidadeControle(6, 'L', leite), 0.006)
})

test('pacote com fator de conversão por insumo e preço legível', () => {
  const pao = {unidade:'un', unidadeCompra:'pct', fatorCompra:12, custoMedio:0.5}
  assert.equal(unidadeReferencia(pao),'pct')
  assert.equal(precoPorReferencia(pao),6)
  assert.equal(simularCompra(pao,3,'pct',18)?.quantidadeControle,36)
  assert.equal(simularCompra(pao,3,'pct',18)?.custoPorReferencia,6)
  assert.equal(custoPorUnidadeControle(6,'pct',pao),0.5)
})

test('rejeita unidade incompatível e compra de valor zero', () => {
  assert.equal(simularCompra({unidade:'kg'},1,'L',12),null)
  assert.equal(simularCompra({unidade:'g'},100,'g',0),null)
  assert.equal(custoPorUnidadeControle(8,'L',{unidade:'g'}),null)
})
