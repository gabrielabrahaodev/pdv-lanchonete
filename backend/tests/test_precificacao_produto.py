import pytest
from pydantic import ValidationError
from app.models.models import ProductCreate, ProductUpdate


def test_produto_legado_e_percentual_camel_case():
    payload = ProductCreate(nome='Lanche', categoriaId='cat', preco=12)
    assert payload.acrescimo_lucro_percentual == 0
    for percentual in [0, 50.5, 150]:
        created = ProductCreate(nome='Lanche', categoriaId='cat', preco=12, acrescimoLucroPercentual=percentual)
        assert created.model_dump(by_alias=True)['acrescimoLucroPercentual'] == percentual
        assert ProductUpdate(acrescimoLucroPercentual=percentual).acrescimo_lucro_percentual == percentual
    assert ProductUpdate(nome='Novo nome').acrescimo_lucro_percentual is None


@pytest.mark.parametrize('valor', [-1, float('inf'), float('-inf'), float('nan')])
def test_rejeita_percentual_invalido(valor):
    with pytest.raises(ValidationError):
        ProductCreate(nome='Lanche', categoriaId='cat', preco=12, acrescimoLucroPercentual=valor)
    with pytest.raises(ValidationError):
        ProductUpdate(acrescimoLucroPercentual=valor)


def test_criar_editar_e_reabrir_preserva_percentual(db):
    from app.services import produtos_service
    produto = produtos_service.criar('r1', ProductCreate(nome='Lanche', categoriaId='cat', preco=12, acrescimoLucroPercentual=50))
    assert produto['acrescimoLucroPercentual'] == 50
    produtos_service.atualizar('r1', produto['id'], ProductUpdate(acrescimoLucroPercentual=80))
    produtos_service.atualizar('r1', produto['id'], ProductUpdate(nome='Outro nome'))
    assert produtos_service.obter('r1', produto['id'])['acrescimoLucroPercentual'] == 80
