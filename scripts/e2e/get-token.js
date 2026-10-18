// Gera um ID token do Firebase para testar a API FastAPI.
// Requer `npm install` em ../scripts (pacote firebase client).
//
// Credenciais NUNCA hardcoded: passe por argumento ou env.
//
// Uso:
//   node get-token.js <email> <senha> [arquivo-saida]
//   (ou) $env:E2E_EMAIL='...'; $env:E2E_SENHA='...'; node get-token.js [arquivo-saida]
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const fs = require('fs');

const firebaseConfig = {
  apiKey: 'AIzaSyDqzQ8D8e8wDM8wgw57l_1SZDzZjNdy3Y4',
  authDomain: 'pdv-lanchonete-1fa79.firebaseapp.com',
  projectId: 'pdv-lanchonete-1fa79',
};

async function main() {
  const [, , emailArg, senhaArg, arquivoArg] = process.argv;
  const email = emailArg || process.env.E2E_EMAIL;
  const senha = senhaArg || process.env.E2E_SENHA;
  const arquivo = arquivoArg || 'token.txt';
  if (!email || !senha) {
    console.error('Informe: node get-token.js <email> <senha> [saida] — ou env E2E_EMAIL/E2E_SENHA.');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  const token = await cred.user.getIdToken();
  const claims = await cred.user.getIdTokenResult();
  fs.writeFileSync(__dirname + '/' + arquivo, token);
  console.log('uid:', cred.user.uid);
  console.log('claims:', JSON.stringify(claims.claims));
  console.log('salvo em:', arquivo);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });
