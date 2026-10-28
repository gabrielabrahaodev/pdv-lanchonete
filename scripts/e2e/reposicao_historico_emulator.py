"""Estados, histórico e recebimento retroativo. Somente emulador local."""
import os
from datetime import date, datetime, timezone
from uuid import uuid4
assert os.environ.get('FIRESTORE_EMULATOR_HOST')=='127.0.0.1:8680'
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from fastapi import HTTPException
from app.services import base,agregados_service as ag,reposicao_service as rep
from app.models.models import PedidoReposicaoCreate,ItemReposicao,ReceberPedidoReposicao,ItemRecebimentoReposicao
c=Client(project='demo-p0a',credentials=AnonymousCredentials());base.get_db=lambda:c;ag.get_db=lambda:c
rid='repo-historico-'+uuid4().hex
def doc(k,i):return base.item_doc(rid,k,i)
try:
    base.config_doc(rid).set({'nome':'Restaurante teste','endereco':'Rua teste 1'})
    doc('fornecedores','f').set({'nome':'Fornecedor','ativo':True,'telefone':'11987654321'})
    doc('estoque','i').set({'nome':'Farinha','ativo':True,'unidade':'g','quantidadeAtual':0,'minimo':100,'custoMedio':.008,'fornecedorId':'f','unidadeCompra':'kg'})
    p=rep.criar(rid,'u',PedidoReposicaoCreate(fornecedor_id='f',itens=[ItemReposicao(item_id='i',quantidade=1000)],mensagem='Teste'))
    assert rep.listar_pagina(rid,'gerado')['items'][0]['id']==p['id']
    payload=ReceberPedidoReposicao(data_recebimento=date(2026,9,20),itens=[ItemRecebimentoReposicao(item_id='i',quantidade_compra=2,unidade_compra='kg',valor_total_compra=16)])
    recebido=rep.receber(rid,'u',p['id'],payload,usuario_nome='Gerente teste')
    assert rep.listar_pagina(rid,'gerado')['items']==[]
    hist=rep.listar_pagina(rid,'recebido')['items'][0]
    assert hist['dataRecebimentoLocal']=='2026-09-20' and hist['recebidoEm'].date()!=date(2026,9,20)
    assert hist['recebidoPorNome']=='Gerente teste' and hist['recebimento'][0]['quantidade']==2000
    assert hist['valorTotalRecebido']==16 and doc('despesas',hist['despesaId']).get().to_dict()['valor']==16
    try:rep.receber(rid,'u',p['id'],payload);raise AssertionError('Não pode receber duas vezes')
    except HTTPException as e:assert e.status_code==409
    assert doc('estoque','i').get().to_dict()['quantidadeAtual']==2000
    assert len(list(base.items_col(rid,'despesas').stream()))==1
    doc('estoque','i').update({'quantidadeAtual':0})
    cancelado=rep.criar(rid,'u',PedidoReposicaoCreate(fornecedor_id='f',itens=[ItemReposicao(item_id='i',quantidade=1000)],mensagem='Teste cancelado'))
    rep.cancelar(rid,'u',cancelado['id'])
    assert rep.listar_pagina(rid,'cancelado')['items'][0]['id']==cancelado['id']
    assert rep.listar_pagina(rid,'gerado')['items']==[]
    assert len(rep.listar_pagina(rid,'recebido')['items'])==1
    assert rep.listar_pagina(rid+'-outro','recebido')['items']==[]
    print('PASS reposição: estados separados, recebimento retroativo 2kg/R$16, débito único, repetição bloqueada e tenant')
finally:
    for pai in c.document(f'restaurantes/{rid}').collection('data').stream():
        for sub in pai.reference.collections():
            for s in sub.stream():s.reference.delete()
        pai.reference.delete()
    c.document(f'restaurantes/{rid}').delete()
