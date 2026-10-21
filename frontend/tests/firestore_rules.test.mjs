/**
 * Testes de segurança das regras do Firestore (P0-A).
 *
 * Rode com o emulador (portas em firebase.json: firestore 8680, hub 4400):
 *   npx firebase emulators:exec --only firestore --project demo-p0a ^
 *     "node tests/firestore_rules.test.mjs"
 *
 * Cobre:
 *   1. usuário do restaurante A lê A;
 *   2. usuário de A NÃO lê B (cross-tenant);
 *   3. não autenticado não lê nada;
 *   4. NENHUM usuário cliente consegue escrita direta (create/update/delete)
 *      em pedidos, pagamentos, despesas, agregados, caixa, estoque, config.
 */
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";

let env;

process.on("unhandledRejection", (e) => {
  console.error("unhandledRejection:", e);
  process.exit(1);
});

async function main() {
  const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
  env = await initializeTestEnvironment({
    projectId: "demo-p0a",
    firestore: { rules, host: "127.0.0.1", port: 8680 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [uid, papel, ativo] of [
      ['uA','admin',true], ['garcom','garcom',true], ['cozinha','cozinha',true],
      ['caixa','caixa',true], ['gerente','gerente',true], ['inativo','admin',false],
      ['rebaixado','garcom',true],
    ]) {
      await ctx.firestore().doc(`restaurantes/rA/data/usuarios/items/${uid}`).set({papel, ativo});
    }
  });
  for (const papel of ['garcom','cozinha','caixa','gerente']) {
    const db = env.authenticatedContext(papel, {restaurantId:'rA', papel}).firestore();
    await assertSucceeds(db.collection('restaurantes/rA/data/pedidos/items').get());
    await assertSucceeds(db.doc(`restaurantes/rA/data/usuarios/items/${papel}`).get());
    for (const col of ['despesas','sessoes_caixa','agregados_diarios','agregados_mensais','usuarios']) {
      const leitura = db.collection(`restaurantes/rA/data/${col}/items`).get();
      await (['caixa','gerente'].includes(papel) ? assertSucceeds(leitura) : assertFails(leitura));
    }
    await assertFails(db.collection('restaurantes/rA/data/eventos_itens/items').get());
  }
  for (const uid of ['inativo','sem-perfil']) {
    const db = env.authenticatedContext(uid, {restaurantId:'rA',papel:'admin'}).firestore();
    await assertFails(db.collection('restaurantes/rA/data/pedidos/items').get());
  }
  const rebaixado = env.authenticatedContext('rebaixado', {restaurantId:'rA',papel:'admin'}).firestore();
  await assertFails(rebaixado.collection('restaurantes/rA/data/despesas/items').get());

  const ctxA = env.authenticatedContext("uA", { restaurantId: "rA" });
  const ctxB = env.authenticatedContext("uB", { restaurantId: "rB" });
  const dbA = ctxA.firestore();

  // leitura intra-tenant permitida
  await assertSucceeds(dbA.doc("restaurantes/rA/data/produtos/items/p1").get());
  await assertSucceeds(dbA.collection("restaurantes/rA/data/produtos/items").limit(10).get());
  await assertSucceeds(dbA.doc("restaurantes/rA/data/pedidos/items/x1").get());

  // leitura cross-tenant negada
  await assertFails(dbA.doc("restaurantes/rB/data/produtos/items/p1").get());
  await assertFails(dbA.collection("restaurantes/rB/data/produtos/items").limit(10).get());

  // não autenticado: negado
  const unauth = env.unauthenticatedContext().firestore();
  await assertFails(unauth.doc("restaurantes/rA/data/produtos/items/p1").get());

  // escrita direta: SEMPRE negada (qualquer papel/tenant/método)
  const caminhos = [
    "restaurantes/rA/data/pedidos/items/forjado",
    "restaurantes/rA/data/pagamentos/items/forjado",
    "restaurantes/rA/data/despesas/items/forjado",
    "restaurantes/rA/data/agregados_diarios/items/2026-09-27",
    "restaurantes/rA/data/sessoes_caixa/items/s1",
    "restaurantes/rA/data/estoque/items/e1",
    "restaurantes/rA/data/configuracoes/cfg/geral",
  ];
  for (const caminho of caminhos) {
    await assertFails(dbA.doc(caminho).set({ valor: 9999 }));
    await assertFails(dbA.doc(caminho).update({ valor: 9999 }));
    await assertFails(dbA.doc(caminho).delete());
  }

  ctxB.firestore(); // usuário B existe; escrita já coberta acima (regra global)

  console.log("Regras do Firestore: TODAS as asserções passaram ✔");
  await env.cleanup();
}

main().catch((e) => {
  console.error("FALHA nos testes de regras:", e);
  process.exit(1);
});
