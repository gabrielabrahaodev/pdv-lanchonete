"""Validação de valores monetários (TDD RED->GREEN).

Bug: PaymentCreate.valor e ProductCreate.preco aceitavam zero/negativo,
permitindo gravar pagamento negativo no array do pedido (corrompe total).
"""
import pytest
from pydantic import ValidationError

from app.models.models import PaymentCreate, ProductCreate, ProductUpdate


class TestPaymentValorPositivo:
    def test_valor_zero_rejeita(self):
        with pytest.raises(ValidationError):
            PaymentCreate(tipo="pix", valor=0)

    def test_valor_negativo_rejeita(self):
        for v in (-1, -25.5):
            with pytest.raises(ValidationError):
                PaymentCreate(tipo="pix", valor=v)

    def test_valor_positivo_aceita(self):
        assert PaymentCreate(tipo="pix", valor=25).valor == 25


class TestProdutoPrecoPositivo:
    def test_preco_negativo_rejeita(self):
        with pytest.raises(ValidationError):
            ProductCreate(nome="X-Burger", categoria_id="c1", preco=-5)

    def test_preco_zero_rejeita(self):
        with pytest.raises(ValidationError):
            ProductCreate(nome="X-Burger", categoria_id="c1", preco=0)

    def test_preco_positivo_aceita(self):
        assert ProductCreate(nome="X-Burger", categoria_id="c1", preco=25.9).preco == 25.9

    def test_update_preco_negativo_rejeita(self):
        with pytest.raises(ValidationError):
            ProductUpdate(preco=-1)

    def test_update_sem_preco_aceita(self):
        assert ProductUpdate(nome="Novo nome").preco is None
