/**
 * Restaura um backup gerado por backup-firestore.ts.
 *
 * Uso:
 *   npm run restaurar -- --arquivo ../backups/backup-X.json          (dry-run: so mostra)
 *   npm run restaurar -- --arquivo ../backups/backup-X.json --exec   (grava de verdade)
 *
 * Flags:
 *   --arquivo <caminho>   dump a restaurar (default: o mais recente em ../backups)
 *   --exec                executa a escrita (SEM isto e apenas dry-run)
 *   --com-onboarding      restaura tambem os marcadores de onboarding/{uid}
 *                         (por padrao pula: marcador presente BLOQUEIA novo
 *                         onboarding do uid; so restaure se essa for a intencao)
 *   --tenant <rid>        restaura somente este restaurantId
 *
 * Observacoes:
 * - Upsert por id: docs existentes com o mesmo id sao SOBRESCRITOS pelo conteudo
 *   do backup (merge=false). Nao apaga docs que nao estao no backup.
 * - Timestamps voltam como maps {seconds,nanoseconds} se o dump os serializou
 *   assim; a leitura do app normaliza formatos legados, entao o sistema continua
 *   funcionando apos restore.
 */
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const flag = (nome: string) => args.includes(nome);
const valor = (nome: string) => {
  const i = args.indexOf(nome);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};

const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH || path.join(__dirname, 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`Credencial nao encontrada: ${serviceAccountPath}`);
  console.error('Defina SERVICE_ACCOUNT_PATH apontando para o service-account.json');
  process.exit(1);
}

const arquivo = valor('--arquivo') || (() => {
  const dir = path.join(__dirname, '..', 'backups');
  const arquivos = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.startsWith('backup-') && f.endsWith('.json')).sort()
    : [];
  if (arquivos.length === 0) {
    console.error('Nenhum backup encontrado em', dir);
    process.exit(1);
  }
  return path.join(dir, arquivos[arquivos.length - 1]);
})();
if (!fs.existsSync(arquivo)) {
  console.error('Backup nao encontrado:', arquivo);
  process.exit(1);
}

const exec = flag('--exec');
const comOnboarding = flag('--com-onboarding');
const filtroTenant = valor('--tenant');

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))),
  projectId: process.env.PROJECT_ID || 'pdv-lanchonete-1fa79',
});
const db = admin.firestore();

type Doc = Record<string, unknown> & { id?: string };

async function main() {
  const backup = JSON.parse(fs.readFileSync(arquivo!, 'utf8'));
  console.log(`Arquivo : ${arquivo}`);
  console.log(`GeradoEm: ${backup.geradoEm}`);
  console.log(`Modo    : ${exec ? 'EXEC (grava!)' : 'DRY-RUN (nao grava)'}`);
  if (!exec) console.log('Adicione --exec para gravar de verdade.\n');

  const tenants = backup.tenants as Record<string, any>;
  for (const [rid, tenant] of Object.entries(tenants)) {
    if (filtroTenant && rid !== filtroTenant) continue;

    const raiz: Doc = { ...(tenant as Doc) };
    delete raiz.config;
    delete raiz.colecoes;
    console.log(`tenant ${rid}: raiz(${Object.keys(raiz).length} campos)`);

    if (exec) await db.collection('restaurantes').doc(rid).set(raiz);

    const config = (tenant as any).config;
    if (config && Object.keys(config).length > 0) {
      console.log(`  configuracoes: ${Object.keys(config).length} campos`);
      if (exec) await db.collection(`restaurantes/${rid}/data`).doc('configuracoes').set(config);
    }

    const colecoes = ((tenant as any).colecoes || {}) as Record<string, Doc[]>;
    for (const [kind, docs] of Object.entries(colecoes)) {
      console.log(`  ${kind}: ${docs.length} doc(s)`);
      if (exec) {
        // recria o doc-pai para que futuros backups voltem a listar esta colecao
        await db.collection(`restaurantes/${rid}/data`).doc(kind).set({}, { merge: true });
        const col = db.collection(`restaurantes/${rid}/data/${kind}/items`);
        let lote = db.batch();
        let n = 0;
        for (const doc of docs) {
          const { id, ...dados } = doc;
          if (!id) throw new Error(`doc sem id em ${kind}: ${JSON.stringify(doc).slice(0, 80)}`);
          lote.set(col.doc(id), dados);
          if (++n % 400 === 0) { await lote.commit(); lote = db.batch(); }
        }
        await lote.commit();
      }
    }
  }

  const onboarding = (backup.onboarding || []) as Doc[];
  console.log(`onboarding: ${onboarding.length} marcador(es) ${comOnboarding ? '(restaurando)' : '(PULADO — use --com-onboarding para restaurar)'}`);
  if (exec && comOnboarding) {
    for (const doc of onboarding) {
      const { id, ...dados } = doc;
      if (id) await db.collection('onboarding').doc(id).set(dados);
    }
  }

  console.log(exec ? '\nRestore concluido.' : '\nDry-run concluido — nada foi gravado.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
