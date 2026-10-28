"""Concorrência de fechamento, conferência, compras e último admin. Apenas emulador."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import HTTPException

assert (
    os.environ.get("FIRESTORE_EMULATOR_HOST") == "127.0.0.1:8680"
), "Use somente emulador local"
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from app.models.models import (
    OrderItemAdd,
    ProducaoCreate,
    MovementCreate,
    ConferenciaReserva,
)
from app.services import (
    base,
    pedidos_service as pedidos,
    caixa_service as caixa,
    producao_service as producao,
    agregados_service as agregados,
    estoque_service as estoque,
    usuarios_service as usuarios,
)

client = Client(project="demo-p0a", credentials=AnonymousCredentials())
for mod in [base, pedidos, caixa, producao, agregados, estoque, usuarios]:
    mod.get_db = lambda: client
rid = "evolucao-" + uuid4().hex
doc = lambda kind, id: base.item_doc(rid, kind, id)
col = lambda kind: base.items_col(rid, kind)


def resultado(fn):
    try:
        return fn()
    except HTTPException as e:
        return e.status_code


try:
    doc("estoque", "farinha").set(
        {
            "nome": "Farinha",
            "unidade": "g",
            "quantidadeAtual": 10000,
            "custoMedio": 0.01,
        }
    )
    doc("produtos", "pao").set(
        {
            "nome": "Pão",
            "ativo": True,
            "preco": 3,
            "precisaPreparar": True,
            "modoEstoque": "antecipado",
            "ingredientes": [{"itemId": "farinha", "qtd": 100}],
        }
    )
    doc("mesas", "m").set({"numero": 1, "status": "livre"})
    doc("sessoes_caixa", "s").set(
        {"status": "aberto", "totalVendas": 0, "totalRecebido": 0}
    )
    lote = producao.produzir(
        rid,
        "u",
        ProducaoCreate(
            produtoId="pao",
            quantidade=10,
            validade=datetime.now(timezone.utc) + timedelta(days=1),
        ),
        "fornada",
    )
    p = pedidos.criar(rid, "u", "m", "local", [OrderItemAdd(produtoId="pao", qtd=3)])

    def pagar():
        return resultado(
            lambda: caixa.registrar_pagamento(
                rid, "u", p["id"], tipo="pix", valor=9, idempotency_key="final"
            )
        )

    with ThreadPoolExecutor(2) as pool:
        pagos = list(pool.map(lambda _: pagar(), range(2)))
    assert sum(isinstance(r, dict) for r in pagos) == 1 and 409 in pagos
    pedido = doc("pedidos", p["id"]).get().to_dict()
    assert (
        pedido["status"] == "pago"
        and pedido["cozinhaPendente"] is False
        and pedido["itens"][0]["status"] == "pendente"
    )
    assert doc("mesas", "m").get().to_dict()["status"] == "livre"
    assert doc("sessoes_caixa", "s").get().to_dict()["totalVendas"] == 9
    l = doc("lotes_producao", lote["id"]).get().to_dict()
    assert l["saldo"] == 10 and l["reservado"] == 3
    iid = pedido["itens"][0]["id"]

    def conferir(acao):
        return resultado(
            lambda: pedidos.conferir_reserva(
                rid,
                "u",
                p["id"],
                iid,
                ConferenciaReserva(acao=acao, motivo="Conferência física"),
            )
        )

    with ThreadPoolExecutor(2) as pool:
        conferidos = list(pool.map(conferir, ["consumido", "devolver"]))
    assert sum(isinstance(r, dict) for r in conferidos) == 1 and 409 in conferidos
    l = doc("lotes_producao", lote["id"]).get().to_dict()
    assert l["reservado"] == 0 and l["saldo"] in [7, 10]
    compra = MovementCreate(
        itemId="farinha", tipo="entrada", qtd=1, unidade="kg", valorTotalCompra=20
    )
    with ThreadPoolExecutor(2) as pool:
        list(
            pool.map(
                lambda _: resultado(
                    lambda: estoque.registrar_movimentacao(rid, "u", compra, "compra")
                ),
                range(2),
            )
        )
    # Contenção esgotada retorna 409. Reenvio com a MESMA chave deve concluir
    # ou apenas consultar o lançamento já aplicado, nunca duplicá-lo.
    estoque.registrar_movimentacao(rid, "u", compra, "compra")
    assert doc("estoque", "farinha").get().to_dict()["quantidadeAtual"] == 10900
    for uid in ["a", "b"]:
        doc("usuarios", uid).set({"nome": uid, "papel": "admin", "ativo": True})

    def desativar(uid):
        return resultado(
            lambda: usuarios._alterar_perfil(
                rid, "admin", uid, {"ativo": False}, "operador"
            )
        )

    with ThreadPoolExecutor(2) as pool:
        admins = list(pool.map(desativar, ["a", "b"]))
    assert 409 in admins
    assert (
        sum((doc("usuarios", uid).get().to_dict()["ativo"] for uid in ["a", "b"])) == 1
    )
    assert (
        sum(
            d.to_dict().get("totalPedidos", 0)
            for d in col("agregados_diarios").stream()
        )
        == 1
    )
    print(
        "PASS: pagamentos concorrentes, reserva retida, decisões conflitantes, compra idempotente e último admin protegidos em Firestore real emulado"
    )
finally:
    for kind in [
        "estoque",
        "produtos",
        "mesas",
        "sessoes_caixa",
        "pedidos",
        "usuarios",
        "controle_acessos",
        "auditoria_acessos",
        "eventos_estoque",
        "eventos_itens",
        "eventos_pagamento",
        "eventos_agregados",
        "agregados_diarios",
        "agregados_mensais",
        "eventos_producao",
        "lotes_producao",
        "movimentacoes_producao",
        "movimentacoes_estoque",
    ]:
        for snap in col(kind).stream():
            snap.reference.delete()
