import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(raiz, 'src/wiki')
const manifesto = JSON.parse(fs.readFileSync(path.join(dir, 'manifesto.json')))
const texto = (v) =>
  typeof v === 'string'
    ? v
    : Array.isArray(v)
      ? v.map(texto).join(' ')
      : Object.values(v).map(texto).join(' ')
const entradas = manifesto.artigos.map((m) => {
  const a = JSON.parse(
    fs.readFileSync(
      path.join(dir, `conteudo/${m.categoria}/wiki-artigo-${m.id}.json`),
    ),
  )
  return {
    id: m.id,
    titulo: m.titulo,
    palavras: m.palavrasChave.join(' '),
    texto: texto(a),
  }
})
const esperado = JSON.stringify(entradas) + '\n'
const arquivo = path.join(dir, 'indice/busca.json')
if (process.argv.includes('--check')) {
  if (fs.readFileSync(arquivo, 'utf8') !== esperado)
    throw Error('Indice desatualizado: npm run wiki:indice')
} else fs.writeFileSync(arquivo, esperado)

const compacto = {
  categorias: manifesto.categorias,
  secoes: manifesto.secoes,
  artigos: manifesto.artigos.map(({ id, titulo, categoria, perfis }) => ({
    id,
    titulo,
    categoria,
    perfis,
  })),
  telas: manifesto.telas.map(({ rota, nome, artigo, acesso }) => ({
    rota,
    nome,
    artigo,
    acesso,
  })),
}
const mapa = path.join(dir, 'navegacao/mapa.json'),
  esperadoMapa = JSON.stringify(compacto) + '\n'
if (process.argv.includes('--check')) {
  if (fs.readFileSync(mapa, 'utf8') !== esperadoMapa)
    throw Error('Mapa desatualizado: npm run wiki:indice')
} else fs.writeFileSync(mapa, esperadoMapa)
