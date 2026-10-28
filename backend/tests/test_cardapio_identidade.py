"""Contrato público do cardápio: identidade por restaurante, sem dados privados."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers import publico
from tests.conftest import seed


def request():
    return SimpleNamespace(client=SimpleNamespace(host="ip-teste-cardapio-identidade"))


def preparar(db, rid, nome):
    db.store.data[f"restaurantes/{rid}"] = {
        "nome": nome,
        "criadorUid": "privado-nao-retornar",
        "dadosFiscais": {"cnpj": "privado-nao-retornar"},
    }
    db.store.data[f"restaurantes/{rid}/data/configuracoes"] = {
        "cardapioDigitalAtivo": True,
    }
    seed(db, rid, "categorias", "categoria1", {"nome": "Bebidas", "ativo": True})
    seed(
        db, rid, "produtos", "produto1",
        {"nome": "Café", "preco": 8.0, "categoriaId": "categoria1", "ativo": True},
    )


def test_cardapio_retorna_nome_publico_sem_expor_dados_privados(db):
    preparar(db, "r1", "  Café Anis  ")
    publico._RATE.clear()
    resultado = publico.cardapio("r1", request())
    assert resultado["restauranteNome"] == "Café Anis"
    assert len(resultado["produtos"]) == 1
    assert resultado["categorias"][0]["nome"] == "Bebidas"
    assert set(resultado) == {"restauranteNome", "produtos", "categorias"}
    assert "privado-nao-retornar" not in str(resultado)


def test_nome_segue_restaurante_do_qr_sem_misturar_tenants(db):
    preparar(db, "r1", "Café Anis")
    preparar(db, "r2", "Bistrô Central")
    publico._RATE.clear()
    assert publico.cardapio("r1", request())["restauranteNome"] == "Café Anis"
    assert publico.cardapio("r2", request())["restauranteNome"] == "Bistrô Central"


def test_restaurante_sem_nome_nao_vaza_metadados_e_inexistente_continua_404(db):
    preparar(db, "r1", None)
    publico._RATE.clear()
    assert publico.cardapio("r1", request())["restauranteNome"] == ""
    with pytest.raises(HTTPException) as exc:
        publico.cardapio("nao-existe", request())
    assert exc.value.status_code == 404


def test_cardapio_desativado_continua_bloqueado(db):
    preparar(db, "r1", "Café Anis")
    db.store.data["restaurantes/r1/data/configuracoes"]["cardapioDigitalAtivo"] = False
    publico._RATE.clear()
    with pytest.raises(HTTPException) as exc:
        publico.cardapio("r1", request())
    assert exc.value.status_code == 403
