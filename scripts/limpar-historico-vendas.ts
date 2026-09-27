/**
 * Limpa o HISTÓRICO transacional do restaurante, mantendo cadastros:
 *   APAGA: pedidos pagos/cancelados, delivery delivered/cancelled,
 *          TODAS as movimentações de estoque, sessões de caixa FECHADAS,
 *          despesas PAGAS.
 *   MANTÉM: pedidos abertos, delivery ativos, sessão aberta, despesas
 *          pendentes e TODOS os cadastros (produtos, categorias, mesas,
 *          estoque, usuários, fornecedores, configurações, convites,
 *          agregados) + contas do Auth.
 *
 * DRY-RUN é o padrão (só lista o que faria). Para apagar de verdade:
 *   npm run limpar-historico-vendas -- --exec [--rid=restaurante_001]
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const EXEC = process.argv.includes('--exec');
const ridArg = process.argv.find((a) => a.startsWith('--rid='));
const RID = ridArg ? ridArg.split('=')[1] : 'restaurante_001';
const LOTE = 400;

function loadServiceAccount(): any {
  const fullPath = path.resolve(__dirname, './service-account.json');
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Service account não encontrado: ${fullPath}`);
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function initFirebase() {
  if (!getApps().length) {
    initializeApp({ credential: cert(loadServiceAccount()) });
  }
  return getFirestore();
}

async function apagaEmLotes(db: FirebaseFirestore.Firestore, refs: FirebaseFirestore.DocumentReference[], rotulo: string) {
  console.log(`${EXEC ? 'APAGANDO' : 'apagaria'} ${refs.length} docs em ${rotulo}`);
  if (!EXEC) return refs.length;
  let n = 0;
  for (let i = 0; i < refs.length; i += LOTE) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + LOTE)) batch.delete(ref);
    await batch.commit();
    n += Math.min(LOTE, refs.length - i);
  }
  return n;
}

async function main() {
  const db = initFirebase();
  const base = `restaurantes/${RID}/data`;
  let total = 0;

  const colecao = async (kind: string) =>
    (await db.collection(`${base}/${kind}/items`).get()).docs;

  // 1. pedidos pagos/cancelados (abertos ficam)
  const pedidos = await colecao('pedidos');
  const velhos = pedidos.filter((d) => ['pago', 'cancelado'].includes((d.data() || {}).status));
  const abertos = pedidos.length - velhos.length;
  total += await apagaEmLotes(db, velhos.map((d) => d.ref), 'pedidos pagos/cancelados');
  console.log(`  mantidos (abertos/outros): ${abertos}`);

  // 2. delivery delivered/cancelled (ativos ficam)
  const deliv = await colecao('delivery_orders');
  const delivVelhos = deliv.filter((d) => ['delivered', 'cancelled'].includes((d.data() || {}).status));
  total += await apagaEmLotes(db, delivVelhos.map((d) => d.ref), 'delivery delivered/cancelled');
  console.log(`  mantidos (ativos/outros): ${deliv.length - delivVelhos.length}`);

  // 3. movimentações de estoque (todas; saldo fica no item)
  const movs = await colecao('movimentacoes_estoque');
  total += await apagaEmLotes(db, movs.map((d) => d.ref), 'movimentacoes_estoque (todas)');

  // 4. sessões de caixa fechadas (aberta fica)
  const sessoes = await colecao('sessoes_caixa');
  const fechadas = sessoes.filter((d) => (d.data() || {}).status === 'fechado');
  total += await apagaEmLotes(db, fechadas.map((d) => d.ref), 'sessoes_caixa fechadas');
  console.log(`  mantidas (abertas/outras): ${sessoes.length - fechadas.length}`);

  // 5. despesas PAGAS (pendentes ficam — são contas a pagar!)
  const despesas = await colecao('despesas');
  const pagas = despesas.filter((d) => (d.data() || {}).status === 'pago');
  total += await apagaEmLotes(db, pagas.map((d) => d.ref), 'despesas pagas');
  console.log(`  mantidas (pendentes/outras): ${despesas.length - pagas.length}`);

  console.log(`\nTOTAL ${EXEC ? 'apagado' : 'a apagar (dry-run)'}: ${total} docs em ${RID}`);
  if (!EXEC) console.log('Rode com --exec para apagar de verdade.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
