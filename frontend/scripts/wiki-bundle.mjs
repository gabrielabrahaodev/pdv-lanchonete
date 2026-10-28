import fs from 'node:fs'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
const assets = 'dist/assets'
const nomes = fs.readdirSync(assets)
const artigo = nomes.filter((n) => /^wiki-artigo-.+\.js$/.test(n))
const m = JSON.parse(fs.readFileSync('src/wiki/manifesto.json'))
assert.equal(artigo.length, m.artigos.length)
for (const prefixo of ['index-', 'AppAutenticado-']) {
  const arquivos = nomes.filter(
    (n) => n.startsWith(prefixo) && n.endsWith('.js'),
  )
  for (const n of arquivos) {
    const s = fs.readFileSync(assets + '/' + n, 'utf8')
    assert.ok(
      !s.includes('Custo R$ 10 + acréscimo 50%'),
      'corpo de artigo no bundle inicial',
    )
    assert.ok(
      !s.includes('como receber mercadoria'),
      'indice de pesquisa no bundle inicial',
    )
  }
}
const sw = fs.readFileSync('dist/sw.js', 'utf8')
for (const n of artigo)
  assert.ok(!sw.includes(n), 'artigo entrou no precache: ' + n)
assert.ok(sw.includes('wiki-artigos'))
const resumo = {
  artigosEmChunks: artigo.length,
  artigosNoPrecache: 0,
  assets: nomes
    .filter((n) =>
      /^AppAutenticado-|^WikiPage-|^WikiOverlay-|^index-.*\.js$/.test(n),
    )
    .map((n) => ({
      arquivo: n,
      bytes: fs.statSync(assets + '/' + n).size,
      gzip: gzipSync(fs.readFileSync(assets + '/' + n)).length,
    })),
  totalArtigosBytes: artigo.reduce(
    (n, f) => n + fs.statSync(assets + '/' + f).size,
    0,
  ),
}
console.log(JSON.stringify(resumo, null, 2))
