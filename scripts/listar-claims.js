// Lista usuários do Firebase Auth e os custom claims (SÓ LEITURA, nada escrito).
// Uso: node listar-claims.js
const admin = require('firebase-admin');
const path = require('path');

const saPath = path.resolve(__dirname, './service-account.json');
const app = admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });

(async () => {
  let nextPageToken;
  const users = [];
  do {
    const res = await app.auth().listUsers(1000, nextPageToken);
    for (const u of res.users) {
      users.push({
        email: u.email,
        uid: u.uid,
        emailVerified: u.emailVerified,
        claims: u.customClaims || {},
      });
    }
    nextPageToken = res.pageToken;
  } while (nextPageToken);
  for (const u of users) {
    const { restaurantId, papel } = u.claims;
    console.log(
      `${u.email?.padEnd(40)} ${u.uid} claims={restaurantId: ${restaurantId ?? '—'}, papel: ${papel ?? '—'}}`
    );
  }
  console.log(`\nTotal: ${users.length} usuários`);
})();
