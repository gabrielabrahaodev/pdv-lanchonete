const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { iniciarServidor } = require('./wiki-servidor.cjs')
const assert = require('node:assert/strict'),
  fs = require('node:fs')
const base = 'http://127.0.0.1:5173'
const itens = [
  {
    id: 'farinha',
    nome: 'Farinha de trigo',
    unidade: 'g',
    unidadeCompra: 'kg',
    fatorCompra: 1000,
    quantidadeAtual: 1200,
    minimo: 2000,
    custoMedio: 0.008,
    fornecedorId: 'f1',
    ativo: true,
  },
  {
    id: 'cafe',
    nome: 'Café em grãos',
    unidade: 'g',
    unidadeCompra: 'kg',
    fatorCompra: 1000,
    quantidadeAtual: 5000,
    minimo: 1000,
    custoMedio: 0.06,
    fornecedorId: 'f1',
    ativo: true,
  },
  {
    id: 'leite',
    nome: 'Leite integral',
    unidade: 'ml',
    quantidadeAtual: 0,
    minimo: 1000,
    custoMedio: 0.006,
    ativo: true,
  },
  {
    id: 'copo',
    nome: 'Copo descartável',
    unidade: 'un',
    quantidadeAtual: 100,
    minimo: 20,
    custoMedio: 0.15,
    ativo: true,
  },
  {
    id: 'acucar',
    nome: 'Açúcar refinado',
    unidade: 'g',
    quantidadeAtual: 5000,
    minimo: 1000,
    custoMedio: 0.005,
    ativo: false,
  },
  {
    id: 'chocolate',
    nome: 'Chocolate em pó para cobertura e confeitaria com descrição comprida',
    unidade: 'g',
    quantidadeAtual: -5,
    minimo: 500,
    custoMedio: 0.02,
    ativo: true,
  },
]
const movimentos = [
  {
    id: 'm1',
    itemId: 'farinha',
    tipo: 'entrada',
    qtd: 2000,
    criadoEm: '2026-10-28T12:00:00Z',
    observacao: 'Compra de teste',
  },
]
async function configurar(page, role = 'admin') {
  await page.route('**/*', (r) =>
    new URL(r.request().url()).origin === base ? r.continue() : r.abort(),
  )
  await page.route('**/src/context/AuthContext.tsx', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: `export const useAuth=()=>({me:{uid:'u',restaurantId:'simulado',papel:${JSON.stringify(role)},perfil:{nome:'Operador de teste'}},logout:async()=>{}})`,
    }),
  )
  await page.route('**/src/hooks/useFirestore.ts', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: `const snap=data=>({data,isLoading:false,isError:false,error:null});export const useEstoque=()=>snap(${JSON.stringify(itens)});export const useMovimentacoes=()=>snap(${JSON.stringify(movimentos)});export const useRealtimeStatus=()=>true;`,
    }),
  )
  await page.route('**/src/lib/api.ts', (r) =>
    r.fulfill({
      contentType: 'application/javascript',
      body: `window.apiCalls=[];export class ApiError extends Error{constructor(status,msg){super(msg);this.status=status}};export async function api(path,opts={}){window.apiCalls.push({path,...opts});if(opts.method&&window.falharMov&&path==='/estoque/movimentacoes'){window.falharMov=false;throw new ApiError(500,'Falha simulada de resposta')}if(path==='/fornecedores')return [{id:'f1',nome:'Fornecedor de alimentos',ativo:true}];if(path.startsWith('/estoque/movimentacoes'))return ${JSON.stringify(movimentos)};return {id:'simulado'}}`,
    }),
  )
  await page.goto(base + '/tests/browser/estoque-piloto.html')
  await page.getByRole('heading', { name: 'Estoque', exact: true }).waitFor()
}
;(async () => {
  const servidor = await iniciarServidor()
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  })
  try {
    for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        acceptDownloads: true,
      })
      const erros = []
      page.on('pageerror', (e) => erros.push(e.message))
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await configurar(page)
      const lista = page.getByRole('region', { name: 'Lista de insumos' })
      assert.equal(
        await lista.getByText('Açúcar refinado', { exact: true }).count(),
        0,
      )
      await page.getByRole('button', { name: /^Somente alertas/ }).click()
      await page
        .getByRole('status')
        .filter({ hasText: '3 insumos exibidos' })
        .waitFor()
      await page
        .getByRole('button', { name: 'Limpar filtros', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Incluir arquivados', exact: true })
        .click()
      await page
        .getByRole('status')
        .filter({ hasText: '6 insumos exibidos' })
        .waitFor()
      assert.equal(
        await page
          .getByRole('button', {
            name: 'Movimentar Açúcar refinado',
            exact: true,
          })
          .isDisabled(),
        true,
      )
      await page
        .getByRole('button', { name: 'Limpar filtros', exact: true })
        .click()
      await page.getByRole('textbox', { name: 'Buscar insumo' }).fill('zzznada')
      await page
        .getByRole('heading', { name: 'Nenhum insumo neste filtro' })
        .waitFor()
      await page.getByRole('button', { name: 'Ver todos os insumos' }).click()
      assert.equal(
        (await page.evaluate(() => window.apiCalls)).some((c) =>
          c.path.includes('item_id='),
        ),
        false,
      )
      await page
        .getByRole('button', {
          name: 'Histórico de Farinha de trigo',
          exact: true,
        })
        .click()
      await page.getByRole('dialog').getByText('Compra de teste').waitFor()
      await page.keyboard.press('Escape')
      assert.equal(
        (await page.evaluate(() => window.apiCalls)).filter((c) =>
          c.path.includes('item_id=farinha'),
        ).length,
        1,
      )
      await page
        .getByRole('button', { name: 'Editar Farinha de trigo', exact: true })
        .click()
      assert.equal(
        await page
          .getByRole('dialog')
          .getByRole('textbox', { name: 'Nome', exact: true })
          .inputValue(),
        'Farinha de trigo',
      )
      await page.keyboard.press('Escape')
      await page.getByRole('textbox', { name: 'Buscar insumo' }).fill('Café')
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Exportar CSV' }).click()
      const download = await downloadPromise
      const csv = fs.readFileSync(await download.path(), 'utf8')
      assert.ok(csv.includes('Café em grãos'))
      assert.ok(!csv.includes('Farinha de trigo'))
      await page.getByRole('button', { name: 'Limpar busca' }).click()
      for (const dark of [false, true]) {
        await page.evaluate(
          (d) => document.documentElement.classList.toggle('dark', d),
          dark,
        )
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        )
        assert.equal(
          await page
            .locator('#conteudo')
            .evaluate((e) => e.scrollWidth > e.clientWidth),
          false,
        )
        await page.locator('#conteudo').evaluate((e) => e.scrollTo(0, 0))
        await page.screenshot({
          path: `/tmp/estoque-piloto-${width}-${dark ? 'escuro' : 'claro'}.png`,
          fullPage: true,
          animations: 'disabled',
        })
      }
      if (width < 1024) {
        const size = await page
          .getByRole('button', {
            name: 'Movimentar Farinha de trigo',
            exact: true,
          })
          .boundingBox()
        assert.ok(size.width >= 44 && size.height >= 44)
      }
      await page
        .locator('summary')
        .filter({ hasText: 'Últimas movimentações' })
        .click()
      await page.getByText('Compra de teste').waitFor()
      assert.deepEqual(erros, [])
      await page.close()
      console.log(
        'PASS ' +
          width +
          'px: filtros, alertas, arquivados, histórico lazy, edição, CSV, temas e sem overflow',
      )
    }
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    })
    await configurar(page)
    await page
      .getByRole('button', { name: 'Movimentar Farinha de trigo', exact: true })
      .click()
    const modal = page.getByRole('dialog')
    await modal
      .getByRole('textbox', { name: 'Quantidade', exact: true })
      .fill('2')
    await modal
      .getByRole('textbox', { name: 'Valor total da compra (R$)' })
      .fill('16')
    await modal
      .getByRole('textbox', { name: 'Motivo / observação' })
      .fill('Recebimento de teste')
    await page.evaluate(() => (window.falharMov = true))
    await modal.getByRole('button', { name: 'Registrar movimentação' }).click()
    await modal.getByRole('alert').waitFor()
    assert.equal(
      await modal
        .getByRole('textbox', { name: 'Quantidade', exact: true })
        .isDisabled(),
      true,
    )
    await modal
      .getByRole('button', { name: 'Conferir o mesmo lançamento' })
      .click()
    await modal.waitFor({ state: 'hidden' })
    const calls = await page.evaluate(() =>
      window.apiCalls.filter(
        (c) => c.method === 'POST' && c.path === '/estoque/movimentacoes',
      ),
    )
    assert.equal(calls.length, 2)
    assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey)
    assert.deepEqual(calls[0].body, calls[1].body)
    assert.deepEqual(calls[0].body, {
      tipo: 'entrada',
      itemId: 'farinha',
      qtd: 2,
      unidade: 'kg',
      observacao: 'Recebimento de teste',
      valorTotalCompra: 16,
    })
    page.on('dialog', (d) => d.accept())
    await page
      .getByRole('button', { name: 'Arquivar Farinha de trigo', exact: true })
      .click()
    await page.waitForFunction(() =>
      window.apiCalls.some(
        (c) => c.path === '/estoque/itens/farinha' && c.method === 'PATCH',
      ),
    )
    assert.deepEqual(
      await page.evaluate(
        () => window.apiCalls.find((c) => c.method === 'PATCH').body,
      ),
      { ativo: false },
    )
    await page.getByRole('button', { name: 'Novo insumo', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('textbox', { name: 'Nome', exact: true })
      .fill('Insumo teste')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Salvar insumo' })
      .click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.ok(
      (await page.evaluate(() => window.apiCalls)).some(
        (c) =>
          c.method === 'POST' &&
          c.path === '/estoque/itens' &&
          c.body.nome === 'Insumo teste',
      ),
    )
    await page.close()
    console.log(
      'PASS: entrada comercial, repetição idempotente, arquivar e criar com API simulada',
    )
    const viewer = await browser.newPage({
      viewport: { width: 390, height: 1000 },
    })
    await configurar(viewer, 'garcom')
    assert.equal(
      await viewer
        .getByRole('button', { name: 'Novo insumo', exact: true })
        .count(),
      0,
    )
    assert.equal(
      await viewer
        .getByRole('button', {
          name: 'Movimentar Farinha de trigo',
          exact: true,
        })
        .count(),
      0,
    )
    assert.equal(
      (await viewer.evaluate(() => window.apiCalls)).some(
        (c) => c.path === '/fornecedores',
      ),
      false,
    )
    assert.ok(
      await viewer
        .getByRole('button', {
          name: 'Histórico de Farinha de trigo',
          exact: true,
        })
        .count(),
    )
    await viewer.close()
    console.log('PASS: acesso de consulta preservado, sem ações de gestão')
  } finally {
    await browser.close()
    servidor.kill()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
