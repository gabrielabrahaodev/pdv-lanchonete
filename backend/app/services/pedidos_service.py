"""Pedidos: criação, itens e fechamento — preços sempre resolvidos no servidor."""
from __future__ import annotations

from fastapi import HTTPException
from google.cloud.firestore import transactional

from app.core.firebase import get_db
from app.models.models import OrderItemAdd
from app.services import calculos, mesas_service, produtos_service
from app.services.base import (
    config_doc,
    get_item,
    item_doc,
    items_col,
    list_items,
    new_id,
    now_utc,
    stamp_create,
    stamp_update,
)

STATUS_ITEM_VALIDOS = {"preparo", "pronto", "entregue", "cancelado"}


def _preco_item(restaurant_id: str, produto_id: str, variacao_id: str | None) -> float:
    produto = produtos_service.obter(restaurant_id, produto_id)
    if not produto.get("ativo", True):
        raise HTTPException(409, f"Produto '{produto.get('nome')}' está inativo")
    preco = float(produto.get("preco", 0))
    if variacao_id:
        for var in produto.get("variacoes", []):
            if var.get("id") == variacao_id:
                if not var.get("ativo", True):
                    raise HTTPException(409, f"Variação '{var.get('nome')}' está inativa")
                preco += float(var.get("precoAdicional", 0) or 0)
                break
        else:
            raise HTTPException(404, "Variação não encontrada no produto")
    return round(preco, 2)


def _montar_item(restaurant_id: str, item_id: str, payload: OrderItemAdd) -> dict:
    preco = _preco_item(restaurant_id, payload.produto_id, payload.variacao_id)
    data = payload.model_dump(by_alias=True)
    return {**data, "id": item_id, "precoUnitario": preco, "status": "pendente"}


def _total(itens: list[dict]) -> float:
    return calculos.total_pedido(itens)


