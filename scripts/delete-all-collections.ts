import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
const CONFIG = {
  restaurantId: 'restaurante_001',
  serviceAccountPath: './service-account.json',
};

function loadServiceAccount(): any {
  const fullPath = path.resolve(__dirname, CONFIG.serviceAccountPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Service account não encontrado: ${fullPath}`);
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function initializeFirebase() {
  const serviceAccount = loadServiceAccount();
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

// ============================================================================
// FUNÇÃO PARA DELETAR RECURSIVAMENTE
// ============================================================================
async function deleteCollection(db: any, collectionPath: string, batchSize = 500) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);
  
  let deletedCount = 0;
  
  while (true) {
    const snapshot = await query.get();
    
    if (snapshot.size === 0) {
      break;
    }
    
    const batch = db.batch();
    snapshot.docs.forEach((doc: any) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    deletedCount += snapshot.size;
    console.log(`  Deletados ${deletedCount} documentos de ${collectionPath}...`);
    
    if (snapshot.size < batchSize) {
      break;
    }
  }
  
  return deletedCount;
}

// ============================================================================
// SCRIPT PRINCIPAL
// ============================================================================
async function main() {
  console.log('🗑️  Iniciando deleção de TODAS as coleções do restaurante...\n');
  
  const db = initializeFirebase();
  const restaurantId = CONFIG.restaurantId;
  
  const collections = [
    `restaurantes/${restaurantId}/data/configuracoes`,
    `restaurantes/${restaurantId}/data/categorias/items`,
    `restaurantes/${restaurantId}/data/produtos/items`,
    `restaurantes/${restaurantId}/data/estoque/items`,
    `restaurantes/${restaurantId}/data/mesas/items`,
    `restaurantes/${restaurantId}/data/pedidos/items`,
    `restaurantes/${restaurantId}/data/movimentacoes_estoque/items`,
    `restaurantes/${restaurantId}/data/usuarios/items`,
    `restaurantes/${restaurantId}/data/sessoes_caixa/items`,
    `restaurantes/${restaurantId}/data/pedidos/items`, // subcoleções de itens/pagamentos serão deletadas junto
  ];
  
  let totalDeleted = 0;
  
  for (const collectionPath of collections) {
    console.log(`\n🗑️  Deletando: ${collectionPath}`);
    try {
      const count = await deleteCollection(db, collectionPath);
      totalDeleted += count;
      console.log(`  ✅ ${count} documentos deletados`);
    } catch (error: any) {
      console.error(`  ❌ Erro ao deletar ${collectionPath}:`, error.message);
    }
  }
  
  // Deletar documentos raiz da subcoleção data
  const dataDocRefs = [
    'restaurantes/${restaurantId}/data/configuracoes',
    'restaurantes/${restaurantId}/data/categorias',
    'restaurantes/${restaurantId}/data/produtos',
    'restaurantes/${restaurantId}/data/estoque',
    'restaurantes/${restaurantId}/data/mesas',
    'restaurantes/${restaurantId}/data/pedidos',
    `restaurantes/${restaurantId}/data/movimentacoes_estoque`,
    'restaurantes/${restaurantId}/data/usuarios',
    'restaurantes/${restaurantId}/data/sessoes_caixa',
  ];
  
  for (const docPath of dataDocRefs) {
    try {
      await db.doc(docPath).delete();
      console.log(`  ✅ Documento deletado: ${docPath}`);
    } catch (error: any) {
      // Ignorar se não existir
    }
  }
  
  // Deletar restaurante raiz
  try {
    await db.collection('restaurantes').doc(CONFIG.restaurantId).delete();
    console.log(`\n✅ Restaurante ${CONFIG.restaurantId} deletado`);
  } catch (error: any) {
    console.error(`Erro ao deletar restaurante:`, error.message);
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ LIMPEZA CONCLUÍDA! Total: ${totalDeleted} documentos deletados`);
  console.log(`${'='.repeat(50)}`);
}

main()
  .then(() => { console.log('\n🏁 Script finalizado'); process.exit(0); })
  .catch((error) => { console.error('\n❌ Erro:', error); process.exit(1); });