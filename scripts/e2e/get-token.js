// Gera um ID token do Firebase para testar a API FastAPI.
// Requer `npm install` em ../scripts (pacote firebase client).
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const fs = require('fs');

const firebaseConfig = {
  apiKey: 'AIzaSyDqzQ8D8e8wDM8wgw57l_1SZDzZjNdy3Y4',
  authDomain: 'pdv-lanchonete-1fa79.firebaseapp.com',
  projectId: 'pdv-lanchonete-1fa79',
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const cred = await signInWithEmailAndPassword(auth, 'admin@restaurante.com', 'SenhaForte123!');
  const token = await cred.user.getIdToken();
  const claims = await cred.user.getIdTokenResult();
  fs.writeFileSync(__dirname + '/token.txt', token);
  console.log('uid:', cred.user.uid);
  console.log('claims:', JSON.stringify(claims.claims));
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });
