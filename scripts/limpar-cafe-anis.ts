/** Simulacao por padrao. Nao importa nem executa o limpador generico legado. */
import { applicationDefault, cert, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { APAGAR, PRESERVAR, PROJECT, RID, Dados, bloqueios, validarDestino } from './limpeza-cafe-anis-plano';

export async function main() {
  const args = process.argv.slice(2);
  const permitidos = ['--exec', `--confirmar=${RID}`, '--operacao-parada'];
  if (args.some(a => !permitidos.includes(a))) throw new Error('Argumento desconhecido. Nao aceita outro projeto/rid.');
  const executar = args.includes('--exec');
  if (executar && (!args.includes(`--confirmar=${RID}`) || !args.includes('--operacao-parada'))) {
    throw new Error(`Para apagar, pare o uso do restaurante e use --exec --confirmar=${RID} --operacao-parada`);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Remova as variaveis de emulador: este script tem destino PRD fixo.');
  }
  const local = path.join(__dirname, 'service-account.json');
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    (fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : undefined);
  const conta = json ? JSON.parse(json) : undefined;
  if (conta && conta.project_id !== PROJECT) throw new Error('Credencial de outro projeto.');
  const app = initializeApp({ projectId: PROJECT, credential: conta ? cert(conta) : applicationDefault() });
  try {
    const db = getFirestore(app);
    const raiz = db.doc(`restaurantes/${RID}`);
    const restaurante = await raiz.get();
    if (!restaurante.exists) throw new Error('Cafe Anis nao encontrado. Confira a credencial.');
    validarDestino(app.options.projectId!, raiz.id, restaurante.get('nome'));
    const colecao = (c: string) => db.collection(`${raiz.path}/data/${c}/items`);
    const dados: Dados = {};
    const snapshots: Record<string, QueryDocumentSnapshot[]> = {};
    // Ler todo o plano e validar ANTES da primeira exclusao.
    for (const c of [...APAGAR, ...PRESERVAR]) {
      snapshots[c] = (await colecao(c).get()).docs;
      dados[c] = snapshots[c].map(s => ({ id: s.id, dados: s.data() }));
    }
    console.log(`\n${executar ? 'EXECUCAO' : 'SIMULACAO (nenhuma escrita)'} | ${PROJECT} | ${RID} | Café Anis`);
    for (const c of APAGAR) console.log(`APAGAR ${c}: ${snapshots[c].length}`);
    for (const c of PRESERVAR) console.log(`PRESERVAR ${c}: ${snapshots[c].length}`);
    const erros = bloqueios(dados);
    if (erros.length) {
      console.error(erros.join('\n'));
      throw new Error('Limpeza bloqueada. Resolva as pendencias acima no sistema; nada foi apagado.');
    }
    // Nenhum service de cancelamento/estorno e chamado: saldos permanecem iguais.
    if (!executar) {
      console.log('\nSimulacao concluida. Revise as contagens; consulte obsidian/Limpeza-Cafe-Anis.md.');
      return;
    }
    // Nao permitir filhos desconhecidos que ficariam orfaos (delete nao e recursivo).
    for (const c of APAGAR) for (const s of snapshots[c]) {
      if ((await s.ref.listCollections()).length) throw new Error(`Subcolecao inesperada em ${s.ref.path}. Nada foi apagado.`);
    }
    let apagados = 0;
    for (const c of APAGAR) {
      const docs = snapshots[c];
      for (let inicio = 0; inicio < docs.length; inicio += 400) {
        const lote = db.batch();
        const parte = docs.slice(inicio, inicio + 400);
        for (const s of parte) lote.delete(s.ref, { lastUpdateTime: s.updateTime });
        await lote.commit();
        apagados += parte.length;
        console.log(`Apagados ${apagados} documentos (ultimo lote: ${c}).`);
      }
    }
    // Verifica alteracoes concorrentes; nunca tenta corrigir/reverter saldo.
    for (const c of PRESERVAR) {
      const depois = (await colecao(c).get()).docs;
      const antes = new Map(snapshots[c].map(s => [s.id, s.updateTime]));
      if (depois.length !== antes.size || depois.some(s => !antes.get(s.id)?.isEqual(s.updateTime))) {
        throw new Error(`ATENCAO: ${c} mudou durante a limpeza por outro processo. Revise os dados; nao houve estorno.`);
      }
    }
    for (const c of APAGAR) {
      if (!(await colecao(c).limit(1).get()).empty) throw new Error(`Restaram documentos em ${c}; verifique concorrencia.`);
    }
    console.log(`Concluido: ${apagados} documentos apagados. Estoque e cadastros preservados.`);
    console.log('Reinicie o backend para descartar cache BI e recarregue o aplicativo.');
  } finally {
    await deleteApp(app);
  }
}
if (require.main === module) main().catch(e => {
  console.error('FALHA:', e.message);
  console.error('Se houve lotes confirmados, a limpeza pode estar parcial. Nao ha rollback global.');
  process.exitCode = 1;
});
