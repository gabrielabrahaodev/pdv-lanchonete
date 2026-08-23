import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp, CollectionReference, DocumentReference, WriteBatch } from 'firebase-admin/firestore';
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
// DADOS ADICIONAIS
// ============================================================================
async function main() {
  console.log('🌱 Adicionando dados complementares...\n');
  
  const db = initializeFirebase();
  const restaurantId = CONFIG.restaurantId;
  const col = db.collection('restaurantes').doc(restaurantId).collection('data');
  
  const batch = db.batch();
  let count = 0;
  
  // -------------------------------------------------------------------------
  // 1. USUÁRIOS ADICIONAIS (para teste de papéis) - na subcoleção items de usuarios
  // -------------------------------------------------------------------------
  const usuariosDocRef = col.doc('usuarios');
  const usuariosItemsRef = usuariosDocRef.collection('items');
  
  const usuarios = [
    { uid: 'gerente_001', data: { nome: 'Gerente Geral', papel: 'gerente', email: 'gerente@lanchonete.com' } },
    { uid: 'caixa_001', data: { nome: 'Caixa Principal', papel: 'caixa', email: 'caixa@lanchonete.com' } },
    { uid: 'garcom_001', data: { nome: 'Garçom João', papel: 'garcom', email: 'garcom@lanchonete.com' } },
    { uid: 'cozinha_001', data: { nome: 'Cozinha Principal', papel: 'cozinha', email: 'cozinha@lanchonete.com' } },
  ];
  
  for (const u of usuarios) {
    batch.set(usuariosItemsRef.doc(u.uid), {
      ...u.data,
      papel: u.data.papel,
      ativo: true,
      restaurantId,
      criadoEm: Timestamp.now(),
      atualizadoEm: Timestamp.now(),
    });
    count++;
  }
  console.log(`👥 ${usuarios.length} usuários adicionais criados`);
  
  // -------------------------------------------------------------------------
  // 2. MOVIMENTAÇÕES DE ESTOQUE INICIAIS (entrada) - na subcoleção items de movimentacoes_estoque
  // -------------------------------------------------------------------------
  const movDocRef = col.doc('movimentacoes_estoque');
  const movItemsRef = movDocRef.collection('items');
  const hoje = Timestamp.now();
  
  const entradas = [
    { itemId: 'ing_pao', qtd: 100, tipo: 'entrada', custoUnitario: 0.80 },
    { itemId: 'ing_hamburguer', qtd: 80, tipo: 'entrada', custoUnitario: 2.50 },
    { itemId: 'ing_bacon', qtd: 2000, tipo: 'entrada', custoUnitario: 0.04 },
    { itemId: 'ing_queijo', qtd: 100, tipo: 'entrada', custoUnitario: 0.60 },
    { itemId: 'ing_alface', qtd: 5000, tipo: 'entrada', custoUnitario: 0.01 },
    { itemId: 'ing_tomate', qtd: 50, tipo: 'entrada', custoUnitario: 0.50 },
    { itemId: 'ing_batata', qtd: 20, tipo: 'entrada', custoUnitario: 8.00 },
    { itemId: 'ing_pao_hotdog', qtd: 50, tipo: 'entrada', custoUnitario: 0.70 },
    { itemId: 'ing_salsicha', qtd: 60, tipo: 'entrada', custoUnitario: 1.20 },
    { itemId: 'ing_refri_coca', qtd: 48, tipo: 'entrada', custoUnitario: 3.00 },
    { itemId: 'ing_refri_guarana', qtd: 36, tipo: 'entrada', custoUnitario: 2.80 },
    { itemId: 'ing_refri_sprite', qtd: 24, tipo: 'entrada', custoUnitario: 2.90 },
  ];
  
  for (const mov of entradas) {
    batch.set(movItemsRef.doc(), {
      restaurantId,
      tipo: mov.tipo,
      itemId: mov.itemId,
      qtd: mov.qtd,
      custoUnitario: mov.custoUnitario,
      custoTotal: mov.qtd * mov.custoUnitario,
      usuarioId: 'system',
      observacao: 'Estoque inicial',
      createdAt: hoje,
    });
    count++;
  }
  console.log(`📦 ${entradas.length} movimentações de entrada criadas`);
  
  // -------------------------------------------------------------------------
  // 3. SESSÃO DE CAIXA INICIAL - na subcoleção items de sessoes_caixa
  // -------------------------------------------------------------------------
  const caixaDocRef = col.doc('sessoes_caixa');
  batch.set(caixaDocRef, { 
    nome: 'Sessões Caixa', 
    createdAt: Timestamp.now(), 
    updatedAt: Timestamp.now() 
  });
  
  const caixaItemsRef = caixaDocRef.collection('items');
  batch.set(caixaItemsRef.doc('sessao_inicial'), {
    restaurantId,
    usuarioId: 'admin',
    abertoEm: Timestamp.now(),
    fechadoEm: null,
    valorInicial: 200.00,
    totalVendas: 0,
    totalRecebido: 0,
    sangrias: 0,
    suprimentos: 0,
    status: 'aberto',
    vendasPorFormaPagamento: {},
    quantidadePorProduto: {},
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  count++;
  console.log(`💰 Sessão de caixa inicial criada`);
  
  // -------------------------------------------------------------------------
  // 4. CONFIGURAÇÕES ADICIONAIS (atualizar documento configuracoes)
  // -------------------------------------------------------------------------
  const configRef = col.doc('configuracoes');
  batch.set(configRef, {
    impressoraTipo: 'bluetooth',
    impressoraEndereco: '',
    impressoraPorta: '',
    moeda: 'BRL',
    timezone: 'America/Sao_Paulo',
    formatoData: 'dd/MM/yyyy',
    formatoHora: 'HH:mm',
    casasDecimais: 2,
    separadorMilhar: '.',
    separadorDecimal: ',',
    taxaServico: 0,
    aceitaPix: true,
    aceitaCartao: true,
    aceitaDinheiro: true,
    exigeSenhaGerente: true,
    tempoSessaoMinutos: 480,
    backupAutomatico: true,
    updatedAt: Timestamp.now(),
  }, { merge: true });
  count++;
  console.log(`⚙️ Configurações expandidas`);
  
  // -------------------------------------------------------------------------
  // EXECUTAR
  // -------------------------------------------------------------------------
  await batch.commit();
  console.log(`\n✅ ${count} operações adicionais executadas`);
  console.log('\n📋 Resumo do que foi criado:');
  console.log(`   👥 4 usuários (gerente, caixa, garçom, cozinha)`);
  console.log(`   📦 12 movimentações de estoque (entrada inicial com custos)`);
  console.log(`   💰 1 sessão de caixa aberta com R$ 200,00`);
  console.log(`   ⚙️ Configurações completas de impressão/pagamento`);
}

// ============================================================================
// EXECUÇÃO
// ============================================================================
main()
  .then(() => { console.log('\n🏁 Seed completo!'); process.exit(0); })
  .catch((error) => { console.error('\n❌ Erro:', error); process.exit(1); });