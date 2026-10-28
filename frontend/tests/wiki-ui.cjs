const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict'),
  fs = require('node:fs')
const manifest = JSON.parse(fs.readFileSync('src/wiki/manifesto.json', 'utf8'))
const base = process.env.WIKI_TEST_URL || 'http://127.0.0.1:5173'
const dadosPainel = {
  inicio: '2026-10-01',
  fim: '2026-10-28',
  indicadores: {
    coberturaCompleta: false,
    lucroBruto: null,
    margemBruta: null,
    margemCoberta: null,
    cmvPercentual: null,
    operacionaisPercentual: null,
    coberturaReceitaPercentual: null,
    variacaoDespesasPercentual: null,
    alertas: [],
  },
  variacoes: [],
  atual: {
    receita: 0,
    vendas: 0,
    ticketMedio: null,
    despesas: 0,
    compras: 0,
    operacionais: 0,
    cmvConhecido: null,
    lucroBrutoCoberto: null,
    resultadoGerencial: null,
    variacaoPercentual: null,
    categorias: {},
    formas: {},
    fornecedores: {},
    fornecedorNomes: {},
  },
  anterior: { receita: 0 },
  produtos: [],
  evolucao: [],
  cobertura: {
    vendasComBI: 0,
    vendasTotais: 0,
    diasComAgregado: 0,
    diasSolicitados: 28,
  },
  previsao: {
    disponivel: false,
    motivo: 'Sem dados suficientes',
    observacoes: 0,
  },
  limitacoes: [],
  leiturasEstimadasMaximas: 60,
}
async function preparar(page) {
  await page.context().route('**/*', (r) =>
    new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
  )
  await page.context().route('**/src/context/AuthContext.tsx', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: `export const AuthProvider=({children})=>children;export const useAuth=()=>{const papel=localStorage.getItem('wiki-role')||'admin';const sem=sessionStorage.getItem('wiki-sem')==='1';const me={uid:'u',restaurantId:sem?null:'r',papel,restaurantNome:'Restaurante simulado',perfil:{nome:'Operador',tema:'claro'},souDono:!sem};return {me,fbUser:{uid:'u',email:'teste@example.invalid'},loading:false,logout:async()=>{},refreshMe:async()=>{}}}`,
    }),
  )
  await page.context().route('**/src/context/ThemeContext.tsx', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: `export const ThemeProvider=({children})=>children;export const useTheme=()=>({tema:'claro',setTema:()=>{}})`,
    }),
  )
  await page.context().route('**/src/components/AtualizacaoPwa.tsx', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: 'export const AtualizacaoPwa=()=>null',
    }),
  )
  const hooks = fs.readFileSync('src/hooks/useFirestore.ts', 'utf8')
  const nomes = [...hooks.matchAll(/export (?:function|const) (use\w+)/g)].map(
    (x) => x[1],
  )
  await page.context().route('**/src/hooks/useFirestore.ts', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: nomes
        .map(
          (n) =>
            `export const ${n}=()=>${n === 'useRealtimeStatus' ? 'true' : `({data:${n === 'useMesa' ? JSON.stringify({ id: 'm1', numero: 1, status: 'livre' }) : n === 'usePedido' ? JSON.stringify({ id: 'p1', status: 'aberto', itens: [], pagamentos: [], total: 10, tipo: 'balcao', criadoEm: '2026-10-28T12:00:00Z' }) : n === 'useSessaoAtual' || n === 'usePedidoAbertoDaMesa' ? 'null' : '[]'},isLoading:false,isError:false,error:null})`}`,
        )
        .join(';'),
    }),
  )
  await page.context().route('**/src/lib/api.ts', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: `window.calls=window.calls||[];export const API_BASE='';export class ApiError extends Error{};export async function api(p){window.calls.push(p);if(p.startsWith('/bi/visao-geral'))return ${JSON.stringify(dadosPainel)};if(p.startsWith('/bi/contas-a-pagar'))return {items:[],incompleto:false,resumo:{total:0,vencidas:0,quantidadeVencidas:0,semVencimento:0,aVencer7:0,aVencer30:0,aVencer90:0}};if(p==='/configuracoes')return {nome:'Simulado',endereco:'Rua de teste',moeda:'BRL',timezone:'America/Sao_Paulo'};if(p.includes('/pagina'))return {items:[],nextCursor:null};if(p.startsWith('/produtos/'))return {id:'p1',nome:'Produto simulado',preco:10,ativo:true,categoriaId:'c1',ingredientes:[],variacoes:[]};if(p.startsWith('/relatorios/'))return {totalPedidos:0,faturamentoBruto:0,ticketMedio:0,vendasPorHora:{},vendasPorFormaPagamento:{},topProdutos:[],topCategorias:[]};return []}`,
    }),
  )
}
async function abrir(page, rota) {
  await page.goto(
    base + '/tests/browser/wiki.html?rota=' + encodeURIComponent(rota),
  )
  try {
    await page
      .getByRole('link', { name: /Como usar esta tela\?/ })
      .first()
      .waitFor({ timeout: 10000 })
  } catch (e) {
    console.error(
      'URL',
      page.url(),
      'BODY',
      (await page.locator('body').innerText()).slice(0, 1800),
    )
    throw e
  }
}

