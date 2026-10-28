"""Período civil e invalidação do BI após despesa. Emulador apenas."""
import os
from datetime import datetime,date,timezone
from uuid import uuid4
assert os.environ.get('FIRESTORE_EMULATOR_HOST')=='127.0.0.1:8680'
from google.auth.credentials import AnonymousCredentials
from google.cloud.firestore import Client
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import CurrentAuth,get_current_auth
from app.services import base,bi_service as bi,agregados_service as ag,despesas_service as ds
from app.models.models import DespesaCreate
c=Client(project='demo-p0a',credentials=AnonymousCredentials())
for mod in [base,bi,ag,ds]:mod.get_db=lambda:c
rid='financeiro-ux-'+uuid4().hex
app.dependency_overrides[get_current_auth]=lambda:CurrentAuth('u',None,rid,'admin')
try:
    api=TestClient(app)
    antes=api.get('/api/bi/visao-geral?inicio=2026-10-02&fim=2026-10-02')
    assert antes.status_code==200 and antes.json()['atual']['operacionais']==0
    despesa=ds.criar(rid,DespesaCreate(descricao='Despesa de teste',categoria='folha',valor=12,data=datetime(2026,10,2,4,tzinfo=timezone.utc)))
    depois=api.get('/api/bi/visao-geral?inicio=2026-10-02&fim=2026-10-02')
    assert depois.status_code==200 and depois.json()['atual']['operacionais']==12
    base.item_doc(rid,'despesas','dia-anterior').set({'data':datetime(2026,10,2,1,tzinfo=timezone.utc),'valor':5,'status':'pendente'})
    pagina=api.get('/api/despesas/pagina?data_inicio=2026-10-02&data_fim=2026-10-02')
    assert pagina.status_code==200 and [d['id'] for d in pagina.json()['items']]==[despesa['id']]
    assert 'indicadores' in depois.json()
    print('PASS financeiro: período civil São Paulo filtrado no Firestore e BI atualizado após commit de despesa')
finally:
    app.dependency_overrides.clear();bi._CACHE.clear()
    for pai in c.document(f'restaurantes/{rid}').collection('data').stream():
        for sub in pai.reference.collections():
            for s in sub.stream():s.reference.delete()
        pai.reference.delete()
    c.document(f'restaurantes/{rid}').delete()
