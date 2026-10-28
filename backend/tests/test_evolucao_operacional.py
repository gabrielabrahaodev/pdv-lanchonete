from copy import deepcopy
from datetime import timedelta
from unittest.mock import MagicMock
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.models.models import (
    OrderItemAdd,
    ConferenciaReserva,
    InventoryItemCreate,
    InventoryItemUpdate,
    MovementCreate,
    ProductCreate,
    ProductUpdate,
    PreferenciasUpdate,
    UserUpdate,
)
from app.services import (
    pedidos_service as pedidos,
    caixa_service as caixa,
    cozinha_service as cozinha,
    estoque_service as estoque,
    produtos_service as produtos,
    usuarios_service as usuarios,
    agregados_service as agregados,
)
from app.services.unidades import converter
from tests.conftest import RID, seed, doc_path
from tests.test_pagamento_transacional import _pedido, _mesa, _sessao
from tests.fs_stub import fake_dtt


@pytest.mark.parametrize(
    "estados",
    [
        ["pendente"],
        ["preparo"],
        ["pronto"],
        ["entregue"],
        ["pendente", "preparo", "pronto", "entregue"],
    ],
)
def test_mesa_quita_sem_inventar_execucao_fisica(db, estados):
    itens = [
        {
            "id": str(i),
            "produtoId": "p",
            "qtd": 1,
            "precoUnitario": 10,
            "status": s,
            "baixadoEm": "antes" if s in ["preparo", "pronto", "entregue"] else None,
        }
        for i, s in enumerate(estados)
    ]
    _pedido(db, "p", total=10 * len(itens), itens=itens)
    _mesa(db, pedido_ativo="p")
    _sessao(db)
    caixa.registrar_pagamento(
        RID,
        "operador",
        "p",
        tipo="pix",
        valor=10 * len(itens) - 1,
        idempotency_key="parcial",
    )
    assert not pedidos.obter(RID, "p").get("encerramentoOperacional")
    assert db.store.data[doc_path(RID, "mesas", "m1")]["status"] == "ocupada"
    out = caixa.registrar_pagamento(
        RID, "operador", "p", tipo="pix", valor=1, idempotency_key="final"
    )
    assert [i["status"] for i in out["itens"]] == estados
    assert out["encerramentoOperacional"]["usuarioId"] == "operador"
    assert out["cozinhaPendente"] is False and cozinha.fila(RID) == []
    assert db.store.data[doc_path(RID, "mesas", "m1")]["status"] == "livre"
    assert db.store.data[doc_path(RID, "sessoes_caixa", "s1")][
        "totalVendas"
    ] == 10 * len(itens)
    assert (
        db.store.data[doc_path(RID, "agregados_diarios", "2026-09-27")]["totalPedidos"]
        == 1
    )
    antes = deepcopy(db.store.data)
    with pytest.raises(HTTPException):
        caixa.registrar_pagamento(
            RID, "operador", "p", tipo="pix", valor=1, idempotency_key="final"
        )
    assert db.store.data == antes
    with pytest.raises(HTTPException):
        pedidos.atualizar_status_item(RID, "p", "0", "preparo", "u")


