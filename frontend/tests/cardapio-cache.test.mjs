import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  VALIDADE_CACHE_CARDAPIO_MS as TTL,
  cardapioValido,
  dividirNomeRestaurante,
  lerCacheCardapio,
  salvarCacheCardapio,
} from '../.test-build/cardapioCache.js'

const exemplo = {
  categorias: [{ id: 'bebidas', nome: 'Bebidas' }],
  produtos: [{ id: 'cafe', nome: 'Café', categoriaId: 'bebidas', preco: 8.5 }],
}

function memoria() {
  const dados = new Map()
  globalThis.sessionStorage = {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => dados.set(chave, String(valor)),
    removeItem: (chave) => dados.delete(chave),
    clear: () => dados.clear(),
  }
  return dados
}

test('cache publico e especifico por restaurante, com limite de 30 segundos', () => {
  memoria()
  salvarCacheCardapio('restaurante-a', exemplo, 100_000)
  assert.deepEqual(lerCacheCardapio('restaurante-a', 100_500)?.data, exemplo)
  assert.equal(lerCacheCardapio('restaurante-b', 100_500), null)
  assert.deepEqual(lerCacheCardapio('restaurante-a', 100_000 + TTL - 1)?.data, exemplo)
  assert.equal(lerCacheCardapio('restaurante-a', 100_000 + TTL), null)
  delete globalThis.sessionStorage
})

test('nao usa cache futurista, corrompido ou payload que nao seja cardapio', () => {
  const dados = memoria()
  assert.equal(cardapioValido({ categorias: [], produtos: [{ id: 'a', nome: 'X', preco: '9' }] }), false)
  assert.equal(cardapioValido(exemplo), true)
  salvarCacheCardapio('restaurante', exemplo, 100_000)
  assert.equal(lerCacheCardapio('restaurante', 99_999), null)
  dados.set('nexocomanda:cardapio-publico:v1:restaurante', '{"data":{"produtos":{}},"atualizadoEm":1}')
  assert.equal(lerCacheCardapio('restaurante', 100_000), null)
  dados.set('nexocomanda:cardapio-publico:v1:restaurante', '{json invalido')
  assert.equal(lerCacheCardapio('restaurante', 100_000), null)
  delete globalThis.sessionStorage
})

test('bloqueio do sessionStorage nao impede API ou exibicao', () => {
  globalThis.sessionStorage = {
    getItem: () => { throw new Error('storage blocked') },
    setItem: () => { throw new Error('storage blocked') },
    removeItem: () => {},
  }
  assert.doesNotThrow(() => salvarCacheCardapio('a', exemplo))
  assert.equal(lerCacheCardapio('a'), null)
  delete globalThis.sessionStorage
})

test('rota publica nao importa provedores privados nem inicializa autenticacao', () => {
  const publico = readFileSync('src/App.tsx', 'utf8')
  const privado = readFileSync('src/AppAutenticado.tsx', 'utf8')
  assert.match(publico, /lazy\(\(\) => import\('\.\/AppAutenticado'\)\)/)
  assert.match(publico, /path="\/m\/:restaurantId\/:mesaId"/)
  assert.doesNotMatch(publico, /from '\.\/context\/(AuthContext|ThemeContext)'/)
  assert.doesNotMatch(publico, /<AuthProvider>|<ThemeProvider>/)
  assert.match(privado, /<AuthProvider>/)
  assert.match(privado, /<ThemeProvider>/)
  assert.doesNotMatch(privado, /<Route path="\/m\//)
  assert.doesNotMatch(privado, /queryClient\.clear\(\)/)
})

test('cardapio guarda somente dados publicos e nao tem estado de login', () => {
  const pagina = readFileSync('src/pages/cardapio/CardapioPage.tsx', 'utf8')
  assert.match(pagina, /salvarCacheCardapio\(restaurantId, dados\)/)
  assert.match(pagina, /lerCacheCardapio\(restaurantId\)/)
  assert.doesNotMatch(pagina, /useAuth\(|Authorization|\/auth\/me/)
})

test('nome do restaurante é opcional na API antiga e respeita o tenant', () => {
  assert.equal(cardapioValido(exemplo), true)
  assert.equal(cardapioValido({ ...exemplo, restauranteNome: 'Café Anis' }), true)
  assert.equal(cardapioValido({ ...exemplo, restauranteNome: { privado: true } }), false)

  memoria()
  salvarCacheCardapio('anis', { ...exemplo, restauranteNome: 'Café Anis' }, 100_000)
  salvarCacheCardapio('outro', { ...exemplo, restauranteNome: 'Bistrô Central' }, 100_000)
  assert.equal(lerCacheCardapio('anis', 100_001)?.data.restauranteNome, 'Café Anis')
  assert.equal(lerCacheCardapio('outro', 100_001)?.data.restauranteNome, 'Bistrô Central')
  delete globalThis.sessionStorage
})

test('nome do restaurante usa tipografia com última palavra destacada', () => {
  assert.deepEqual(dividirNomeRestaurante('Café Anis'), { inicio: 'Café', destaque: 'Anis' })
  assert.deepEqual(dividirNomeRestaurante('  Padaria do Centro  '), { inicio: 'Padaria do', destaque: 'Centro' })
  assert.deepEqual(dividirNomeRestaurante('Bistrô'), { inicio: 'Bistrô', destaque: '' })
  assert.deepEqual(dividirNomeRestaurante('   '), { inicio: '', destaque: '' })
})
