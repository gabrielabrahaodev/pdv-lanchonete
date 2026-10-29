const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { iniciarServidor } = require('./wiki-servidor.cjs')
const { preparar } = require('./wiki-ui.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const manifesto = JSON.parse(fs.readFileSync('src/wiki/manifesto.json', 'utf8'))
const base = 'http://127.0.0.1:5173'
async function abrir(page, id) {
  await page.goto(
    base + '/tests/browser/wiki.html?rota=' + encodeURIComponent('/wiki/' + id),
  )
  await page
    .getByRole('heading', { name: 'Exemplos práticos', exact: true })
    .waitFor()
}
async function verificarOverflow(page, descricao) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    descricao,
  )
  const erros = await page
    .locator('article')
    .evaluateAll((artigos) =>
      artigos.flatMap((a) =>
        [...a.querySelectorAll('dd,dt,p,h4')]
          .filter(
            (e) =>
              e.getBoundingClientRect().width > 0 &&
              e.scrollWidth > e.clientWidth + 2,
          )
          .map((e) => e.textContent.slice(0, 80)),
      ),
    )
  assert.deepEqual(erros, [], descricao + ': texto cortado')
}
;(async () => {
  const servidor = await iniciarServidor()
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  })
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 1000 },
      reducedMotion: 'reduce',
    })
    const page = await context.newPage(),
      erros = []
    page.on('pageerror', (e) => erros.push(e.message))
    await preparar(page)
    // Renderiza todos os artigos, com links, exemplos e metadados do campo.
    for (const meta of manifesto.artigos) {
      await abrir(page, meta.id)
      const artigo = JSON.parse(
        fs.readFileSync(
          `src/wiki/conteudo/${meta.categoria}/wiki-artigo-${meta.id}.json`,
          'utf8',
        ),
      )
      assert.equal(
        await page.locator('article h4').count(),
        artigo.exemplos.length,
      )
      for (const campo of artigo.campos) {
        // O conteúdo detalhado não deve ser descartado pelo renderer.
        for (const k of ['calculo', 'exemplo', 'indisponivel'])
          if (campo[k])
            assert.ok(
              (await page.locator('article').innerText()).includes(campo[k]),
              `${meta.id}: ${k}`,
            )
      }
      for (const dark of [false, true]) {
        await page.evaluate(
          (d) => document.documentElement.classList.toggle('dark', d),
          dark,
        )
        await verificarOverflow(page, meta.id + ' 390px ' + dark)
      }
      const antes = await page.evaluate(() => (window.calls || []).length)
      await page
        .getByRole('link', { name: 'Exemplos práticos', exact: true })
        .click()
      await page.waitForURL((url) => url.hash === '#exemplos')
      assert.equal(
        await page.evaluate(() => (window.calls || []).length),
        antes,
        'Ler exemplo não consulta dados operacionais',
      )
    }
    console.log(
      'PASS: 47 artigos com exemplos, fórmulas/limites preservados, âncora e leitura sem consulta operacional',
    )
    for (const width of [320, 360, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const id of [
        'lucratividade',
        'resultados',
        'produzir',
        'precificacao',
      ]) {
        await abrir(page, id)
        for (const dark of [false, true]) {
          await page.evaluate(
            (d) => document.documentElement.classList.toggle('dark', d),
            dark,
          )
          await verificarOverflow(page, id + ' ' + width + 'px ' + dark)
          if (id === 'lucratividade' && [390, 1440].includes(width)) {
            await page
              .getByRole('link', { name: 'Campos da tela', exact: true })
              .click()
            await page.waitForFunction(() => {
              const top = document.getElementById('campos').getBoundingClientRect().top
              return top >= (innerWidth < 768 ? 60 : 0) && top < 160
            })
            await page.screenshot({
              path: `/tmp/wiki-campos-${width}-${dark ? 'escuro' : 'claro'}.png`,
              animations: 'disabled',
            })
          }
        }
      }
      console.log(
        'PASS ' +
          width +
          'px: detalhes de indicadores e exemplos legíveis nos dois temas',
      )
    }
    await abrir(page, 'lucratividade')
    await page.getByRole('searchbox').fill('cobertura de custo')
    await page
      .getByRole('link', {
        name: 'Financeiro — Lucratividade por produto',
        exact: true,
      })
      .first()
      .waitFor()
    assert.deepEqual(erros, [])
    await context.close()
  } finally {
    await browser.close()
    servidor.kill()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