@pytest.mark.parametrize("acao,saldo", [("consumido", 7), ("devolver", 10)])
@pytest.mark.parametrize("vencido", [False, True])
def test_reserva_retida_ate_conferencia_e_decisao_unica(db, acao, saldo, vencido):
    seed(
        db,
        RID,
        "lotes_producao",
        "l",
        {
            "produtoId": "p",
            "saldo": 10,
            "reservado": 3,
            "validade": fake_dtt() + timedelta(days=-1 if vencido else 1),
            "aberto": True,
        },
    )
    item = {
        "id": "i",
        "produtoId": "p",
        "modoEstoque": "antecipado",
        "qtd": 3,
        "precoUnitario": 10,
        "status": "pronto",
        "lotesReservados": [{"loteId": "l", "qtd": 3, "custoUnitario": 2}],
        "custoProducao": 6,
    }
    _pedido(db, "p", total=30, itens=[item])
    _mesa(db, pedido_ativo="p")
    _sessao(db)
    out = caixa.registrar_pagamento(
        RID, "u", "p", tipo="pix", valor=30, idempotency_key="p"
    )
    lote = lambda: db.store.data[doc_path(RID, "lotes_producao", "l")]
    assert lote()["saldo"] == 10 and lote()["reservado"] == 3
    assert out["reservaConferenciaPendente"] and out["itens"][0]["status"] == "pronto"
    with pytest.raises(HTTPException):
        pedidos.renovar_reserva(RID, "p", "i", "u")
    conf = ConferenciaReserva(acao=acao, motivo="Conferido fisicamente")
    for _ in range(2):
        out = pedidos.conferir_reserva(RID, "u", "p", "i", conf)
    assert lote()["saldo"] == saldo and lote()["reservado"] == 0
    assert (
        not out["reservaConferenciaPendente"] and out["itens"][0]["status"] == "pronto"
    )
    assert "estoqueEntregueEm" not in out["itens"][0]
    assert (
        len(list(db.collection(doc_path(RID, "movimentacoes_producao")).stream())) == 1
    )
    with pytest.raises(HTTPException):
        pedidos.conferir_reserva(
            RID,
            "u",
            "p",
            "i",
            ConferenciaReserva(
                acao="devolver" if acao == "consumido" else "consumido",
                motivo="Outra decisão",
            ),
        )


@pytest.mark.parametrize(
    "origem,destino,qtd,esperado",
    [
        ("kg", "g", 1, 1000),
        ("g", "kg", 150, 0.15),
        ("L", "ml", 2, 2000),
        ("ml", "L", 200, 0.2),
    ],
)
def test_conversoes_exatas(origem, destino, qtd, esperado):
    assert float(converter(qtd, origem, destino)) == esperado


@pytest.mark.parametrize("a,b", [("kg", "L"), ("g", "ml"), ("cx", "un"), ("pct", "kg")])
def test_conversoes_invalidas(a, b):
    with pytest.raises(HTTPException):
        converter(1, a, b)


def test_embalagem_compra_custo_medio_e_retry(db):
    e = estoque.criar_item(
        RID,
        InventoryItemCreate(
            nome="Embalagem", unidade="un", unidadeCompra="cx", fatorCompra=100
        ),
    )
    p = MovementCreate(
        itemId=e["id"], tipo="entrada", qtd=1, unidade="cx", valorTotalCompra=50
    )
    for _ in range(2):
        out, m = estoque.registrar_movimentacao(RID, "u", p, "compra1")
    assert out["quantidadeAtual"] == 100 and out["custoMedio"] == 0.5
    out, _ = estoque.registrar_movimentacao(
        RID,
        "u",
        MovementCreate(
            itemId=e["id"], tipo="entrada", qtd=100, unidade="un", valorTotalCompra=100
        ),
        "compra2",
    )
    assert out["quantidadeAtual"] == 200 and out["custoMedio"] == 0.75
    assert float(converter(3, "un", "un")) * 0.5 == 1.5
    with pytest.raises(HTTPException):
        estoque.registrar_movimentacao(
            RID, "u", MovementCreate(itemId=e["id"], tipo="entrada", qtd=2), "compra1"
        )
    assert (
        len(list(db.collection(doc_path(RID, "movimentacoes_estoque")).stream())) == 2
    )


