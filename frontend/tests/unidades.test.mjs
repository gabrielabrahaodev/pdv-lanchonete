import test from 'node:test'
import assert from 'node:assert/strict'
import { converterQuantidade as c, unidadesCompativeis } from '../.test-build/lib/unidades.js'
import { precificar } from '../.test-build/lib/precificacao.js'
test('kg/g e L/ml em ambas direções',()=>{assert.equal(c(1,'kg','g'),1000);assert.equal(c(150,'g','kg'),.15);assert.equal(c(2,'L','ml'),2000);assert.equal(c(200,'ml','L'),.2)})
test('embalagens são configuráveis por insumo',()=>{assert.equal(c(1,'cx','un','cx',100),100);assert.equal(c(2,'pct','un','pct',12),24);assert.equal(c(1,'cx','un'),null);assert.equal(c(1,'kg','L'),null);assert.equal(c(1,'ml','g'),null)})
test('unidades incompatíveis não são oferecidas',()=>{assert.deepEqual(unidadesCompativeis('kg'),['kg','g']);assert.ok(unidadesCompativeis('un','cx',100).includes('cx'))})
test('precificação carne leite e embalagem sem conversão manual',()=>{
 for(const [item,linha,custo] of [[{id:'c',unidade:'kg',custoMedio:40},{itemId:'c',qtd:'150',unidade:'g'},6],[{id:'l',unidade:'L',custoMedio:8},{itemId:'l',qtd:'200',unidade:'ml'},1.6],[{id:'e',unidade:'un',custoMedio:.5,unidadeCompra:'cx',fatorCompra:100},{itemId:'e',qtd:'3',unidade:'un'},1.5]])assert.equal(precificar([linha],[item],'50').custo,custo)
})
test('markup de 50% não é margem de 50%; rendimento e receita inválida',()=>{const r=precificar([{itemId:'i',qtd:'1'}],[{id:'i',unidade:'kg',custoMedio:20}],'50',2);assert.equal(r.custo,10);assert.equal(r.preco,15);assert.ok(Math.abs(r.margemVenda-100/3)<1e-9);assert.equal(precificar([{itemId:'i',qtd:'1',unidade:'L'}],[{id:'i',unidade:'kg',custoMedio:20}],'50').preco,null)})
