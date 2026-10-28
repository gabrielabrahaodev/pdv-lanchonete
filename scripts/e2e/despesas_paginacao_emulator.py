"""Regressão HTTP/SDK real: paginação sem filtros não pode gerar TypeError."""
import os
from datetime import datetime, timezone, timedelta
from uuid import uuid4
assert os.environ.get('FIRESTORE_EMULATOR_HOST') == '127.0.0.1:8680'
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import CurrentAuth, get_current_auth
from app.services import base

client=Client(project='demo-p0a',credentials=AnonymousCredentials())
base.get_db=lambda:client
rid='despesas-pagina-'+uuid4().hex
app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('teste',None,rid,'admin')
try:
    api=TestClient(app)
    for i in range(3):
        base.item_doc(rid,'despesas',f'd{i}').set({'data':datetime(2026,10,1,tzinfo=timezone.utc)+timedelta(days=i), 'descricao':'Teste local','valor':10,'status':'pendente','categoria':'insumo'})
    r=api.get('/api/despesas/pagina?limit=2&status=&categoria=')
    assert r.status_code==200, r.text
    assert [d['id'] for d in r.json()['items']]==['d2','d1']
    prox=api.get('/api/despesas/pagina',params={'limit':2,'cursor':r.json()['nextCursor']})
    assert prox.status_code==200 and [d['id'] for d in prox.json()['items']]==['d0']
    assert prox.json()['nextCursor'] is None
    filtrado=api.get('/api/despesas/pagina?limit=2&status=pago&categoria=insumo')
    assert filtrado.status_code==200 and filtrado.json()['items']==[] and filtrado.json()['nextCursor']
    janela=api.get('/api/despesas/pagina',params={'limit':2,'inicio':'2026-10-02T00:00:00Z'})
    assert janela.status_code==200 and len(janela.json()['items'])==2
    app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('teste',None,rid+'-outro','admin')
    assert api.get('/api/despesas/pagina?limit=2').json()['items']==[]
    print('PASS: HTTP pagina despesas com SDK real, filtros vazios, cursor, datas e isolamento')
finally:
    app.dependency_overrides.clear()
    for snap in base.items_col(rid,'despesas').stream():snap.reference.delete()