@pytest.mark.parametrize(
    "nome,controle,compra,qtd,valor,receita,unidade,custo",
    [
        ("Carne", "g", "kg", 1, 40, 150, "g", 6),
        ("Leite", "ml", "L", 2, 16, 200, "ml", 1.6),
    ],
)
def test_receita_converte_e_pedido_congela_custo(
    db, monkeypatch, nome, controle, compra, qtd, valor, receita, unidade, custo
):
    monkeypatch.setattr(agregados, "now_utc", fake_dtt)
    e = estoque.criar_item(RID, InventoryItemCreate(nome=nome, unidade=controle))
    estoque.registrar_movimentacao(
        RID,
        "u",
        MovementCreate(
            itemId=e["id"],
            tipo="entrada",
            qtd=qtd,
            unidade=compra,
            valorTotalCompra=valor,
        ),
        "compra",
    )
    prod = produtos.criar(
        RID,
        ProductCreate(
            nome="Porção",
            categoriaId="c",
            preco=20,
            precisaPreparar=False,
            ingredientes=[{"itemId": e["id"], "qtd": receita, "unidade": unidade}],
        ),
    )
    _mesa(db)
    p = pedidos.criar(
        RID, "u", "m1", "local", [OrderItemAdd(produtoId=prod["id"], qtd=1)]
    )
    saidas = [
        s.to_dict()
        for s in db.collection(doc_path(RID, "movimentacoes_estoque")).stream()
        if s.to_dict()["tipo"] == "saida"
    ]
    assert sum(m["qtd"] * m["custoUnitario"] for m in saidas) == pytest.approx(custo)
    antigo = deepcopy(p)
    antes = agregados.resumo_agregado(
        RID, "dia", fake_dtt().astimezone(agregados._TZ).strftime("%Y-%m-%d")
    )
    estoque.atualizar_item(RID, e["id"], InventoryItemUpdate(custoMedio=100), "u")
    depois = agregados.resumo_agregado(
        RID, "dia", fake_dtt().astimezone(agregados._TZ).strftime("%Y-%m-%d")
    )
    assert (
        antes["financeiro"]["cmvEstimado"]
        == depois["financeiro"]["cmvEstimado"]
        == pytest.approx(custo)
    )
    assert pedidos.obter(RID, p["id"]) == antigo


def test_arquivamento_exclusao_unidade_e_saldo_protegidos(db):
    e = estoque.criar_item(RID, InventoryItemCreate(nome="Farinha", unidade="kg"))
    prod = produtos.criar(
        RID,
        ProductCreate(
            nome="Pão",
            categoriaId="c",
            preco=2,
            ingredientes=[{"itemId": e["id"], "qtd": 150, "unidade": "g"}],
        ),
    )
    assert prod["ingredientes"][0]["qtd"] == 0.15
    assert prod["ingredientes"][0]["qtdInformada"] == 150
    with pytest.raises(HTTPException):
        estoque.remover_item(RID, e["id"])
    with pytest.raises(HTTPException):
        estoque.atualizar_item(RID, e["id"], InventoryItemUpdate(unidade="g"))
    estoque.atualizar_item(RID, e["id"], InventoryItemUpdate(ativo=False))
    with pytest.raises(HTTPException):
        produtos.criar(
            RID,
            ProductCreate(
                nome="Novo",
                categoriaId="c",
                preco=3,
                ingredientes=[{"itemId": e["id"], "qtd": 1}],
            ),
        )
    assert (
        produtos.atualizar(RID, prod["id"], ProductUpdate(nome="Mesmo pão"))["nome"]
        == "Mesmo pão"
    )
    with pytest.raises(ValidationError):
        InventoryItemUpdate(quantidadeAtual=99)
    assert estoque.obter_item(RID, e["id"])["quantidadeAtual"] == 0
    with pytest.raises(HTTPException):
        estoque.obter_item("outro", e["id"])


def test_unidade_so_em_cadastro_sem_historico_e_saldo(db):
    e = estoque.criar_item(RID, InventoryItemCreate(nome="Novo", unidade="kg"))
    assert (
        estoque.atualizar_item(RID, e["id"], InventoryItemUpdate(unidade="g"))[
            "unidade"
        ]
        == "g"
    )
    estoque.remover_item(RID, e["id"])
    with pytest.raises(HTTPException):
        estoque.obter_item(RID, e["id"])


