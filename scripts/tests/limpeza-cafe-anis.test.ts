import * as assert from 'node:assert/strict';
import { APAGAR, PRESERVAR, PROJECT, RID, bloqueios, validarDestino } from '../limpeza-cafe-anis-plano';
const Module = require('module');
const originalLoad = Module._load;
let escritas: string[] = [], existentes = new Set<string>();
let nome = 'Café Anis', pendente = false, filho = false, falharLote = false, numeroLotes = 0;
const tempo = { isEqual: (v: unknown) => v === tempo };
const documento = (c: string, id: string) => ({
  id, updateTime: tempo,
  data: () => c === 'pedidos' ? { status: pendente ? 'aberto' : 'pago' } :
    c === 'sessoes_caixa' ? { status: 'fechado' } : c === 'delivery_orders' ? { status: 'delivered' } :
    c === 'pedidos_reposicao' ? { status: 'recebido' } : c === 'mesas' ? { status: 'livre' } : {},
  ref: { path: `restaurantes/${RID}/data/${c}/items/${id}`, listCollections: async () => filho ? [{}] : [] },
});
const db = {
  doc: (p: string) => ({ path: p, id: RID, get: async () => ({ exists: true, get: () => nome }) }),
  collection: (p: string) => {
    const c = p.split('/')[3];
    const get = async () => {
      const docs = Array.from(existentes).filter(v => v.startsWith(c + '/')).map(v => documento(c, v.split('/')[1]));
      return { docs, empty: docs.length === 0 };
    };
    return { get, limit: () => ({ get }) };
  },
  batch: () => {
    const partes: string[] = [];
    return {
      delete: (ref: { path: string }, condicao: any) => {
        assert.equal(condicao.lastUpdateTime, tempo);
        const c = ref.path.split('/')[3];
        assert.ok((APAGAR as readonly string[]).includes(c), `escrita indevida: ${c}`);
        partes.push(c + '/' + ref.path.split('/')[5]);
      },
      commit: async () => {
        numeroLotes++; assert.ok(partes.length <= 400);
        if (falharLote) throw new Error('lote recusado');
        for (const p of partes) { escritas.push(p); existentes.delete(p); }
      },
    };
  },
};
Module._load = function(id: string, ...args: any[]) {
  if (id === 'firebase-admin/app') return {
    cert: () => ({}), applicationDefault: () => ({}),
    initializeApp: (options: any) => ({ options }), deleteApp: async () => {},
  };
  if (id === 'firebase-admin/firestore') return { getFirestore: () => db };
  return originalLoad.call(this, id, ...args);
};
const { main } = require('../limpar-cafe-anis');
Module._load = originalLoad;
const log = console.log, oldArgv = process.argv, oldEnv = { ...process.env };
console.log = () => {};
function preparar(exec = false) {
  escritas = []; numeroLotes = 0; nome = 'Café Anis'; pendente = false; filho = false; falharLote = false;
  existentes = new Set([...APAGAR, ...PRESERVAR].map(c => c + '/teste'));
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: PROJECT });
  delete process.env.FIRESTORE_EMULATOR_HOST; delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  process.argv = ['node', 'script', ...(exec ? ['--exec', `--confirmar=${RID}`, '--operacao-parada'] : [])];
}
(async () => {
  try {
    assert.throws(() => validarDestino('outro', RID, 'Café Anis'));
    assert.throws(() => validarDestino(PROJECT, 'outro', 'Café Anis'));
    for (const [colecao, dados] of [
      ['pedidos', { status: 'pago', cozinhaPendente: true }],
      ['pedidos', { status: 'pago', itens: [{ modoEstoque: 'antecipado', lotesReservados: [{}] }] }],
      ['lotes_producao', { reservado: 1 }], ['mesas', { status: 'livre', pedidoAtivoId: 'p' }],
      ['sessoes_caixa', { status: 'aberto' }], ['delivery_orders', { status: 'pending' }],
      ['pedidos_reposicao', { status: 'gerado' }],
    ] as const) assert.equal(bloqueios({ [colecao]: [{ id: '1', dados }] }).length, 1);
    preparar(); await main(); assert.equal(escritas.length, 0);
    preparar(true); nome = 'Outro'; await assert.rejects(main(), /Destino/); assert.equal(escritas.length, 0);
    preparar(true); process.argv = ['node', 'script', '--exec']; await assert.rejects(main(), /Para apagar/);
    preparar(true); process.argv.push('--rid=outro'); await assert.rejects(main(), /Argumento/);
    preparar(true); process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'; await assert.rejects(main(), /emulador/);
    preparar(true); pendente = true; await assert.rejects(main(), /bloqueada/); assert.equal(escritas.length, 0);
    preparar(true); filho = true; await assert.rejects(main(), /Subcolecao/); assert.equal(escritas.length, 0);
    preparar(true); falharLote = true; await assert.rejects(main(), /lote recusado/); assert.equal(escritas.length, 0);
    preparar(true);
    for (let i = 0; i < 801; i++) existentes.add('despesas/' + i);
    await main();
    assert.equal(escritas.length, APAGAR.length + 801);
    assert.equal(numeroLotes, APAGAR.length + 2);
    assert.deepEqual([...existentes].sort(), PRESERVAR.map(c => c + '/teste').sort());
    log('OK: simulacao, destino, confirmacoes, bloqueios, subcolecoes, falha, lotes e preservacao.');
  } finally { console.log = log; process.argv = oldArgv; process.env = oldEnv; }
})().catch(e => { console.error(e); process.exitCode = 1; });
