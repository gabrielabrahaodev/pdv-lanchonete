/**
 * Backup completo do Firestore em JSON.
 *
 * Uso:
 *   npm run backup                          (usa ../service-account.json)
 *   SERVICE_ACCOUNT_PATH=/tmp/sa.json npx ts-node backup-firestore.ts
 *
 * Saída: backups/backup-<timestamp>.json (uma pasta acima, raiz do repo)
 *
 * Estrutura exportada (genérica — varre o que existir):
 * {
 *   geradoEm, projeto,
 *   tenants: { <restaurantId>: { config: {...}, colecoes: { <kind>: [docs] } } },
 *   onboarding: [docs]
 * }
 */
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH || path.join(__dirname, 'service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`Credencial não encontrada: ${serviceAccountPath}`);
  console.error('Defina SERVICE_ACCOUNT_PATH apontando para o service-account.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.PROJECT_ID || 'pdv-lanchonete-1fa79',
});

const db = admin.firestore();

async function main() {
  const geradoEm = new Date().toISOString();
  const tenants: Record<string, unknown> = {};

  const restaurantes = await db.collection('restaurantes').listDocuments();
  for (const restDoc of restaurantes) {
    const rid = restDoc.id;
    const dataDoc = restDoc.collection('data').doc('configuracoes');
    const configSnap = await dataDoc.get();

    const colecoes: Record<string, unknown[]> = {};
    const dataParent = restDoc.collection('data');
    const kindDocs = await dataParent.listDocuments();
    for (const kindDoc of kindDocs) {
      if (kindDoc.id === 'configuracoes') continue; // doc único, tratado acima
      const itemsSnap = await kindDoc.collection('items').get();
      colecoes[kindDoc.id] = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if ((colecoes[kindDoc.id] as unknown[]).length === 0) delete colecoes[kindDoc.id];
    }

    const raizSnap = await restDoc.get();
    tenants[rid] = {
      ...(raizSnap.data() || {}),
      config: configSnap.exists ? configSnap.data() : null,
      colecoes,
    };
    console.log(`tenant ${rid}: ${Object.keys(colecoes).map((k) => `${k}=${(colecoes[k] as unknown[]).length}`).join(', ') || '(vazio)'}`);
  }

  const onboardingSnap = await db.collection('onboarding').get();
  const onboarding = onboardingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const backup = { geradoEm, projeto: admin.app().options.projectId, tenants, onboarding };

  const outDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = geradoEm.replace(/[:.]/g, '-').slice(0, 16);
  const outFile = path.join(outDir, `backup-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(backup, null, 2));
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`\nBackup salvo: ${outFile} (${kb} KB)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