def test_ajuste_zero_e_precisao_e_valores_invalidos(db):
    e = estoque.criar_item(
        RID, InventoryItemCreate(nome="Massa", unidade="kg", quantidadeAtual=2)
    )
    out, _ = estoque.registrar_movimentacao(
        RID, "u", MovementCreate(itemId=e["id"], tipo="ajuste", qtd=0), "zerar"
    )
    assert out["quantidadeAtual"] == 0
    with pytest.raises(HTTPException):
        estoque.registrar_movimentacao(
            RID,
            "u",
            MovementCreate(itemId=e["id"], tipo="entrada", qtd=0.1, unidade="g"),
            "precisao",
        )
    for valor in [float("nan"), float("inf"), -1]:
        with pytest.raises(ValidationError):
            InventoryItemCreate(nome="N", unidade="un", custoMedio=valor)


def test_ultimo_admin_auto_papel_e_tenant(db, monkeypatch):
    auth = MagicMock()
    monkeypatch.setattr("app.core.firebase.get_auth", lambda: auth)
    seed(db, RID, "usuarios", "a", {"nome": "Admin", "papel": "admin", "ativo": True})
    for payload in [UserUpdate(ativo=False), UserUpdate(papel="caixa")]:
        with pytest.raises(HTTPException):
            usuarios.atualizar(RID, "admin", "a", payload, "outro")
    auth.update_user.assert_not_called()
    seed(db, RID, "usuarios", "b", {"nome": "Admin2", "papel": "admin", "ativo": True})
    usuarios.atualizar(RID, "admin", "a", UserUpdate(ativo=False), "b")
    assert usuarios.listar(RID)[0]["id"]  # perfil preservado, não deletado
    with pytest.raises(HTTPException):
        usuarios.remover(RID, "admin", "b", "b")
    with pytest.raises(HTTPException):
        usuarios.atualizar("outro", "admin", "b", UserUpdate(nome="Inválido"), "b")
    with pytest.raises(ValidationError):
        PreferenciasUpdate(papel="admin")
    with pytest.raises(HTTPException):
        usuarios.atualizar_preferencias(
            RID, "ausente", None, None, None, PreferenciasUpdate(nome="Teste")
        )


def test_me_sincroniza_somente_email_verificado_e_nome_proprio(db, monkeypatch):
    auth = MagicMock()
    auth.get_user.return_value.email = "novo@exemplo.com"
    auth.get_user.return_value.email_verified = False
    monkeypatch.setattr("app.core.firebase.get_auth", lambda: auth)
    seed(
        db,
        RID,
        "usuarios",
        "u",
        {"nome": "U", "email": "antes@exemplo.com", "papel": "caixa", "ativo": True},
    )
    with pytest.raises(HTTPException):
        usuarios.sincronizar_login(RID, "u")
    auth.get_user.return_value.email_verified = True
    usuarios.sincronizar_login(RID, "u")
    out = usuarios.atualizar_preferencias(
        RID, "u", None, None, None, PreferenciasUpdate(nome="Operador")
    )
    assert out["nome"] == "Operador"
    doc = db.store.data[doc_path(RID, "usuarios", "u")]
    assert doc["email"] == "novo@exemplo.com" and doc["papel"] == "caixa"


def test_api_permissoes_estoque_usuarios_conferencia(db):
    from app.main import app
    from app.core.security import get_current_auth, CurrentAuth

    c = TestClient(app)
    try:
        app.dependency_overrides[get_current_auth] = lambda: CurrentAuth(
            "u", None, RID, "cozinha"
        )
        assert (
            c.post(
                "/api/estoque/itens", json={"nome": "X", "unidade": "un"}
            ).status_code
            == 403
        )
        assert c.patch("/api/usuarios/a", json={"papel": "admin"}).status_code == 403
        assert (
            c.post(
                "/api/pedidos/p/itens/i/conferir-reserva",
                json={"acao": "devolver", "motivo": "Conferência"},
            ).status_code
            == 403
        )
        assert (
            c.patch("/api/usuarios/me", json={"restaurantId": "outro"}).status_code
            == 422
        )
    finally:
        app.dependency_overrides.clear()


