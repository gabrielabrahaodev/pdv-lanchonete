import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import { conteudoIgual } from '../scripts/wiki-indice-comparacao.mjs'
import { buscar, destacar, normalizar } from '../.test-build/busca/busca.js'
import {
  artigoDaSecao,
  podeLer,
  podeVoltar,
  origemValida,
  memorizarConsulta,
  consultaDaOrigem,
} from '../.test-build/navegacao/contexto.js'
const raiz = path.resolve('..'),
  dir = path.resolve('src/wiki')
const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifesto.json')))
const indice = JSON.parse(fs.readFileSync(path.join(dir, 'indice/busca.json')))
const artigos = m.artigos.map((meta) =>
  JSON.parse(
    fs.readFileSync(
      path.join(dir, `conteudo/${meta.categoria}/wiki-artigo-${meta.id}.json`),
    ),
  ),
)
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8')
const admin = { uid: 'u', restaurantId: 'r', papel: 'admin' },
  garcom = { ...admin, papel: 'garcom' }
function rotas(p) {
  const ast = ts.createSourceFile(
      p,
      ler(p),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
    result = []
  function visitar(n) {
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      if (n.tagName.getText(ast) === 'Route')
        for (const a of n.attributes.properties)
          if (
            ts.isJsxAttribute(a) &&
            a.name.getText(ast) === 'path' &&
            a.initializer &&
            ts.isStringLiteral(a.initializer)
          )
            result.push(a.initializer.text)
    }
    ts.forEachChild(n, visitar)
  }
  visitar(ast)
  return result
}
test('inventario cobre rotas funcionais e ajuda privada', () => {
  const atuais = [
    ...rotas('frontend/src/App.tsx'),
    ...rotas('frontend/src/AppAutenticado.tsx'),
  ]
    .filter(
      (p) => !['/*', '*', '/wiki', ':artigoId', '/wiki/:artigoId?'].includes(p),
    )
    .map((p) => '/' + p.replace(/^\//, ''))
  assert.deepEqual(
    [...new Set(atuais)].sort(),
    m.telas.map((t) => t.rota).sort(),
  )
  for (const t of m.telas) {
    assert.ok(
      m.artigos.some((a) => a.id === t.artigo),
      t.rota,
    )
    if (t.ajuda)
      assert.match(
        ler(t.componente),
        /<(?:PageHeader|AjudaContextual)\b/,
        t.rota,
      )
    else assert.ok(t.excecao.length > 30)
  }
  const layout = ler('frontend/src/components/layout/AppLayout.tsx')
  assert.match(layout, /to: '\/wiki'[\s\S]*?\},\s*\{ to: '\/configuracoes'/)
  assert.match(layout, /<AjudaContextual artigo=\{ajuda\}/)
  console.log(
    JSON.stringify({
      rotas: atuais.length,
      telasDocumentaveis: m.telas.length,
      artigos: artigos.length,
      telasComAjuda: m.telas.filter((t) => t.ajuda).length,
      naoCobertas: [],
      excecoes: m.telas.filter((t) => !t.ajuda).map((t) => t.rota),
    }),
  )
})
test('estrutura, fontes, IDs, categorias e links validos', () => {
  assert.equal(new Set(m.artigos.map((a) => a.id)).size, m.artigos.length)
  assert.equal(new Set(artigos.map((a) => a.id)).size, artigos.length)
  assert.equal(
    fs
      .readdirSync(path.join(dir, 'conteudo'), { recursive: true })
      .filter((p) => String(p).endsWith('.json')).length,
    artigos.length,
  )
  for (const [i, a] of artigos.entries()) {
    const meta = m.artigos[i]
    assert.equal(meta.id, a.id)
    assert.equal(meta.titulo, a.titulo)
    assert.ok(m.categorias[meta.categoria])
    assert.ok(meta.palavrasChave.some(Boolean))
    assert.ok(meta.perfis.length)
    for (const f of [...meta.componentes, ...meta.fontesObsidian])
      assert.ok(fs.existsSync(path.join(raiz, f)), f)
    for (const key of ['id', 'titulo', 'para', 'quando', 'depois'])
      assert.ok(typeof a[key] === 'string' && a[key].trim().length, key)
    for (const key of [
      'passos',
      'campos',
      'acoes',
      'atencao',
      'duvidas',
      'exemplos',
      'relacionados',
    ])
      assert.ok(Array.isArray(a[key]) && a[key].length, key)
    assert.equal(new Set(a.campos.map(c => c.nome)).size, a.campos.length, `${a.id}: campo repetido`)
    for (const c of a.campos) {
      for (const k of ['nome', 'preenchimento', 'obrigatorio']) assert.ok(c[k]?.trim())
      for (const k of ['calculo', 'exemplo', 'indisponivel'])
        if (c[k] !== undefined) assert.ok(typeof c[k] === 'string' && c[k].trim(), `${a.id}: ${k} inválido`)
    }
    for (const c of a.exemplos)
      for (const k of ['titulo', 'cenario', 'resultado', 'interpretacao']) assert.ok(c[k]?.trim(), `${a.id}: exemplo sem ${k}`)
    for (const c of a.acoes)
      for (const k of ['nome', 'efeito']) assert.ok(c[k]?.trim())
    for (const c of a.duvidas)
      for (const k of ['pergunta', 'resposta']) assert.ok(c[k]?.trim())
    assert.deepEqual(a.relacionados, meta.relacionados)
    for (const id of a.relacionados)
      assert.ok(
        m.artigos.some((a) => a.id === id),
        id,
      )
    assert.ok(
      meta.componentes.some(
        (c) =>
          m.telas.some((t) => t.componente === c) ||
          c === 'frontend/src/AppAutenticado.tsx' ||
          c === 'frontend/src/components/AtualizacaoPwa.tsx',
      ),
    )
  }
  execFileSync(process.execPath, ['scripts/wiki-indice.mjs', '--check'])
})
test('abas reais e links contextuais tem artigo ou ancora', () => {
  const casos = [
    [
      'financeiro',
      'frontend/src/pages/financeiro/FinanceiroBI.tsx',
      /const seccoes=\[([^\]]+)\]/,
    ],
    [
      'produto',
      'frontend/src/pages/produtos/ProdutoFormPage.tsx',
      /useState<'dados' \| 'precificacao'>/,
    ],
    [
      'reposicao',
      'frontend/src/pages/estoque/ReposicaoPage.tsx',
      /useState<'gerar' \| 'gerados'>/,
    ],
    [
      'producao',
      'frontend/src/pages/producao/ProducaoPage.tsx',
      /useState<'disponiveis' \| 'produzir' \| 'historico'>/,
    ],
  ]
  for (const [grupo, p, regex] of casos) {
    const fonte = ler(p),
      match = fonte.match(regex)
    assert.ok(match, p)
    const chaves = [...(match[1] ?? match[0]).matchAll(/'([^']+)'/g)].map(
      (x) => x[1],
    )
    assert.deepEqual(chaves.sort(), Object.keys(m.secoes[grupo]).sort())
    assert.ok(fonte.includes(`artigoDaSecao('${grupo}',`))
    for (const chave of chaves)
      assert.ok(m.artigos.some((a) => a.id === artigoDaSecao(grupo, chave)))
  }
  for (const p of fs
    .readdirSync(path.resolve('src/pages'), { recursive: true })
    .filter((p) => String(p).endsWith('.tsx'))) {
    const fonte = fs.readFileSync(path.resolve('src/pages', p), 'utf8')
    for (const match of fonte.matchAll(
      /<AjudaContextual\s+artigo="([^"]+)"(?:\s+ancora="([^"]+)")?/g,
    )) {
      assert.ok(
        m.artigos.some((a) => a.id === match[1]),
        p,
      )
      if (match[2])
        assert.ok(
          [
            'para-que-serve',
            'quando-utilizar',
            'como-utilizar',
            'campos',
            'acoes',
            'depois',
            'exemplos',
            'atencao',
            'duvidas',
            'veja-tambem',
          ].includes(match[2]),
        )
    }
  }
})
test('busca por acentos, caixa, sinonimos, perguntas e campos', () => {
  assert.equal(normalizar('PRECIFICAÇÃO'), 'precificacao')
  assert.equal(
    buscar(indice, 'precificação')[0].id,
    buscar(indice, 'PRECIFICACAO')[0].id,
  )
  for (const [q, id] of [
    ['como receber mercadoria', 'recebimento'],
    ['custo por quilo', 'unidades'],
    ['como pagar uma despesa', 'despesas'],
    ['o que é CMV', 'resultados'],
    ['preço sugerido', 'precificacao'],
    ['lucratividade por produto', 'lucratividade'],
    ['como fechar o caixa', 'fechamento-caixa'],
  ])
    assert.ok(
      buscar(indice, q)
        .slice(0, 5)
        .some((a) => a.id === id),
      q,
    )
  assert.deepEqual(buscar(indice, 'zxqv13371337'), [])
  assert.ok(destacar('Precificação', 'precificacao').some((p) => p.destaque))
  assert.equal(
    destacar('<script>', 'script')
      .map((p) => p.texto)
      .join(''),
    '<script>',
  )
})
test('permissoes, troca de conta/tenant e retorno seguro', () => {
  const fin = m.artigos.find((a) => a.id === 'resultados'),
    plat = m.artigos.find((a) => a.id === 'plataforma')
  assert.equal(podeLer(fin, garcom), false)
  assert.equal(podeLer(fin, admin), true)
  assert.equal(podeLer(plat, admin), false)
  assert.equal(podeLer(plat, { uid: 'd', souDono: true }), true)
  assert.equal(podeVoltar('/financeiro', garcom), false)
  assert.equal(podeVoltar('/estoque', garcom), true)
  for (const p of [
    '//evil.test',
    'https://evil.test',
    '/estoque?redirect=1',
    '/nao-existe',
    '/m/r/m',
  ])
    assert.equal(podeVoltar(p, admin), false)
  const origemWiki = {
    pathname: '/estoque',
    search: '',
    hash: '',
    key: 'k',
    state: null,
    uid: 'u',
    rid: 'r',
    nome: 'Estoque',
  }
  assert.ok(origemValida({ origemWiki }, admin))
  for (const mudanca of [{ uid: 'outro' }, { restaurantId: 'outro' }])
    assert.equal(origemValida({ origemWiki }, { ...admin, ...mudanca }), null)
  assert.equal(
    origemValida(
      { origemWiki: { ...origemWiki, search: '?t=segredo' } },
      admin,
    ),
    null,
  )
})
test('sem Firebase/API no conteudo/busca; Wiki e artigos lazy', () => {
  for (const f of fs
    .readdirSync(dir, { recursive: true })
    .filter((p) => /\.tsx?$/.test(String(p)))) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8')
    assert.doesNotMatch(
      s,
      /from\s+['"][^'"]*(?:firebase|lib\/api|hooks\/useFirestore)/,
    )
    assert.doesNotMatch(s, /\b(?:onSnapshot|fetch|getDocs|getDoc)\s*\(/)
  }
  assert.match(ler('frontend/src/wiki/WikiPage.tsx'), /import\.meta\.glob/)
  assert.doesNotMatch(ler('frontend/src/wiki/WikiPage.tsx'), /eager:\s*true/)
  assert.match(
    ler('frontend/src/AppAutenticado.tsx'),
    /lazy\(\(\) => import\('\.\/wiki\/WikiPage'\)\)/,
  )
})

test('query privada da origem e efemera, limitada a sessao/tenant/rota',()=>{
 const o={pathname:'/select-restaurant',search:'',hash:'',key:'onboarding',state:null,uid:'u',rid:null,nome:'Criar restaurante'}
 memorizarConsulta(o.key,o.uid,o.rid,o.pathname,'?t=CONVITE_SIMULADO')
 assert.equal(consultaDaOrigem(o),'?t=CONVITE_SIMULADO')
 assert.equal(o.search,'')
 assert.equal(consultaDaOrigem({...o,uid:'outro'}),'')
 assert.equal(consultaDaOrigem({...o,rid:'outro'}),'')
 assert.equal(consultaDaOrigem({...o,pathname:'/estoque'}),'')
})

test('indice da Wiki aceita somente diferencas LF/CRLF no Windows', () => {
  const exemplo = '{"artigos":[{"id":"inicio"}]}\n'
  assert.equal(conteudoIgual(exemplo, exemplo.replace(/\n/g, '\r\n')), true)
  assert.equal(conteudoIgual('linha1\r\nlinha2\n', 'linha1\nlinha2\n'), true)
  assert.equal(conteudoIgual(exemplo, exemplo.replace('inicio', 'outra')), false)
  assert.equal(conteudoIgual(exemplo, exemplo.trimEnd()), false)
  assert.equal(conteudoIgual(exemplo, exemplo + ' '), false)
})
