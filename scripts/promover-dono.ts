/**
 * Gestão dos DONOS DA PLATAFORMA (doc sistema/global.donoUids[]).
 *
 * Uso:
 *   npm run promover-dono -- listar
 *   npm run promover-dono -- adicionar --uid <uid> --exec
 *   npm run promover-dono -- remover --uid <uid> --exec
 *
 * `listar` é sempre seguro. adicionar/remover exigem --exec para gravar
 * (sem ele mostram o que fariam).
 *
 * Migração histórica (uma vez por deploy do zero): se nenhum restaurante tem
 * criadorUid, use o uid explícito:  adicionar --uid <uid> --exec
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const EXEC = process.argv.includes('--exec');

function argValor(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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

async function carregarDonos(db: FirebaseFirestore.Firestore): Promise<string[]> {
  const snap = await db.collection('sistema').doc('global').get();
  return (((snap.data() || {}).donoUids || []) as any[]).map(String);
}

async function salvarDonos(db: FirebaseFirestore.Firestore, donos: string[]) {
  await db.collection('sistema').doc('global').set({ donoUids: donos }, { merge: true });
}

async function descrever(uid: string): Promise<string> {
  try {
    const u = await getAuth().getUser(uid);
    return `${u.email ?? '(sem e-mail)'}`;
  } catch {
    return '(conta não encontrada no Auth)';
  }
}

async function main() {
  const db = initFirebase();
  const cmd = process.argv[2] ?? 'listar';

  if (cmd === 'listar') {
    const donos = await carregarDonos(db);
    console.log(`Donos da plataforma (${donos.length}):`);
    for (const uid of donos) {
      console.log(`  ${uid} — ${await descrever(uid)}`);
    }
    if (!donos.length) console.log('  (nenhum)');
    return;
  }

  const uid = argValor('--uid');
  if (!uid) {
    console.error(`"${cmd}" exige --uid <uid>`);
    process.exit(1);
  }

  const donos = await carregarDonos(db);

  if (cmd === 'adicionar') {
    if (donos.includes(uid)) {
      console.log('Esse uid já é dono. Nada a fazer.');
      return;
    }
    console.log(`${EXEC ? 'Adicionando' : '[dry-run] Adicionaria'} ${uid} (${await descrever(uid)}) a donoUids`);
    if (!EXEC) return;
    await salvarDonos(db, [...donos, uid]);
    console.log('OK.');
    return;
  }

  if (cmd === 'remover') {
    if (!donos.includes(uid)) {
      console.log('Esse uid NÃO está na lista. Nada a fazer.');
      return;
    }
    console.log(`${EXEC ? 'Removendo' : '[dry-run] Removeria'} ${uid} (${await descrever(uid)}) de donoUids`);
    if (!EXEC) return;
    await salvarDonos(db, donos.filter((u) => u !== uid));
    console.log('OK.');
    return;
  }

  console.error('Comando desconhecido. Use: listar | adicionar | remover');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