def test_auditoria_solicitacoes_nao_aceita_senha(db):
    from app.models.models import SolicitacaoSeguranca

    seed(db, RID, "usuarios", "u", {"nome": "U", "papel": "cozinha", "ativo": True})
    usuarios.registrar_solicitacao_seguranca(RID, "u", "solicitar_troca_senha")
    logs = list(db.collection(doc_path(RID, "auditoria_acessos")).stream())
    assert len(logs) == 1 and logs[0].to_dict()["acao"] == "solicitar_troca_senha"
    assert "senha" not in logs[0].to_dict()
    with pytest.raises(ValidationError):
        SolicitacaoSeguranca(acao="solicitar_troca_senha", senha="nao persistir")


def test_conflito_firestore_retorna_409_sem_ocultar_outros_erros(db):
    from google.api_core.exceptions import Aborted
    from app.services.base import executar_transacao

    def concorrente(_):
        try:
            raise Aborted("Contenção")
        except Aborted as exc:
            raise ValueError("Tentativas esgotadas") from exc

    with pytest.raises(HTTPException) as e:
        executar_transacao(concorrente)
    assert e.value.status_code == 409

    def bug(_):
        raise ValueError("Bug real")

    with pytest.raises(ValueError):
        executar_transacao(bug)


def test_nao_eleva_proprio_papel_nem_gerente_administra_gerente(db, monkeypatch):
    auth = MagicMock()
    monkeypatch.setattr("app.core.firebase.get_auth", lambda: auth)
    for uid, papel in [("a", "admin"), ("b", "admin"), ("g", "gerente")]:
        seed(db, RID, "usuarios", uid, {"nome": uid, "papel": papel, "ativo": True})
    with pytest.raises(HTTPException):
        usuarios.atualizar(RID, "admin", "a", UserUpdate(papel="gerente"), "a")
    with pytest.raises(HTTPException):
        usuarios.atualizar(RID, "gerente", "g", UserUpdate(nome="Mudar"), "g")
    with pytest.raises(HTTPException):
        usuarios.atualizar(RID, "gerente", "b", UserUpdate(papel="caixa"), "g")
    assert db.store.data[doc_path(RID, "usuarios", "b")]["papel"] == "admin"


def test_falha_auth_mantem_perfil_restrito_e_repeticao_conclui(db, monkeypatch):
    auth = MagicMock()
    auth.update_user.side_effect = RuntimeError("Indisponível")
    monkeypatch.setattr("app.core.firebase.get_auth", lambda: auth)
    seed(db, RID, "usuarios", "c", {"nome": "Caixa", "papel": "caixa", "ativo": True})
    with pytest.raises(HTTPException) as e:
        usuarios.atualizar(RID, "admin", "c", UserUpdate(ativo=False))
    assert e.value.status_code == 503
    doc = db.store.data[doc_path(RID, "usuarios", "c")]
    assert doc["ativo"] is False and doc["sincronizacaoAuthPendente"]
    auth.update_user.side_effect = None
    usuarios.atualizar(RID, "admin", "c", UserUpdate(ativo=False))
    assert doc["ativo"] is False and doc["sincronizacaoAuthPendente"] is False


def test_lote_historico_impede_excluir_insumo_sem_movimento(db):
    e = estoque.criar_item(RID, InventoryItemCreate(nome="Legado", unidade="kg"))
    seed(
        db,
        RID,
        "lotes_producao",
        "legado",
        {"ingredientes": [{"itemId": e["id"], "qtd": 1}]},
    )
    with pytest.raises(HTTPException):
        estoque.remover_item(RID, e["id"])
