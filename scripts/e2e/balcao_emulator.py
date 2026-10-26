"""Venda de balcao concorrente. Somente Firestore emulator local/demo-p0a."""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4
assert os.environ.get('FIRESTORE_EMULATOR_HOST') == '127.0.0.1:8680', 'Use somente emulador local'
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from app.models.models import OrderItemAdd, ProducaoCreate
from app.services import base, pedidos_service as pedidos, caixa_service as caixa, producao_service as producao, agregados_service as agregados

client = Client(project='demo-p0a', credentials=AnonymousCredentials())
for mod in [base,pedidos,caixa,producao,agregados]:
    mod.get_db=lambda:client
rid='balcao-'+uuid4().hex
col=lambda kind:base.items_col(rid,kind)
doc=lambda kind,id:base.item_doc(rid,kind,id)
try:
    for id in ['agua','farinha']:
        doc('estoque',id).set({'quantidadeAtual':100,'custoMedio':5})
    doc('produtos','bebida').set({'nome':'Bebida','ativo':True,'preco':6,'precisaPreparar':False,'ingredientes':[{'itemId':'agua','qtd':1},{'itemId':'farinha','qtd':0.1}]})
    doc('produtos','pao').set({'nome':'Pao','ativo':True,'preco':3,'precisaPreparar':False,'modoEstoque':'antecipado','ingredientes':[{'itemId':'farinha','qtd':1}]})
    doc('sessoes_caixa','s').set({'status':'aberto','totalVendas':0,'totalRecebido':0,'vendasPorFormaPagamento':{}})
    doc('mesas','mesa01').set({'numero':1,'status':'livre'})
    lote=producao.produzir(rid,'u',ProducaoCreate(produtoId='pao',quantidade=10,validade=datetime.now(timezone.utc)+timedelta(days=1)),'fornada')
    itens=[OrderItemAdd(produtoId='bebida',qtd=2),OrderItemAdd(produtoId='pao',qtd=2)]
    with ThreadPoolExecutor(2) as pool:
        criados=list(pool.map(lambda _:pedidos.criar_balcao(rid,'u',itens,'mesma-venda'),range(2)))
    pid=criados[0]['id']
    assert all(p['id']==pid and p['mesaId'] is None for p in criados)
    assert len(list(col('pedidos').stream()))==1
    assert doc('estoque','agua').get().to_dict()['quantidadeAtual']==98
    with ThreadPoolExecutor(2) as pool:
        pagos=list(pool.map(lambda _:caixa.registrar_pagamento(rid,'u',pid,tipo='pix',valor=18,idempotency_key='mesmo-pagamento',entregar_prontos=True),range(2)))
    assert all(p['status']=='pago' and len(p['pagamentos'])==1 for p in pagos)
    assert doc('sessoes_caixa','s').get().to_dict()['totalVendas']==18
    assert doc('mesas','mesa01').get().to_dict()=={'numero':1,'status':'livre'}
    l=doc('lotes_producao',lote['id']).get().to_dict()
    assert l['saldo']==8 and l['reservado']==0
    assert sum(d.to_dict().get('faturamento',0) for d in col('agregados_diarios').stream())==18
    assert sum(d.to_dict().get('saidasPorItem',{}).get('agua',0) for d in col('agregados_diarios').stream())==2
    print('PASS: criacao e pagamento concorrentes sem duplicar venda, estoque, caixa ou agregado; entrega de estufa sem mesa')
finally:
    for kind in ['estoque','produtos','sessoes_caixa','mesas','pedidos','eventos_itens','eventos_pagamento','eventos_agregados','agregados_diarios','agregados_mensais','eventos_producao','lotes_producao','movimentacoes_producao','movimentacoes_estoque']:
        for snap in col(kind).stream():snap.reference.delete()
