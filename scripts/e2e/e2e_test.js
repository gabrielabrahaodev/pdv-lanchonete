// Fluxo do app client direto no Firestore (regras de segurança):
// login Firebase Auth -> ler produtos/mesas -> query pedidos whereIn status
// -> batch.set(merge) pedido + update mesa -> cleanup.
// Requer `npm install` em ../scripts (pacote firebase client).
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  doc,
  getDocs,
  writeBatch,
  query,
  where,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: 'AIzaSyDqzQ8D8e8wDM8wgw57l_1SZDzZjNdy3Y4',
  authDomain: 'pdv-lanchonete-1fa79.firebaseapp.com',
  projectId: 'pdv-lanchonete-1fa79',
  storageBucket: 'pdv-lanchonete-1fa79.firebasestorage.app',
  messagingSenderId: '815168925',
  appId: '1:815168925:web:96c10004b3a546fe600374',
};

async function step(name, fn) {
  try {
    const result = await fn();
    console.log(`OK ${name}`);
    return result;
  } catch (e) {
    console.log(`FALHOU ${name}`);
    console.log(`   code: ${e.code}`);
    console.log(`   message: ${e.message}`);
    throw e;
  }
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const rid = 'restaurante_001';

  // 1. LOGIN
  await step('Login admin@restaurante.com', () =>
    signInWithEmailAndPassword(auth, 'admin@restaurante.com', 'SenhaForte123!')
  );

  // 2. READS
  await step('Ler produtos (data/produtos/items)', async () => {
    const snap = await getDocs(collection(db, 'restaurantes', rid, 'data', 'produtos', 'items'));
    console.log(`   -> ${snap.size} produtos`);
  });

  await step('Ler mesas (data/mesas/items)', async () => {
    const snap = await getDocs(collection(db, 'restaurantes', rid, 'data', 'mesas', 'items'));
    console.log(`   -> ${snap.size} mesas`);
  });

  await step('Query pedidos whereIn status', async () => {
    const q = query(
      collection(db, 'restaurantes', rid, 'data', 'pedidos', 'items'),
      where('status', 'in', ['aberto', 'cozinha', 'pronto'])
    );
    const snap = await getDocs(q);
    console.log(`   -> ${snap.size} pedidos abertos`);
  });

  // 3. WRITE pedido via batch.set(merge)
  const pedidoJson = {
    id: 'pedido_test_e2e_1',
    restaurantId: rid,
    mesaId: 'mesa_01',
    tipo: 'local',
    status: 'aberto',
    itens: [
      {
        id: 'item_1',
        produtoId: 'prod_xburger',
        variacaoId: null,
        qtd: 2,
        precoUnitario: 25.9,
        observacoes: null,
        status: 'pendente',
      },
    ],
    total: 51.8,
    pagamentos: [],
    criadoEm: new Date().toISOString(),
    fechadoEm: null,
    usuarioId: null,
  };

  const pedidoRef = doc(db, 'restaurantes', rid, 'data', 'pedidos', 'items', pedidoJson.id);
  await step('Batch set pedido (merge) em data/pedidos/items', async () => {
    const batch = writeBatch(db);
    batch.set(pedidoRef, pedidoJson, { merge: true });
    await batch.commit();
  });

  // 4. WRITE mesa updateStatus
  const mesaRef = doc(db, 'restaurantes', rid, 'data', 'mesas', 'items', 'mesa_01');
  await step('Update mesa status=ocupada', async () => {
    const batch = writeBatch(db);
    batch.set(
      mesaRef,
      { id: 'mesa_01', restaurantId: rid, numero: 1, status: 'ocupada', pedidoAtivoId: pedidoJson.id, garcomId: null, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() },
      { merge: true }
    );
    await batch.commit();
  });

  // Cleanup
  await step('Limpar pedido teste', async () => {
    const batch = writeBatch(db);
    batch.delete(pedidoRef);
    await batch.commit();
  });

  console.log('\nFluxo completo OK - nenhum erro no caminho do app');
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