async function ajuda(page, id) {
  const origem = new URL(page.url()).pathname
  const [wiki] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('link', { name: /Como usar esta tela\?/ }).first().click(),
  ])
  await wiki.getByRole('heading', { name: 'Para que serve?', exact: true }).waitFor()
  assert.equal(new URL(wiki.url()).pathname, '/wiki/' + id)
  assert.equal(new URL(page.url()).pathname, origem)
  return wiki
}
;(async () => {
  const servidor = process.env.WIKI_TEST_URL ? null : await require('./wiki-servidor.cjs').iniciarServidor()
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']})
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}})
    const page = await context.newPage()
    await preparar(page)
    const errors = []
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)))
    for (const t of manifest.telas.filter(t => t.ajuda && (!process.env.WIKI_TEST_FAST || t.artigo === 'estoque'))) {
      const rota = t.rota.replace(/:[^/]+/g, 'simulado')
      await abrir(page, rota)
      const wiki = await ajuda(page, t.artigo)
      await wiki.close()
      assert.equal(new URL(page.url()).pathname, rota)
    }
    console.log('PASS: ajuda contextual em nova aba sem sair da tela original')

    await abrir(page, '/produtos/novo')
    await page.getByText('Nome', { exact:true }).locator('..').getByRole('textbox').fill('Rascunho preservado')
    await page.getByRole('button', {name:'Precificação',exact:true}).click()
    const wikiProduto = await ajuda(page, 'precificacao')
    await wikiProduto.close()
    await page.getByRole('button', {name:'Dados do produto',exact:true}).click()
    assert.equal(await page.getByText('Nome', { exact:true }).locator('..').getByRole('textbox').inputValue(), 'Rascunho preservado')

    await abrir(page, '/estoque')
    await page.getByRole('button', {name:'Novo insumo',exact:true}).click()
    const modal = page.getByRole('dialog')
    await modal.getByRole('textbox').first().fill('Farinha em edição')
    const [wikiInsumo] = await Promise.all([
      context.waitForEvent('page'),
      modal.getByRole('link', {name:/Como cadastrar este insumo\?/}).click(),
    ])
    await wikiInsumo.getByRole('heading', {name:'Para que serve?',exact:true}).waitFor()
    await wikiInsumo.close()
    assert.equal(await modal.getByRole('textbox').first().inputValue(), 'Farinha em edição')
    await page.keyboard.press('Escape')
    console.log('PASS: formulários e modais preservados na aba original')

    for (const width of (process.env.WIKI_TEST_FAST ? [320] : [320,360,390,430,768,1440])) {
      await page.setViewportSize({width,height:1000})
      await abrir(page, '/financeiro')
      for (const sec of ['Resultados','Lucratividade por produto','Contas a pagar']) {
        if (width < 768) await page.getByRole('combobox', {name:'Seção do financeiro'}).selectOption({label:sec})
        else await page.getByRole('button', {name:sec,exact:true}).click()
        const wiki = await ajuda(page, manifest.secoes.financeiro[sec])
        await wiki.setViewportSize({width,height:1000})
        for (const dark of [false,true]) {
          await wiki.evaluate(d => document.documentElement.classList.toggle('dark',d),dark)
          assert.equal(await wiki.evaluate(() => document.documentElement.scrollWidth > innerWidth),false)
        }
        await wiki.close()
      }
      await abrir(page, '/estoque')
      const wiki=await ajuda(page,'estoque')
      const chamadasAntes=await wiki.evaluate(() => (window.calls||[]).length)
      await wiki.getByRole('searchbox').fill('como receber mercadoria')
      await wiki.getByRole('region', {name:'Resultados da pesquisa'})
        .getByRole('link', {name:'Receber mercadorias e compra retroativa'}).click()
      await wiki.getByRole('heading', {name:'Receber mercadorias e compra retroativa',exact:true}).waitFor()
      assert.equal(await wiki.evaluate(() => (window.calls||[]).length),chamadasAntes)
      await wiki.getByRole('link', {name:'Campos da tela',exact:true}).click()
      await wiki.waitForURL(url => url.hash === '#campos')
      await wiki.close()
      console.log('PASS '+width+'px: ajuda em aba nova, busca, âncora e responsividade')
    }
    assert.deepEqual(errors,[])
    await context.close()
  } finally { await browser.close();servidor?.kill() }
})().catch(e=>{console.error(e);process.exit(1)})
