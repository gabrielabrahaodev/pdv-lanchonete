import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ABERTURAS_REPOSICAO,
  normalizarTelefoneWhatsApp,
  criarMensagemReposicao,
  urlWhatsApp,
} from '../.test-build/reposicaoMensagem.js'

test('três versões de mensagem com produtos, quantidade e endereço', () => {
  assert.equal(ABERTURAS_REPOSICAO.length, 3)
  for (let variante = 0; variante < 3; variante++) {
    const s = criarMensagemReposicao('Café Anis', 'Rua das Flores, 123, SP',
      [{ nome: 'Leite', quantidade: 2, unidade: 'L' }, { nome: 'Café', quantidade: 1.5, unidade: 'kg' }], variante)
    assert.ok(s.startsWith(ABERTURAS_REPOSICAO[variante]))
    assert.match(s, /Leite: 2 L/)
    assert.match(s, /Café: 1,5 kg/)
    assert.match(s, /Rua das Flores, 123, SP/)
    assert.match(s, /Café Anis/)
  }
})

test('gera link wa.me seguro com DDD e codificação URL', () => {
  assert.equal(normalizarTelefoneWhatsApp('(11) 98765-4321'), '5511987654321')
  assert.equal(normalizarTelefoneWhatsApp('+55 11 98765-4321'), '5511987654321')
  assert.equal(normalizarTelefoneWhatsApp('123'), null)
  assert.equal(urlWhatsApp('123', 'Olá'), null)
  assert.equal(urlWhatsApp('11987654321', 'Leite & Café'),
    'https://wa.me/5511987654321?text=Leite%20%26%20Caf%C3%A9')
})

test('não cria mensagens sem endereço ou quantidade válida', () => {
  assert.throws(() => criarMensagemReposicao('Café', '', [{ nome:'Leite', quantidade: 1, unidade: 'L' }], 0))
  assert.throws(() => criarMensagemReposicao('Café', 'Rua 1', [{ nome:'Leite', quantidade: 0, unidade: 'L' }], 0))
  assert.throws(() => criarMensagemReposicao('Café', 'Rua 1', [], 0))
})
