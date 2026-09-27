"""Flag precisa_preparar do produto (TDD RED->GREEN).

Itens de produtos que não precisam de preparo nascem `entregue`
e não aparecem na fila da cozinha.
"""
from app.models.models import ProductCreate, ProductUpdate


class TestPrecisaPreparar:
    def test_default_true_no_create(self):
        p = ProductCreate(nome="X-Burger", categoria_id="c1", preco=25.9)
        assert p.precisa_preparar is True

    def test_false_persiste_no_create(self):
        p = ProductCreate(nome="Suco", categoria_id="c1", preco=8, precisa_preparar=False)
        assert p.precisa_preparar is False
        assert p.model_dump(by_alias=True)["precisaPreparar"] is False

    def test_update_omite_por_padrao(self):
        assert ProductUpdate(nome="Novo").precisa_preparar is None

    def test_update_false_persiste(self):
        u = ProductUpdate(precisa_preparar=False)
        assert u.model_dump(by_alias=True, exclude_unset=True)["precisaPreparar"] is False
