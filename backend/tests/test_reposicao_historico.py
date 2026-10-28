from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
from app.services import reposicao_service as rep
from tests.conftest import seed


def test_pagina_status_datas_cursor_e_tenant(db):
    for i in range(5):
        seed(db,'r1','pedidos_reposicao',str(i),{'status':'recebido' if i<3 else 'gerado','createdAt':datetime(2026,10,i+1,tzinfo=timezone.utc)})
    seed(db,'r1','pedidos_reposicao','cancelado',{'status':'cancelado','createdAt':datetime.now(timezone.utc)})
    p=rep.listar_pagina('r1','recebido',2)
    assert [d['id'] for d in p['items']]==['2','1']
    assert [d['id'] for d in rep.listar_pagina('r1','recebido',2,p['nextCursor'])['items']]==['0']
    assert {d['id'] for d in rep.listar_pagina('r1','gerado')['items']}=={'3','4'}
    assert rep.listar_pagina('r2','recebido')['items']==[]
    with pytest.raises(HTTPException):rep.listar_pagina('r1','invalido')
    with pytest.raises(HTTPException):rep.listar_pagina('r1','gerado',2,'2')


def test_api_historico_guarda_papeis(db):
    from app.main import app
    from app.core.security import CurrentAuth,get_current_auth
    from fastapi.testclient import TestClient
    try:
        for papel,expected in [('admin',200),('gerente',200),('garcom',403),('cozinha',403),('caixa',403)]:
            app.dependency_overrides[get_current_auth]=lambda papel=papel:CurrentAuth('u',None,'r1',papel)
            assert TestClient(app).get('/api/reposicao/pedidos/pagina?status=recebido').status_code==expected
    finally:app.dependency_overrides.clear()
