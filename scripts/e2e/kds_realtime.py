"""Teste opcional do KDS real no navegador com Firestore Emulator.

Requer Vite em 127.0.0.1:5173 e Playwright/Chromium instalados.
PDV_PLAYWRIGHT_MODULE pode apontar para o pacote Playwright externo ao projeto.
Execute exclusivamente por firebase emulators:exec --only firestore --project demo-p0a.
Autenticação é simulada; snapshots, regras, serviços, componente e hooks são reais.
"""

import os
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from uuid import uuid4
from pathlib import Path
from datetime import datetime, timezone

assert os.environ.get("FIRESTORE_EMULATOR_HOST") == "127.0.0.1:8680"
from google.cloud.firestore import Client
from google.auth.credentials import AnonymousCredentials
from app.services import (
    base,
    pedidos_service as pedidos,
    caixa_service as caixa,
    agregados_service as agregados,
)

client = Client(project="demo-p0a", credentials=AnonymousCredentials())
for mod in [base, pedidos, caixa, agregados]:
    mod.get_db = lambda: client
rid = "kds-" + uuid4().hex
os.environ["PDV_KDS_RID"] = rid
doc = lambda kind, id: base.item_doc(rid, kind, id)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        pid = "pmesa" if self.path == "/pagar-mesa" else "pbalcao"
        caixa.registrar_pagamento(
            rid, "qa", pid, tipo="pix", valor=10, idempotency_key="pagamento"
        )
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")

    def log_message(self, *args):
        pass


server = HTTPServer(("127.0.0.1", 8766), Handler)
try:
    doc("usuarios", "qa").set({"ativo": True, "papel": "admin"})
    doc("produtos", "p").set({"nome": "Produto QA", "preco": 10, "ativo": True})
    doc("mesas", "mesa_1").set(
        {"numero": 1, "status": "ocupada", "pedidoAtivoId": "pmesa"}
    )
    doc("sessoes_caixa", "s").set(
        {"status": "aberto", "totalVendas": 0, "totalRecebido": 0}
    )
    for pid, tipo in [("pmesa", "local"), ("pbalcao", "balcao")]:
        doc("pedidos", pid).set(
            {
                "tipo": tipo,
                "mesaId": "mesa_1" if tipo == "local" else None,
                "status": "aberto",
                "cozinhaPendente": True,
                "total": 10,
                "pagamentos": [],
                "createdAt": datetime.now(timezone.utc),
                "itens": [
                    {
                        "id": "i",
                        "produtoId": "p",
                        "produtoNome": "Produto QA",
                        "qtd": 1,
                        "precoUnitario": 10,
                        "status": "pendente",
                    }
                ],
            }
        )
    Thread(target=server.serve_forever, daemon=True).start()
    subprocess.run(
        [
            "node",
            str(
                Path(__file__).resolve().parents[2] / "frontend/tests/kds-realtime.cjs"
            ),
        ],
        check=True,
    )
finally:
    server.shutdown()
    server.server_close()
    for kind in [
        "usuarios",
        "produtos",
        "mesas",
        "sessoes_caixa",
        "pedidos",
        "eventos_pagamento",
        "eventos_agregados",
        "agregados_diarios",
        "agregados_mensais",
    ]:
        for snap in base.items_col(rid, kind).stream():
            snap.reference.delete()
