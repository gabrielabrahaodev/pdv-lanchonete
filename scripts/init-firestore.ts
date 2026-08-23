import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue, CollectionReference, DocumentReference, WriteBatch, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURAÇÃO - AJUSTE ESTES VALORES
// ============================================================================
const CONFIG = {
  restaurantId: 'restaurante_001',
  restaurantName: 'Minha Lanchonete',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  adminEmail: 'admin@restaurante.com',  // Corrigido para o email que o usuário usa
  adminPassword: 'SenhaForte123!',
  adminName: 'Admin',
  adminUid: '0O29i5gABJTtS5JrAFgB7yskIwC3',  // UID fixo do usuário admin
  serviceAccountPath: './service-account.json',
};

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================
function loadServiceAccount(): any {
  const fullPath = path.resolve(__dirname, CONFIG.serviceAccountPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Service account não encontrado em: ${fullPath}\n` +
      `Baixe no Console Firebase > Project Settings > Service Accounts > Generate new private key`
    );
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function initializeFirebase() {
  const serviceAccount = loadServiceAccount();
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
    console.log('✅ Firebase Admin SDK inicializado');
  }
  return { db: getFirestore(), auth: getAuth() };
}

// ============================================================================
// HELPERS
// ============================================================================
async function getOrCreateAdminUser(auth: any, email: string, password: string, displayName: string, fixedUid: string) {
  try {
    // Tenta buscar por UID primeiro
    let user;
    try {
      user = await auth.getUser(fixedUid);
      console.log(`👤 Usuário encontrado por UID: ${user.uid} (email atual: ${user.email})`);
      
      // Se o email mudou, atualiza
      if (user.email !== email) {
        user = await auth.updateUser(fixedUid, { email, password, displayName, emailVerified: true });
        console.log(`🔄 Email do usuário atualizado para: ${email}`);
      } else if (password) {
        // Atualiza senha se fornecida
        user = await auth.updateUser(fixedUid, { password, displayName });
        console.log(`🔄 Senha do usuário atualizada`);
      }
      return user;
    } catch (uidError: any) {
      if (uidError.code === 'auth/user-not-found') {
        // Usuário não existe por UID, tenta buscar por email
        try {
          user = await auth.getUserByEmail(email);
          console.log(`👤 Usuário encontrado por email: ${user.uid}`);
          
          // Se o UID não bate, atualiza o UID (não dá pra mudar UID, então recria)
          if (user.uid !== fixedUid) {
            await auth.deleteUser(user.uid);
            throw new Error('UID mismatch'); // Vai pro catch abaixo para criar com UID fixo
          }
          
          await auth.updateUser(user.uid, { password, displayName, emailVerified: true });
          return user;
        } catch (emailError: any) {
          if (emailError.code === 'auth/user-not-found') {
            // Não existe nem por UID nem por email - cria novo
            user = await auth.createUser({ 
              uid: fixedUid,  
              email, 
              password, 
              displayName, 
              emailVerified: true 
            });
            console.log(`👤 Usuário admin criado com UID fixo: ${user.uid}`);
            return user;
          }
          throw emailError;
        }
      }
      throw uidError;
    }
  } catch (error: any) {
    if (error.code === 'auth/user-not-found' || error.message === 'UID mismatch') {
      // Cria novo com UID fixo
      const user = await auth.createUser({ 
        uid: fixedUid,  
        email, 
        password, 
        displayName, 
        emailVerified: true 
      });
      console.log(`👤 Usuário admin criado com UID fixo: ${user.uid}`);
      return user;
    }
    throw error;
  }
}

async function setCustomClaims(auth: any, uid: string, claims: Record<string, any>) {
  await auth.setCustomUserClaims(uid, claims);
  console.log(`🔐 Custom claims definidos para ${uid}:`, claims);
}

// Helper para criar documento com subcoleção items
function createDocWithItems(
  batch: WriteBatch,
  parentRef: DocumentReference,
  docId: string,
  docData: Record<string, any>,
  items: Array<{ id: string; data: Record<string, any> }>
) {
  const docRef = parentRef.collection('data').doc(docId);
  batch.set(docRef, { ...docData, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  
  const itemsRef = docRef.collection('items');
  for (const item of items) {
    batch.set(itemsRef.doc(item.id), { ...item.data, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  }
}

// ============================================================================
// SCRIPT PRINCIPAL
// ============================================================================
async function main() {
  console.log('🚀 Iniciando setup do Firestore para PDV Lanchonete...\n');
  
  const { db, auth } = initializeFirebase();
  const { restaurantId, restaurantName, currency, timezone, adminEmail, adminPassword, adminName, adminUid } = CONFIG;
  
  const batch: WriteBatch = db.batch();
  let operationsCount = 0;
  
  // -------------------------------------------------------------------------
  // 1. RESTAURANTE (documento raiz)
  // -------------------------------------------------------------------------
  const restaurantRef: DocumentReference = db.collection('restaurantes').doc(restaurantId);
  batch.set(restaurantRef, { nome: restaurantName, criadoEm: Timestamp.now() });
  operationsCount++;
  console.log(`📝 Restaurante: ${restaurantId}`);
  
  // -------------------------------------------------------------------------
  // 2. SUBCOLEÇÃO DATA - Documentos com subcoleções items
  // -------------------------------------------------------------------------
  const dataParentRef: DocumentReference = restaurantRef.collection('data').doc('placeholder');
  // We'll use the data collection directly via restaurantRef.collection('data')
  const dataCol = restaurantRef.collection('data');
  
  // -------------------------------------------------------------------------
  // 2.1 CONFIGURAÇÕES (documento único, não tem items)
  // -------------------------------------------------------------------------
  batch.set(dataCol.doc('configuracoes'), {
    nome: restaurantName,
    moeda: currency,
    timezone: timezone,
    impressoraTipo: 'bluetooth',
    impressoraEndereco: '',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  operationsCount++;
  console.log(`📝 Configurações criadas`);
  
  // -------------------------------------------------------------------------
  // 2.2 CATEGORIAS (documento com subcoleção items)
  // -------------------------------------------------------------------------
  const categoriasDocRef = dataCol.doc('categorias');
  batch.set(categoriasDocRef, { 
    nome: 'Categorias', 
    createdAt: Timestamp.now(), 
    updatedAt: Timestamp.now() 
  });
  
  const categorias = [
    { id: 'cat_hamburgueres', data: { nome: 'Hambúrgueres', ordem: 1, icone: '🍔', cor: '#EF5350', ativo: true } },
    { id: 'cat_bebidas', data: { nome: 'Bebidas', ordem: 2, icone: '🥤', cor: '#42A5F5', ativo: true } },
    { id: 'cat_porcoes', data: { nome: 'Porções', ordem: 3, icone: '🍟', cor: '#FFCA28', ativo: true } },
    { id: 'cat_sobremesas', data: { nome: 'Sobremesas', ordem: 4, icone: '🍰', cor: '#AB47BC', ativo: true } },
  ];
  
  const categoriasItemsRef = categoriasDocRef.collection('items');
  for (const cat of categorias) {
    batch.set(categoriasItemsRef.doc(cat.id), { 
      ...cat.data, 
      restaurantId, 
      createdAt: Timestamp.now(), 
      updatedAt: Timestamp.now() 
    });
    operationsCount++;
  }
  console.log(`📝 ${categorias.length} categorias criadas`);
  
  // -------------------------------------------------------------------------
  // 2.3 PRODUTOS (documento com subcoleção items)
  // -------------------------------------------------------------------------
  const produtosDocRef = dataCol.doc('produtos');
  batch.set(produtosDocRef, { 
    nome: 'Produtos', 
    createdAt: Timestamp.now(), 
    updatedAt: Timestamp.now() 
  });
  
  const produtos = [
    {
      id: 'prod_xburger',
      data: {
        nome: 'X-Burger',
        categoriaId: 'cat_hamburgueres',
        preco: 25.90,
        variacoes: [
          { id: 'var_bacon', nome: 'Com Bacon', precoAdicional: 5.00, ativo: true },
          { id: 'var_ovo', nome: 'Com Ovo', precoAdicional: 3.00, ativo: true },
        ],
        ingredientes: [
          { itemId: 'ing_pao', qtd: 1 },
          { itemId: 'ing_hamburguer', qtd: 1 },
          { itemId: 'ing_queijo', qtd: 1 },
          { itemId: 'ing_alface', qtd: 30 },
          { itemId: 'ing_tomate', qtd: 2 },
        ],
        imagemUrl: '',
        ativo: true,
        estoqueMinimo: 10,
      }
    },
    {
      id: 'prod_xbacon',
      data: {
        nome: 'X-Bacon',
        categoriaId: 'cat_hamburgueres',
        preco: 30.90,
        variacoes: [
          { id: 'var_ovo', nome: 'Com Ovo', precoAdicional: 3.00, ativo: true },
        ],
        ingredientes: [
          { itemId: 'ing_pao', qtd: 1 },
          { itemId: 'ing_hamburguer', qtd: 1 },
          { itemId: 'ing_bacon', qtd: 50 },
          { itemId: 'ing_queijo', qtd: 1 },
          { itemId: 'ing_alface', qtd: 30 },
          { itemId: 'ing_tomate', qtd: 2 },
        ],
        imagemUrl: '',
        ativo: true,
        estoqueMinimo: 10,
      }
    },
    {
      id: 'prod_batata',
      data: {
        nome: 'Batata Frita',
        categoriaId: 'cat_porcoes',
        preco: 15.00,
        variacoes: [
          { id: 'var_cheddar', nome: 'Com Cheddar', precoAdicional: 5.00, ativo: true },
          { id: 'var_bacon', nome: 'Com Bacon', precoAdicional: 5.00, ativo: true },
        ],
        ingredientes: [
          { itemId: 'ing_batata', qtd: 200 },
        ],
        imagemUrl: '',
        ativo: true,
        estoqueMinimo: 5,
      }
    },
    {
      id: 'prod_refri',
      data: {
        nome: 'Refrigerante Lata',
        categoriaId: 'cat_bebidas',
        preco: 6.00,
        variacoes: [
          { id: 'var_coca', nome: 'Coca-Cola', precoAdicional: 0, ativo: true },
          { id: 'var_guarana', nome: 'Guaraná', precoAdicional: 0, ativo: true },
          { id: 'var_sprite', nome: 'Sprite', precoAdicional: 0, ativo: true },
        ],
        ingredientes: [],
        imagemUrl: '',
        ativo: true,
        estoqueMinimo: 20,
      }
    },
    {
      id: 'prod_suco',
      data: {
        nome: 'Suco Natural 300ml',
        categoriaId: 'cat_bebidas',
        preco: 8.00,
        variacoes: [
          { id: 'var_laranja', nome: 'Laranja', precoAdicional: 0, ativo: true },
          { id: 'var_maracuja', nome: 'Maracujá', precoAdicional: 0, ativo: true },
        ],
        ingredientes: [],
        imagemUrl: '',
        ativo: true,
        estoqueMinimo: 10,
      }
    },
  ];
  
  const produtosItemsRef = produtosDocRef.collection('items');
  for (const prod of produtos) {
    batch.set(produtosItemsRef.doc(prod.id), { 
      ...prod.data, 
      restaurantId, 
      createdAt: Timestamp.now(), 
      updatedAt: Timestamp.now() 
    });
    operationsCount++;
  }
  console.log(`📝 ${produtos.length} produtos criados`);
  
  // -------------------------------------------------------------------------
  // 2.4 ESTOQUE (documento com subcoleção items)
  // -------------------------------------------------------------------------
  const estoqueDocRef = dataCol.doc('estoque');
  batch.set(estoqueDocRef, { 
    nome: 'Estoque', 
    createdAt: Timestamp.now(), 
    updatedAt: Timestamp.now() 
  });
  
  const itensEstoque = [
    { id: 'ing_pao', data: { nome: 'Pão de Hambúrguer', unidade: 'un', quantidadeAtual: 100, minimo: 20, custoMedio: 0.80 } },
    { id: 'ing_hamburguer', data: { nome: 'Hambúrguer 150g', unidade: 'un', quantidadeAtual: 80, minimo: 15, custoMedio: 2.50 } },
    { id: 'ing_bacon', data: { nome: 'Bacon', unidade: 'g', quantidadeAtual: 2000, minimo: 500, custoMedio: 0.04 } },
    { id: 'ing_queijo', data: { nome: 'Queijo Prato', unidade: 'un', quantidadeAtual: 100, minimo: 20, custoMedio: 0.60 } },
    { id: 'ing_alface', data: { nome: 'Alface', unidade: 'g', quantidadeAtual: 5000, minimo: 1000, custoMedio: 0.01 } },
    { id: 'ing_tomate', data: { nome: 'Tomate', unidade: 'un', quantidadeAtual: 50, minimo: 10, custoMedio: 0.50 } },
    { id: 'ing_batata', data: { nome: 'Batata Congelada', unidade: 'kg', quantidadeAtual: 20, minimo: 5, custoMedio: 8.00 } },
    { id: 'ing_pao_hotdog', data: { nome: 'Pão de Hot Dog', unidade: 'un', quantidadeAtual: 50, minimo: 10, custoMedio: 0.70 } },
    { id: 'ing_salsicha', data: { nome: 'Salsicha', unidade: 'un', quantidadeAtual: 60, minimo: 10, custoMedio: 1.20 } },
    { id: 'ing_refri_coca', data: { nome: 'Coca-Cola Lata 350ml', unidade: 'un', quantidadeAtual: 48, minimo: 12, custoMedio: 3.00 } },
    { id: 'ing_refri_guarana', data: { nome: 'Guaraná Lata 350ml', unidade: 'un', quantidadeAtual: 36, minimo: 12, custoMedio: 2.80 } },
    { id: 'ing_refri_sprite', data: { nome: 'Sprite Lata 350ml', unidade: 'un', quantidadeAtual: 24, minimo: 6, custoMedio: 2.90 } },
  ];
  
  const estoqueItemsRef = estoqueDocRef.collection('items');
  for (const item of itensEstoque) {
    batch.set(estoqueItemsRef.doc(item.id), { 
      ...item.data, 
      restaurantId, 
      createdAt: Timestamp.now(), 
      updatedAt: Timestamp.now() 
    });
    operationsCount++;
  }
  console.log(`📝 ${itensEstoque.length} itens de estoque criados`);
  
  // -------------------------------------------------------------------------
  // 2.5 MESAS (documento com subcoleção items)
  // -------------------------------------------------------------------------
  const mesasDocRef = dataCol.doc('mesas');
  batch.set(mesasDocRef, { 
    nome: 'Mesas', 
    createdAt: Timestamp.now(), 
    updatedAt: Timestamp.now() 
  });
  
  const mesasItemsRef = mesasDocRef.collection('items');
  for (let i = 1; i <= 20; i++) {
    const mesaId = `mesa_${String(i).padStart(2, '0')}`;
    batch.set(mesasItemsRef.doc(mesaId), {
      id: mesaId,
      restaurantId,
      numero: i,
      status: 'livre',
      pedidoAtivoId: null,
      garcomId: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    operationsCount++;
  }
  console.log(`📝 20 mesas criadas`);
  
  // -------------------------------------------------------------------------
  // 2.6 PEDIDOS (documento com subcoleção items) - vazio inicial
  // -------------------------------------------------------------------------
  const pedidosDocRef = dataCol.doc('pedidos');
  batch.set(pedidosDocRef, { 
    nome: 'Pedidos', 
    createdAt: Timestamp.now(), 
    updatedAt: Timestamp.now() 
  });
  operationsCount++;
  console.log(`📝 Pedidos (vazio) criado`);
  
  // -------------------------------------------------------------------------
  // 2.7 MOVIMENTAÇÕES ESTOQUE (documento com subcoleção items) - vazio inicial
  // -------------------------------------------------------------------------
  const movDocRef = dataCol.doc('movimentacoes_estoque');
  batch.set(movDocRef, { 
    nome: 'Movimentações Estoque', 
    createdAt: Timestamp.now(), 
    updatedAt: Timestamp.now() 
  });
  operationsCount++;
  console.log(`📝 Movimentações Estoque (vazio) criado`);
  
  // -------------------------------------------------------------------------
  // 2.7 USUÁRIOS (documento com subcoleção items)
  // -------------------------------------------------------------------------
  const usuariosDocRef = dataCol.doc('usuarios');
  batch.set(usuariosDocRef, { 
    nome: 'Usuários', 
    createdAt: Timestamp.now(), 
    updatedAt: Timestamp.now() 
  });
  // Admin user will be added after creation
  
  // -------------------------------------------------------------------------
  // EXECUTAR BATCH
  // -------------------------------------------------------------------------
  await batch.commit();
  console.log(`\n✅ ${operationsCount} operações escritas no Firestore`);
  
  // -------------------------------------------------------------------------
  // 3. USUÁRIO ADMIN + CUSTOM CLAIMS
  // -------------------------------------------------------------------------
  const adminUser = await getOrCreateAdminUser(auth, adminEmail, adminPassword, adminName, adminUid);
  
  await setCustomClaims(auth, adminUid, {
    restaurantId,
    papel: 'admin',
  });
  
  // 3.1 Documento do usuário na subcoleção items de usuarios
  const usuariosItemsRef = usuariosDocRef.collection('items');
  await usuariosItemsRef.doc(adminUser.uid).set({
    nome: adminName,
    papel: 'admin',
    ativo: true,
    restaurantId,
    criadoEm: Timestamp.now(),
    atualizadoEm: Timestamp.now(),
  });
  console.log(`👤 Documento do admin criado em: restaurantes/${restaurantId}/data/usuarios/items/${adminUid}`);
  
  // -------------------------------------------------------------------------
  // RESUMO
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('✅ SETUP CONCLUÍDO COM SUCESSO!');
  console.log('='.repeat(60));
  console.log(`🏪 Restaurante: ${restaurantName} (${restaurantId})`);
  console.log(`👤 Admin: ${adminEmail} (UID: ${adminUid})`);
  console.log(`🔐 Custom Claims: restaurantId=${restaurantId}, papel=admin`);
  console.log(`\n📋 Próximos passos:`);
  console.log(`   1. Login no app com: ${adminEmail} / ${adminPassword}`);
  console.log(`   2. Configure impressora em Configurações`);
  console.log(`   3. Ajuste preços/estoque conforme necessário`);
  console.log(`\n🔐 Regras Firestore recomendadas:`);
  console.log(`   match /restaurantes/{restaurantId}/data/{doc=**} {`);
  console.log(`     allow read, write: if request.auth != null`);
  console.log(`       && request.auth.token.restaurantId == restaurantId;`);
  console.log(`   }`);
}

// ============================================================================
// EXECUÇÃO
// ============================================================================
main()
  .then(() => { console.log('\n🏁 Script finalizado'); process.exit(0); })
  .catch((error) => { console.error('\n❌ Erro:', error); process.exit(1); });