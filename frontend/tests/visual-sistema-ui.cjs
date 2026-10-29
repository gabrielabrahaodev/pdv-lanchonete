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
  await page
    .context()
    .route('**/*', (r) =>
      new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
    )
  await page.context().route('**/src/context/AuthContext.tsx', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: `export const AuthProvider=({children})=>children;export const useAuth=()=>{const papel=localStorage.getItem('wiki-role')||'admin';const sem=sessionStorage.getItem('wiki-sem')==='1';const me={uid:'u',restaurantId:sem?null:'r',papel,restaurantNome:'Restaurante simulado',perfil:{nome:'Operador',tema:'claro'},souDono:!sem};return {me:location.pathname==='/login'?null:me,fbUser:location.pathname==='/login'?null:{uid:'u',email:'teste@example.invalid'},loading:false,logout:async()=>{},refreshMe:async()=>{}}}`,
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
      body: 'export const AtualizacaoPwa=()=>null;export const VersaoAppCard=()=>null',
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

async function dadosVisuais(page) {
  await preparar(page)
  const produto = {
    id: 'p1',
    nome: 'Café com leite especial da casa',
    preco: 12.5,
    ativo: true,
    categoriaId: 'c1',
    ingredientes: [],
    variacoes: [],
    precisaPreparar: false,
  }
  const categoria = {
    id: 'c1',
    nome: 'Cafés e bebidas especiais',
    ordem: 1,
    ativo: true,
    icone: '☕',
  }
  const sessao = {
    id: 's1',
    abertoEm: '2026-10-28T12:00:00Z',
    criadoEm: '2026-10-28T12:00:00Z',
    fechadoEm: '2026-10-28T20:00:00Z',
    valorInicial: 100,
    totalVendas: 250,
    totalRecebido: 250,
    suprimentos: 0,
    sangrias: 0,
    status: 'aberto',
    resumoFechamento: { esperadoEmCaixa: 350, valorContado: 350, diferenca: 0 },
  }
  const pedido = {
    id: 'p1',
    status: 'aberto',
    tipo: 'balcao',
    itens: [
      {
        id: 'i1',
        produtoId: 'p1',
        produtoNome: produto.nome,
        qtd: 1,
        precoUnitario: 12.5,
        subtotal: 12.5,
        status: 'pendente',
        observacoes: 'Sem açúcar',
      },
    ],
    pagamentos: [],
    total: 12.5,
    criadoEm: '2026-10-28T12:00:00Z',
  }
  const nomes = [
    ...fs
      .readFileSync('src/hooks/useFirestore.ts', 'utf8')
      .matchAll(/export (?:function|const) (use\w+)/g),
  ].map((x) => x[1])
  const dados = {
    useProdutos: [produto],
    useCategorias: [categoria],
    useMesas: [{ id: 'm1', numero: 1, status: 'livre' }],
    useMesa: { id: 'm1', numero: 1, status: 'livre' },
    usePedido: pedido,
    useSessaoAtual: sessao,
    useSessoes: [sessao, { ...sessao, id: 's2', status: 'fechado' }],
    useCozinhaFila: [pedido],
    useVendasBalcao: [pedido],
    useDeliveryHistorico: [
      {
        id: 'd1',
        clienteNome: 'Cliente de teste',
        total: 25,
        status: 'delivered',
        criadoEm: pedido.criadoEm,
      },
    ],
    useEstoque: [
      {
        id: 'e1',
        nome: 'Café em grãos',
        unidade: 'g',
        quantidadeAtual: 500,
        minimo: 1000,
        ativo: true,
        custoMedio: 0.05,
      },
    ],
  }
  await page.context().route('**/src/hooks/useFirestore.ts', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body:
        'const dados=' +
        JSON.stringify(dados) +
        ';' +
        nomes
          .map(
            (n) =>
              `export const ${n}=()=>${n === 'useRealtimeStatus' ? 'true' : `({data:dados[${JSON.stringify(n)}]??${n === 'usePedidoAbertoDaMesa' ? 'null' : '[]'},isLoading:false,isError:false,error:null})`}`,
          )
          .join(';'),
    }),
  )
  // Patch only fixture responses, never real API requests.
  await page.context().route('**/src/lib/api.ts', async (r) => {
    let body = `window.calls=[];export const API_BASE='';export class ApiError extends Error{};export async function api(p,opts={}){window.calls.push({path:p,...opts});if(p==='/fornecedores')return [{id:'f1',nome:'Fornecedor de alimentos da cidade',ativo:true,documento:'00.000.000/0001-00',email:'contato@example.invalid'}];if(p==='/sistema/convites')return [{id:'convite-de-teste-codigo-comprido',status:'ativa',expiraEm:'2026-11-01T12:00:00Z'}];if(p.startsWith('/bi/visao-geral'))return ${JSON.stringify(dadosPainel)};if(p.startsWith('/bi/contas-a-pagar'))return {items:[],incompleto:false,resumo:{total:0,vencidas:0,quantidadeVencidas:0,semVencimento:0,aVencer7:0,aVencer30:0,aVencer90:0}};if(p==='/configuracoes')return {nome:'Restaurante simulado',endereco:'Rua de teste',moeda:'BRL',timezone:'America/Sao_Paulo'};if(p.includes('/pagina'))return {items:[],nextCursor:null};if(p.startsWith('/produtos/'))return ${JSON.stringify(produto)};if(p.startsWith('/relatorios/'))return {totalPedidos:0,faturamentoBruto:0,ticketMedio:0,vendasPorHora:{},vendasPorFormaPagamento:{},topProdutos:[],topCategorias:[]};return []}`
    await r.fulfill({ contentType: 'application/javascript', body })
  })
}
async function abrirTela(page, rota) {
  await page.goto(
    base + '/tests/browser/wiki.html?rota=' + encodeURIComponent(rota),
  )
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  assert.equal(
    new URL(page.url()).pathname,
    rota,
    'A tela deve ser a rota solicitada',
  )
  await page
    .locator('.pdv-button,.action-button,input')
    .first()
    .waitFor({ state: 'attached' })
  await page.evaluate(() => document.fonts.ready)
}
;(async () => {
  const servidor = await require('./wiki-servidor.cjs').iniciarServidor()
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  })
  try {
    const rotas = [
      '/login',
      '/caixa',
      '/mesas',
      '/produtos',
      '/produtos/novo',
      '/produtos/editar/p1',
      '/categorias',
      '/producao',
      '/estoque',
      '/reposicao',
      '/reposicao/recebidos',
      '/reposicao/cancelados',
      '/cozinha',
      '/delivery',
      '/relatorios',
      '/relatorios/fechamento-caixa',
      '/fornecedores',
      '/financeiro',
      '/minha-conta',
      '/configuracoes',
      '/plataforma',
      '/select-restaurant',
      '/caixa/mesa/m1',
      '/caixa/novo-pedido/m1',
      '/caixa/venda-direta',
      '/caixa/pagamento/p1',
      '/wiki',
    ]
    for (const width of [320, 390, 768, 1024, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      })
      const page = await context.newPage(),
        erros = []
      page.on('pageerror', (e) => erros.push(e.message))
      await dadosVisuais(page)
      for (const rota of rotas) {
        await abrirTela(page, rota)
        for (const dark of [false, true]) {
          await page.evaluate(
            (d) => document.documentElement.classList.toggle('dark', d),
            dark,
          )
          const overflow = await page.evaluate(() => ({
            body: document.documentElement.scrollWidth > innerWidth,
            main: [...document.querySelectorAll('main')].some(
              (m) => m.scrollWidth > m.clientWidth + 1,
            ),
          }))
          assert.deepEqual(
            overflow,
            { body: false, main: false },
            `${rota} ${width}px ${dark ? 'escuro' : 'claro'}: overflow`,
          )
        }
        assert.equal(
          await page.locator('a button,button a').count(),
          0,
          rota + ': controle interativo aninhado',
        )
        if (
          [
            '/caixa',
            '/categorias',
            '/produtos',
            '/cozinha',
            '/financeiro',
          ].includes(rota) &&
          [390, 1440].includes(width)
        ) {
          await page.screenshot({
            path: `/tmp/pdv-visual-${rota.slice(1)}-${width}.png`,
            fullPage: true,
            animations: 'disabled',
          })
        }
      }
      assert.deepEqual(erros, [], width + 'px: erros de renderização')
      // Categoria: registro compacto no celular, tabela no desktop, mesmos controles.
      await abrirTela(page, '/categorias')
      assert.equal(
        await page
          .locator('td[data-label="Categoria"]')
          .evaluate((e) => getComputedStyle(e).display),
        width < 1024 ? 'flex' : 'table-cell',
      )
      await page.getByRole('button', { name: 'Editar', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      await dialog.getByRole('textbox').first().fill('Nome em edição')
      assert.equal(
        await dialog.getByRole('textbox').first().inputValue(),
        'Nome em edição',
      )
      await page.keyboard.press('Escape')
      assert.equal(await dialog.count(), 0)
      // Comanda continua acessível sem percorrer catálogo.
      await abrirTela(page, '/caixa/venda-direta')
      await page.getByRole('button', { name: /Adicionar .* à comanda/ }).click()
      if (width < 1024) {
        const ver = page.getByRole('button', { name: /Ver comanda,/ })
        const box = await ver.boundingBox()
        assert.ok(
          box && box.y + box.height <= 1000 && box.height >= 44,
          'Comanda visível e alvo confortável',
        )
        await ver.click()
        await page.getByRole('dialog', { name: 'Comanda' }).waitFor()
        await page
          .getByRole('button', { name: 'Fechar comanda', exact: true })
          .last()
          .click()
      } else {
        assert.ok(
          await page
            .getByRole('complementary', { name: 'Comanda' })
            .isVisible(),
        )
      }
      assert.equal(
        await page.evaluate(() =>
          window.calls.some((c) => typeof c === 'object' && c.method),
        ),
        false,
        'Sem escrita antes da confirmação',
      )
      await context.close()
      console.log(
        `PASS ${width}px: ${rotas.length} telas, claro/escuro, sem overflow, sem controles aninhados, edição e comanda`,
      )
    }
  } finally {
    await browser.close()
    servidor.kill()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
