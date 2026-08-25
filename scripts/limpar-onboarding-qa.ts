/**
 * Limpa os artefatos que os testes de onboarding deixam no Firestore:
 *   - restaurantes alvo (árvore inteira, via recursiveDelete):
 *       a) nome começa com "QA Onboard" (padrão atual da suíte E2E); ou
 *       b) algum usuário do restaurante tem e-mail qa_onboard_*@* / qa-onb*@*
 *          (padrão ANTIGO dos testes de 22/08, ex.: restaurante "De Novo");
 *   - marcadores onboarding/{uid} que apontam para esses restaurantes,
 *     além de órfãos (sem restaurantId) com mais de 24h;
 *   - contas Firebase Auth descartáveis = TODOS os uids listados em
 *     usuarios/items dos restaurantes alvo (só existem em restaurante de teste).
 *
 * DRY-RUN é o padrão (só lista o que faria). Para apagar de verdade:
 *   npm run limpar-onboarding-qa -- --exec
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const EXEC = process.argv.includes('--exec');
const PREFIXO_QA = 'QA Onboard';
const EMAIL_QA = /^qa[-_]onb/i;

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

async function main() {
  const db = initFirebase();
  let restaurantesApagados = 0;
  const uidsParaApagar = new Set<string>();

  // ---------------------------------------------------------------- identifica alvos
  const raizes = await db.collection('restaurantes').get();
  const alvos = new Map<string, { ref: any; nome: string; motivo: string }>();

  for (const doc of raizes.docs) {
    const dados = doc.data() || {};
    if (String(dados.nome || '').startsWith(PREFIXO_QA)) {
      alvos.set(doc.id, { ref: doc.ref, nome: dados.nome, motivo: 'nome QA Onboard*' });
    }
  }

  // padrão antigo: e-mail qa_onboard_*/qa-onb* entre os usuários do restaurante
  for (const doc of raizes.docs) {
    if (alvos.has(doc.id)) continue;
    const users = await doc.ref.collection('data/usuarios/items').get();
    for (const u of users.docs) {
      const email = String((u.data() || {}).email || '');
      if (EMAIL_QA.test(email)) {
        alvos.set(doc.id, { ref: doc.ref, nome: (doc.data() || {}).nome, motivo: `usuario ${email}` });
        break;
      }
    }
  }

  console.log(`Restaurantes-alvo encontrados: ${alvos.size}${EXEC ? '' : ' (dry-run)'}`);

  for (const [rid, info] of alvos) {
    console.log(`  rest=${rid} nome="${info.nome}" motivo=${info.motivo}`);
    const users = await info.ref.collection('data/usuarios/items').get();
    for (const u of users.docs) uidsParaApagar.add(u.id);
    if (EXEC) {
      await db.recursiveDelete(info.ref);
      restaurantesApagados++;
    }
  }

  // ---------------------------------------------------------------- marcadores
  const idsAlvos = [...alvos.keys()];
  const marcadores = await db.collection('onboarding').get();
  const agoraMs = Date.now();
  let marcadoresApagados = 0;

  for (const doc of marcadores.docs) {
    const dados = doc.data() || {};
    const rid = dados.restaurantId ? String(dados.restaurantId) : '';
    const pertenceAoQa = rid && idsAlvos.includes(rid);
    const orfaoSemRid =
      !rid &&
      dados.criadoEm &&
      typeof dados.criadoEm.toMillis === 'function' &&
      agoraMs - dados.criadoEm.toMillis() > 24 * 60 * 60 * 1000;

    if (pertenceAoQa || orfaoSemRid) {
      console.log(`  marker=${doc.id} rest=${rid || '(orfão sem restaurantId)'}`);
      if (EXEC) {
        await doc.ref.delete();
        marcadoresApagados++;
      }
    }
  }

  // ---------------------------------------------------------------- contas descartáveis
  let usuariosApagados = 0;
  for (const uid of uidsParaApagar) {
    console.log(`  auth-user=${uid}`);
    if (EXEC) {
      try {
        await getAuth().deleteUser(uid);
        usuariosApagados++;
      } catch (e: any) {
        console.log(`    (ignorado: ${e?.code ?? e?.message ?? e})`);
      }
    }
  }

  console.log('');
  if (EXEC) {
    console.log(
      `OK: restaurantes=${restaurantesApagados} marcadores=${marcadoresApagados} usuarios_auth=${usuariosApagados}`,
    );
  } else {
    console.log('Dry-run concluído. Nada foi apagado. Rode com --exec para gravar:');
    console.log('  npm run limpar-onboarding-qa -- --exec');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
