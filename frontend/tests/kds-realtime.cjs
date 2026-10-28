// Executado por scripts/e2e/kds_realtime.py, somente emulador/local.
const { chromium } = require(process.env.PDV_PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
;(async () => {
  const rid = process.env.PDV_KDS_RID
  assert.ok(rid && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8680')
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  })
  try {
    const page = await browser.newPage({
      viewport: { width: 1024, height: 768 },
    })
    const errors = []
    page.on('pageerror', (e) => {
      errors.push(e.message)
      console.log('PAGEERROR', e.message)
    })
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warn')
        console.log('CONSOLE', m.text())
    })
    await page.route('**/*', (r) =>
      new URL(r.request().url()).hostname === '127.0.0.1'
        ? r.continue()
        : r.abort(),
    )
    await page.route('**/src/context/AuthContext.tsx', (r) =>
      r.fulfill({
        contentType: 'application/javascript',
        body: `export const useAuth=()=>({me:{uid:'qa',restaurantId:${JSON.stringify(rid)},papel:'admin'}});`,
      }),
    )
    await page.route('**/src/lib/api.ts', (r) =>
      r.fulfill({
        contentType: 'application/javascript',
        body: `export const api=()=>{throw Error('Nenhuma mutação UI esperada neste teste')};export const API_BASE='';`,
      }),
    )
    const transformed = await (
      await page.request.get('http://127.0.0.1:5173/src/lib/firebase.ts')
    ).text()
    const appPath = transformed.match(/from \"([^\"]*firebase_app[^\"]*)\"/)[1]
    const firestorePath = transformed.match(
      /from \"([^\"]*firebase_firestore[^\"]*)\"/,
    )[1]
    await page.route('**/src/lib/firebase.ts', (r) =>
      r.fulfill({
        contentType: 'application/javascript',
        body: `import {initializeApp} from '${appPath}';import {getFirestore,connectFirestoreEmulator} from '${firestorePath}';const app=initializeApp({projectId:'demo-p0a',apiKey:'demo'},'qa-kds');export const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8680,{mockUserToken:{sub:'qa',restaurantId:${JSON.stringify(rid)},papel:'admin'}});`,
      }),
    )
    await page.goto('http://127.0.0.1:5173/tests/browser/kds.html')
    await page.getByText('Mesa 1', { exact: true }).waitFor()
    await page.getByText('Balcão #balcao', { exact: true }).waitFor()
    await page.request.post('http://127.0.0.1:8766/pagar-mesa')
    await page
      .getByText('Mesa 1', { exact: true })
      .waitFor({ state: 'detached' })
    await page.getByText('Balcão #balcao', { exact: true }).waitFor()
    await page.request.post('http://127.0.0.1:8766/pagar-balcao')
    await page.getByText('Balcão #balcao', { exact: true }).waitFor()
    assert.equal(await page.locator('article').count(), 1)
    assert.deepEqual(errors, [])
    console.log(
      'PASS KDS REALTIME: componente e hooks reais + SDK/Firestore Emulator; mesa some após quitação sem reload; balcão pago continua. Auth simulado.',
    )
  } finally {
    await browser.close()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
