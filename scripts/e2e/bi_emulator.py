"""BI concorrente e custo de lote, somente no emulador local demo-p0a."""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4
assert os.environ.get('FIRESTORE_EMULATOR_HOST') == '127.0.0.1:8680'
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from fastapi import HTTPException
from app.models.models import ProducaoCreate, OrderItemAdd
from app.services import base, pedidos_service as pedidos, producao_service as prod, caixa_service as caixa, agregados_service as ag, bi_service as bi
from app.services.lucratividade import chave
client=Client(project='demo-p0a',credentials=AnonymousCredentials())
for mod in [base,pedidos,prod,caixa,ag,bi]:mod.get_db=lambda:client
rid='bi-'+uuid4().hex
def doc(kind,id):return base.item_doc(rid,kind,id)
def executar():
    doc('estoque','farinha').set({'unidade':'g','nome':'Farinha','quantidadeAtual':10000,'custoMedio':.008})
    doc('produtos','p').set({'nome':'Salgado','ativo':True,'modoEstoque':'antecipado','preco':5,'rendimentoReceita':40,'ingredientes':[{'itemId':'farinha','qtd':1000}]})
    doc('mesas','m').set({'numero':1,'status':'livre'})
    lote=prod.produzir(rid,'u',ProducaoCreate(produto_id='p',receitas=1,quantidade=40,validade=datetime.now(timezone.utc)+timedelta(days=3),local='estufa'),'fornada')
    p=pedidos.criar(rid,'u','m','local',[OrderItemAdd(produto_id='p',qtd=25)])
    def pagar(_):
        try:return caixa.registrar_pagamento(rid,'u',p['id'],tipo='pix',valor=125)
        except HTTPException as e:return e.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:res=list(pool.map(pagar,range(2)))
    assert sum(isinstance(r,dict) for r in res)==1
    diarios=list(base.items_col(rid,'agregados_diarios').stream())
    assert len(diarios)==1
    row=diarios[0].to_dict()['produtosVendidos'][chave('p')]
    assert row['quantidade']==25 and row['liquidaCentavos']==12500 and row['custoEscalado']==500000000
    assert doc('lotes_producao',lote['id']).get().to_dict()['saldo']==40 # reserva não equivale a entrega
    doc('estoque','farinha').update({'custoMedio':.08})
    assert diarios[0].reference.get().to_dict()['produtosVendidos'][chave('p')]==row
    print('PASS BI emulado: 40 produzidos, 25 vendidos, quitação concorrente única, custo congelado e reserva sem entrega presumida')
try:executar()
finally:
    for parent in client.document(f'restaurantes/{rid}').collection('data').stream():
        for sub in parent.reference.collections():
            for snap in sub.stream():snap.reference.delete()
        parent.reference.delete()
    client.document(f'restaurantes/{rid}').delete()

# Regressão adicional do painel, usando o mesmo emulador do CI.
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name('financeiro_usabilidade_emulator.py')))
