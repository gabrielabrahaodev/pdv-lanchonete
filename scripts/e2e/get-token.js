// Gera um ID token do Firebase para testar a API FastAPI.
// Requer `npm install` em ../scripts (pacote firebase client).
//
// Uso:
//   node get-token.js                                  -> admin@restaurante.com em token.txt
//   node get-token.js <email> <senha> [arquivo-saida]  -> credenciais customizadas
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
  const email = emailArg || 'admin@restaurante.com';
  const senha = senhaArg || 'SenhaForte123!';
  const arquivo = arquivoArg || 'token.txt';

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
