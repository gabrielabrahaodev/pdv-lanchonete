"""Integração transacional real, restrita ao emulador e a projeto demo.

FIRESTORE_EMULATOR_HOST=127.0.0.1:8680 PYTHONPATH=backend python scripts/e2e/producao_emulator.py
"""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

assert os.environ.get('FIRESTORE_EMULATOR_HOST') == '127.0.0.1:8680', 'Use somente o emulador local'
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client, transactional
from fastapi import HTTPException
from app.services import base, producao_service as ps
from app.models.models import ProducaoCreate

client = Client(project='demo-p0a', credentials=AnonymousCredentials())
base.get_db = ps.get_db = lambda: client
rid = 'producao-' + uuid4().hex
for iid, custo in [('farinha', 5), ('fermento', 20)]:
    base.item_doc(rid, 'estoque', iid).set({'quantidadeAtual': 100, 'custoMedio': custo})
base.item_doc(rid, 'produtos', 'pao').set({'nome': 'Pão', 'ativo': True, 'modoEstoque': 'antecipado',
    'ingredientes': [{'itemId': 'farinha', 'qtd': 3}, {'itemId': 'fermento', 'qtd': 0.1}]})
payload = ProducaoCreate(produtoId='pao', quantidade=1, validade=datetime.now(timezone.utc)+timedelta(hours=24))
try:
    with ThreadPoolExecutor(2) as pool:
        resultados = list(pool.map(lambda _: ps.produzir(rid, 'u', payload, 'mesma-chave'), range(2)))
    assert resultados[0]['id'] == resultados[1]['id']
    lid = resultados[0]['id']
    assert base.get_item(rid, 'estoque', 'farinha')['quantidadeAtual'] == 97

    def reservar(numero):
        @transactional
        def run(t):
            itens = [{'id': str(numero), 'produtoId': 'pao', 'qtd': 1, 'modoEstoque': 'antecipado'}]
            gravar = ps.planejar_reservas(t, rid, str(numero), itens, 'u')
            gravar()
            return itens
        try:
            return run(client.transaction())
        except HTTPException as exc:
            assert exc.status_code == 409
            return None
    with ThreadPoolExecutor(2) as pool:
        reservas = list(pool.map(reservar, range(2)))
    assert sum(r is not None for r in reservas) == 1, reservas
    itens = next(r for r in reservas if r is not None)
    assert base.get_item(rid, 'lotes_producao', lid)['reservado'] == 1
    @transactional
    def entregar(t):
        gravar = ps.planejar_destino(t, rid, 'entrega', itens, 'entrega', 'u')
        gravar()
    entregar(client.transaction())
    lote = base.get_item(rid, 'lotes_producao', lid)
    assert lote['saldo'] == 0 and lote['reservado'] == 0 and not lote['aberto']
    assert base.get_item(rid, 'estoque', 'farinha')['quantidadeAtual'] == 97
    print('PASS: produção concorrente idempotente; última unidade reservada uma vez; entrega sem baixa dupla')
finally:
    for colecao in ['estoque', 'produtos', 'eventos_producao', 'lotes_producao', 'movimentacoes_producao', 'movimentacoes_estoque']:
        for doc in base.items_col(rid, colecao).stream():
            doc.reference.delete()