def criar(restaurant_id: str, usuario_id: str, mesa_id: str, tipo: str, itens_payload: list[OrderItemAdd]) -> dict:
    if not itens_payload:
        raise HTTPException(422, "Pedido precisa de pelo menos um item")

    itens = [_montar_item(restaurant_id, new_id("item_"), p) for p in itens_payload]
    pedido_data = {
        "mesaId": mesa_id,
        "tipo": tipo if tipo in {"local", "delivery", "balcao"} else "local",
        "status": "aberto",
        "itens": itens,
        "total": _total(itens),
        "pagamentos": [],
        "usuarioId": usuario_id,
        "restaurantId": restaurant_id,
    }

    db = get_db()
    mesa_ref = item_doc(restaurant_id, "mesas", mesa_id)

    # Transação: evita corrida de dois pedidos simultâneos na mesma mesa
    @transactional
    def _exec(t) -> str:
        snap = next(iter(t.get(mesa_ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Mesa não encontrada")
        mesa = snap.to_dict() or {}
        if mesa.get("status") == "ocupada":
            raise HTTPException(409, f"Mesa {mesa.get('numero')} já está ocupada")
        ref = items_col(restaurant_id, "pedidos").document()
        t.set(ref, stamp_create(pedido_data))
        t.update(
            mesa_ref,
            stamp_update({"status": "ocupada", "pedidoAtivoId": ref.id, "garcomId": usuario_id}),
        )
        return ref.id

    pedido_id = _exec(db.transaction())
    return obter(restaurant_id, pedido_id)


def obter(restaurant_id: str, pedido_id: str) -> dict:
    doc = get_item(restaurant_id, "pedidos", pedido_id)
    if not doc:
        raise HTTPException(404, "Pedido não encontrado")
    return doc


def listar(restaurant_id: str, *, status: str | None = None, mesa_id: str | None = None) -> list[dict]:
    docs = list_items(restaurant_id, "pedidos")
    if status:
        docs = [d for d in docs if d.get("status") == status]
    if mesa_id:
        docs = [d for d in docs if d.get("mesaId") == mesa_id]
    return docs


def adicionar_item(restaurant_id: str, usuario_id: str, pedido_id: str, payload: OrderItemAdd) -> dict:
    def txn(transaction, doc_ref):
        snap = next(iter(transaction.get(doc_ref)), None)
        if not snap.exists:
            raise HTTPException(404, "Pedido não encontrado")
        pedido = doc_to_dict_local(snap)
        if pedido.get("status") != "aberto":
            raise HTTPException(409, "Pedido não está aberto")
        novo = _montar_item(restaurant_id, new_id("item_"), payload)
        itens = [*pedido.get("itens", []), novo]
        transaction.update(doc_ref, stamp_update({"itens": itens, "total": _total(itens)}))

    return _run_txn(restaurant_id, pedido_id, txn)


def remover_item(restaurant_id: str, pedido_id: str, item_id: str) -> dict:
    def txn(transaction, doc_ref):
        snap = next(iter(transaction.get(doc_ref)), None)
        if not snap.exists:
            raise HTTPException(404, "Pedido não encontrado")
        pedido = doc_to_dict_local(snap)
        if pedido.get("status") != "aberto":
            raise HTTPException(409, "Pedido não está aberto")
        itens = list(pedido.get("itens", []))
        alvo = next((i for i in itens if i.get("id") == item_id), None)
        if not alvo:
            raise HTTPException(404, "Item não encontrado no pedido")
        if alvo.get("status") != "pendente":
            raise HTTPException(409, "Só é possível remover itens pendentes")
        itens.remove(alvo)
        transaction.update(doc_ref, stamp_update({"itens": itens, "total": _total(itens)}))

    return _run_txn(restaurant_id, pedido_id, txn)


def atualizar_status_item(
    restaurant_id: str,
    pedido_id: str,
    item_id: str,
    novo_status: str,
    usuario_id: str | None = None,
) -> dict:
    if novo_status not in STATUS_ITEM_VALIDOS:
        raise HTTPException(422, f"Status inválido. Use: {', '.join(sorted(STATUS_ITEM_VALIDOS))}")

    def txn(transaction, doc_ref):
        snap = next(iter(transaction.get(doc_ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Pedido não encontrado")
        pedido = doc_to_dict_local(snap)
        itens = list(pedido.get("itens", []))
        alvo = next((i for i in itens if i.get("id") == item_id), None)
        if not alvo:
            raise HTTPException(404, "Item não encontrado no pedido")

        baixa = None
        if novo_status == "preparo" and alvo.get("status") == "pendente" and not alvo.get("baixadoEm"):
            baixa = _baixar_ingredientes(transaction, restaurant_id, pedido_id, alvo, usuario_id)

        for i in itens:
            if i.get("id") == item_id:
                i["status"] = novo_status
                if baixa is not None:
                    i["baixadoEm"] = now_utc()
                break
        transaction.update(doc_ref, stamp_update({"itens": itens}))

    return _run_txn(restaurant_id, pedido_id, txn)


def _baixar_ingredientes(transaction, restaurant_id: str, pedido_id: str, item: dict, usuario_id: str | None) -> bool:
    """Baixa os ingredientes da receita do produto no início do preparo.

    Dentro da MESMA transação do update do pedido. Respeita o flag
    `baixaEstoqueAutomatica` das configurações. Saldo pode ficar negativo
    (não trava a operação). Sem receita/ingrediente válido, não faz nada —
    quem marca a baixa (idempotência) é o campo `baixadoEm` no item.
    Retorna True se houve qualquer escrita de movimentação.
    """
    cfg_snap = next(iter(transaction.get(config_doc(restaurant_id))), None)
    if cfg_snap and cfg_snap.exists:
        if not (cfg_snap.to_dict() or {}).get("baixaEstoqueAutomatica", True):
            return False  # controle desativado pelo admin

    try:
        produto = (
            produtos_service.obter(restaurant_id, item["produtoId"]) if item.get("produtoId") else None
        )
    except HTTPException:
        produto = None  # produto removido: segue sem baixa, sem travar o preparo
    consumo = calculos.agregar_consumo_receita(
        (produto or {}).get("ingredientes") or [], item.get("qtd", 1)
    )
    if not consumo:
        return False

    escreveu = False
    for iid, total in consumo.items():
        ref = item_doc(restaurant_id, "estoque", iid)
        snap = next(iter(transaction.get(ref)), None)
        if not snap or not snap.exists:
            continue  # ingrediente removido do estoque: ignora sem travar o preparo
        atual = float((snap.to_dict() or {}).get("quantidadeAtual", 0))
        novo_saldo = round(atual - total, 3)
        mov_ref = items_col(restaurant_id, "movimentacoes_estoque").document()
        transaction.set(
            mov_ref,
            stamp_create(
                {
                    "tipo": "saida",
                    "itemId": iid,
                    "qtd": total,
                    "saldoApos": novo_saldo,
                    "observacao": f"Baixa automática — preparo do pedido {pedido_id}",
                    "pedidoId": pedido_id,
                    "usuarioId": usuario_id,
                    "restaurantId": restaurant_id,
                }
            ),
        )
        transaction.update(ref, stamp_update({"quantidadeAtual": novo_saldo}))
        escreveu = True
    return escreveu


def cancelar(restaurant_id: str, pedido_id: str) -> dict:
    pedido = obter(restaurant_id, pedido_id)
    if pedido.get("status") != "aberto":
        raise HTTPException(409, "Só pedidos abertos podem ser cancelados")
    if pedido.get("pagamentos"):
        raise HTTPException(409, "Pedido com pagamentos registrados — estorne-os antes")
    item_doc(restaurant_id, "pedidos", pedido_id).update(
        stamp_update({"status": "cancelado", "fechadoEm": now_utc()})
    )
    mesas_service.liberar(restaurant_id, pedido["mesaId"])
    return obter(restaurant_id, pedido_id)


# ------------------------------------------------------------------ helpers
def doc_to_dict_local(snap):  # evita import circular com base
    from app.services.base import doc_to_dict

    return doc_to_dict(snap)


def _run_txn(restaurant_id, pedido_id, fn):
    db = get_db()
    doc_ref = item_doc(restaurant_id, "pedidos", pedido_id)

    @transactional
    def _exec(t, ref):
        fn(t, ref)

    _exec(db.transaction(), doc_ref)
    return obter(restaurant_id, pedido_id)
