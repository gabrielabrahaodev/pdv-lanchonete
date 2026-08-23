"""Validações dos models Pydantic (camelCase, enums, limites)."""
import pytest
from pydantic import ValidationError

from app.models.models import (
    DespesaCreate,
    PaymentCreate,
    PreferenciasUpdate,
    RestaurantCreate,
)


class TestDespesaCreate:
    def test_categoria_valida(self):
        d = DespesaCreate(categoria="folha", descricao="Salário", valor=100, data="2026-08-22T12:00:00Z")
        assert d.categoria == "folha"
        assert d.model_dump(by_alias=True)["usuarioId"] is None

    def test_categoria_invalida_rejeita(self):
        with pytest.raises(ValidationError):
            DespesaCreate(categoria="imposto", descricao="x", valor=1, data="2026-08-22T12:00:00Z")

    def test_valor_zero_ou_negativo_rejeita(self):
        for v in (0, -10):
            with pytest.raises(ValidationError):
                DespesaCreate(categoria="outra", descricao="x", valor=v, data="2026-08-22T12:00:00Z")

    def test_descricao_curta_rejeita(self):
        with pytest.raises(ValidationError):
            DespesaCreate(categoria="outra", descricao="x", valor=1, data="2026-08-22T12:00:00Z")


class TestPaymentCreate:
    def test_minimalista(self):
        p = PaymentCreate(tipo="pix", valor=25)
        assert p.troco is None
        assert p.referencia is None

    def test_alias_camel(self):
        p = PaymentCreate(**{"tipo": "dinheiro", "valor": 10, "troco": 2.5})
        assert p.model_dump(by_alias=True)["troco"] == 2.5


class TestRestaurantCreate:
    def test_default_mesas(self):
        assert RestaurantCreate(nome="Lanchonete").quantidade_mesas == 12

    def test_mesas_fora_da_faixa_rejeita(self):
        for q in (-1, 51):
            with pytest.raises(ValidationError):
                RestaurantCreate(nome="X", quantidadeMesas=q)

    def test_nome_minimo(self):
        with pytest.raises(ValidationError):
            RestaurantCreate(nome="A")


class TestPreferenciasUpdate:
    def test_tema_valido(self):
        assert PreferenciasUpdate(tema="escuro").tema == "escuro"

    def test_tema_invalido_rejeita(self):
        with pytest.raises(ValidationError):
            PreferenciasUpdate(tema="roxo")
