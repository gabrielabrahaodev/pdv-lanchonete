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
    list_items_paginado,
    new_id,
    now_utc,
    stamp_create,
    stamp_update,
)

STATUS_ITEM_VALIDOS = {"preparo", "pronto", "entregue", "cancelado"}


def _preco_e_produto(restaurant_id: str, produto_id: str, variacao_id: str | None) -> tuple[float, dict]:
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
    return round(preco, 2), produto


def _preco_item(restaurant_id: str, produto_id: str, variacao_id: str | None) -> float:
    preco, _ = _preco_e_produto(restaurant_id, produto_id, variacao_id)
    return preco


def _montar_item(restaurant_id: str, item_id: str, payload: OrderItemAdd) -> dict:
    preco, produto = _preco_e_produto(restaurant_id, payload.produto_id, payload.variacao_id)
    data = payload.model_dump(by_alias=True)
    # Produto que não precisa de preparo (ex.: bebida) já nasce entregue:
    # some da fila da cozinha sozinho pelo filtro de status.
    precisa = produto.get("precisaPreparar", True)
    status = "pendente" if precisa else "entregue"
    return {**data, "id": item_id, "precoUnitario": preco, "status": status}


def _total(itens: list[dict]) -> float:
    return calculos.total_pedido(itens)


def criar(restaurant_id: str, usuario_id: str, mesa_id: str, tipo: str, itens_payload: list[OrderItemAdd]) -> dict:
    if not itens_payload:
        raise HTTPException(422, "Pedido precisa de pelo menos um item")

    itens = [_montar_item(restaurant_id, new_id("item_"), p) for p in itens_payload]
    consumo_inicial = _consumo_itens_entregues(restaurant_id, itens)
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
    saidas_aplicadas: dict[str, float] = {}

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
        if consumo_inicial:
            # Baixa dos itens sem preparo DENTRO da transação; o agregado
            # vai pós-commit (fase só-escrita não admite o get de existência).
            _, aplicadas = _aplicar_consumo(t, restaurant_id, ref.id, consumo_inicial, usuario_id)
            saidas_aplicadas.update(aplicadas)
        t.set(ref, stamp_create(pedido_data))
        t.update(
            mesa_ref,
            stamp_update({"status": "ocupada", "pedidoAtivoId": ref.id, "garcomId": usuario_id}),
        )
        return ref.id

    pedido_id = _exec(db.transaction())
    _publicar_saidas_agregado(restaurant_id, saidas_aplicadas)
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


def listar_paginado(
    restaurant_id: str,
    *,
    limit: int | None = None,
    cursor_id: str | None = None,
    status: str | None = None,
    mesa_id: str | None = None,
) -> tuple[list[dict], str | None]:
    """Histórico paginado por cursor (P1-L).

    Sem `limit`: comportamento antigo integral — next_cursor None.
    `limit` sem filtros: consulta server-side (order createdAt DESC —
    índice automático). Com filtros status/mesa: comportamento integral
    antigo em memória (não paginado) para não exigir índice composto
    (status ASC, createdAt DESC) em produção.
    """
    if limit is not None:
        if limit <= 0:
            raise HTTPException(422, "limit deve ser maior que zero")
        if not status and not mesa_id:
            return list_items_paginado(restaurant_id, "pedidos", limit=limit, cursor_id=cursor_id)
    return listar(restaurant_id, status=status, mesa_id=mesa_id), None


def adicionar_item(restaurant_id: str, usuario_id: str, pedido_id: str, payload: OrderItemAdd) -> dict:
    saidas_adicionadas: dict[str, float] = {}

    def txn(transaction, doc_ref):
        snap = next(iter(transaction.get(doc_ref)), None)
        if not snap.exists:
            raise HTTPException(404, "Pedido não encontrado")
        pedido = doc_to_dict_local(snap)
        if pedido.get("status") != "aberto":
            raise HTTPException(409, "Pedido não está aberto")
        novo = _montar_item(restaurant_id, new_id("item_"), payload)
        itens = [*pedido.get("itens", []), novo]
        consumo = _consumo_itens_entregues(restaurant_id, [novo])
        if consumo:
            _, aplicadas = _aplicar_consumo(transaction, restaurant_id, pedido_id, consumo, usuario_id)
            saidas_adicionadas.update(aplicadas)
        transaction.update(doc_ref, stamp_update({"itens": itens, "total": _total(itens)}))

    pedido = _run_txn(restaurant_id, pedido_id, txn)
    _publicar_saidas_agregado(restaurant_id, saidas_adicionadas)
    return pedido


def _publicar_saidas_agregado(restaurant_id: str, saidas: dict[str, float]) -> None:
    """Agregado pós-commit (fora da transação — ver agregados_service._gravar)."""
    if saidas:
        from app.services import agregados_service

        agregados_service.registrar_saidas(restaurant_id, saidas)


def _consumo_itens_entregues(restaurant_id: str, itens: list[dict]) -> dict[str, float]:
    """Consumo agregado dos itens que nasceram entregues (sem preparo)."""
    consumo: dict[str, float] = {}
    receitas: dict[str, dict] = {}
    for item in itens:
        if item.get("status") != "entregue":
            continue
        pid = item.get("produtoId")
        if not pid:
            continue
        if pid not in receitas:
            receitas[pid] = _consumo_produto(restaurant_id, pid)
        mult = float(item.get("qtd", 1) or 1)
        for k, v in receitas[pid].items():
            consumo[k] = consumo.get(k, 0.0) + v * mult
    return consumo


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
    usuario_id: None | str = None,
) -> dict:
    return atualizar_status_itens(restaurant_id, pedido_id, [item_id], novo_status, usuario_id)


def atualizar_status_itens(
    restaurant_id: str,
    pedido_id: str,
    item_ids: list[str],
    novo_status: str,
    usuario_id: None | str = None,
) -> dict:
    """Transita VÁRIOS itens do mesmo pedido numa ÚNICA transação.

    Tudo num doc só (pedido + movimentações de estoque): sem corrida quando
    o KDS avança um cartão inteiro de uma vez. O consumo de receita dos itens
    é AGREGADO antes de aplicar a baixa (dois itens que usam o mesmo insumo
    geram uma única leitura/escrita por ingrediente).
    """
    if novo_status not in STATUS_ITEM_VALIDOS:
        raise HTTPException(422, f"Status inválido. Use: {', '.join(sorted(STATUS_ITEM_VALIDOS))}")
    ids = list(dict.fromkeys(item_ids))
    saidas_transicao: dict[str, float] = {}

    def txn(transaction, doc_ref):
        snap = next(iter(transaction.get(doc_ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Pedido não encontrado")
        pedido = doc_to_dict_local(snap)
        itens = list(pedido.get("itens", []))
        consumo: dict[str, float] = {}
        algum = False
        receitas: dict[str, dict] = {}
        for item in itens:
            if item.get("id") not in ids or item.get("status") == "cancelado":
                continue
            algum = True
            vai_baixar = (
                novo_status == "preparo"
                and item.get("status") == "pendente"
                and not item.get("baixadoEm")
            )
            if vai_baixar:
                pid = item.get("produtoId")
                if pid:
                    if pid not in receitas:
                        receitas[pid] = _consumo_produto(restaurant_id, pid)
                    mult = float(item.get("qtd", 1) or 1)
                    for k, v in receitas[pid].items():
                        consumo[k] = consumo.get(k, 0.0) + v * mult
                item["baixadoEm"] = now_utc()
            item["status"] = novo_status
        if not algum:
            raise HTTPException(404, "Nenhum dos itens informados está neste pedido")
        if consumo:
            _, aplicadas = _aplicar_consumo(transaction, restaurant_id, pedido_id, consumo, usuario_id)
            saidas_transicao.update(aplicadas)
        transaction.update(doc_ref, stamp_update({"itens": itens}))

    pedido = _run_txn(restaurant_id, pedido_id, txn)
    _publicar_saidas_agregado(restaurant_id, saidas_transicao)
    return pedido


def _consumo_produto(restaurant_id: str, produto_id: str) -> dict[str, float]:
    """Receita do produto agregada por itemId (vazio se sem receita/produto removido)."""
    try:
        produto = produtos_service.obter(restaurant_id, produto_id)
    except HTTPException:
        return {}
    return calculos.agregar_consumo_receita((produto or {}).get("ingredientes") or [], 1)


def _aplicar_consumo(
    transaction,
    restaurant_id: str,
    pedido_id: str,
    consumo: dict[str, float],
    usuario_id: str | None,
) -> tuple[bool, dict[str, float]]:
    """Escreve as saídas de estoque do consumo já agregado. Respeita o flag
    `baixaEstoqueAutomatica`; saldo pode ficar negativo (não trava preparo).
    Contrato ÚNICO: sempre `(escreveu, {itemId: qtd aplicada})` — quando a
    baixa está desligada devolve `(False, {})` (nunca um bool solto).

    ⚠️ Firestore proíbe LEITURA após ESCRITA dentro da transação
    (ReadAfterWriteError): por isso TODOS os docs são lidos primeiro e as
    escritas acontecem numa segunda fase (bug 10 do AGENTS.md).
    """
    # -------- fase 1: TODAS as leituras --------
    cfg_snap = next(iter(transaction.get(config_doc(restaurant_id))), None)
    if cfg_snap and cfg_snap.exists:
        if not (cfg_snap.to_dict() or {}).get("baixaEstoqueAutomatica", True):
            return False, {}  # controle desativado pelo admin

    pendentes: list[tuple[str, object, float, float]] = []  # (itemId, doc_ref, qtd_consumida, novo_saldo)
    for iid, total in sorted(consumo.items()):
        total = round(total, 3)
        if total <= 0:
            continue
        ref = item_doc(restaurant_id, "estoque", iid)
        snap = next(iter(transaction.get(ref)), None)
        if not snap or not snap.exists:
            continue  # ingrediente removido do estoque: ignora sem travar o preparo
        atual = float((snap.to_dict() or {}).get("quantidadeAtual", 0) or 0)
        pendentes.append((iid, ref, total, round(atual - total, 3)))

    # -------- fase 2: TODAS as escritas --------
    escreveu = False
    observacao = f"Baixa automática — preparo do pedido {pedido_id}"
    for iid, ref, qtd, novo_saldo in pendentes:
        mov_ref = items_col(restaurant_id, "movimentacoes_estoque").document()
        transaction.set(
            mov_ref,
            stamp_create(
                {
                    "tipo": "saida",
                    "itemId": iid,
                    "qtd": qtd,
                    "saldoApos": novo_saldo,
                    "observacao": observacao,
                    "pedidoId": pedido_id,
                    "usuarioId": usuario_id,
                    "restaurantId": restaurant_id,
                }
            ),
        )
        transaction.update(ref, stamp_update({"quantidadeAtual": novo_saldo}))
        escreveu = True
    aplicadas = {iid: qtd for (iid, _, qtd, _) in pendentes} if escreveu else {}
    return escreveu, aplicadas


def cancelar(restaurant_id: str, pedido_id: str) -> dict:
    """Cancela pedido + libera mesa em UMA transação (leituras antes de escritas).

    Condicional: só limpa a mesa se ela ainda apontar para ESTE pedido
    (mesa reassociada a outro pedido fica intacta). Mesa ausente não impede.
    """
    db = get_db()
    pedido_ref = item_doc(restaurant_id, "pedidos", pedido_id)

    @transactional
    def _exec(t) -> None:
        # ---------- fase 1: leituras ----------
        snap = next(iter(t.get(pedido_ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Pedido não encontrado")
        pedido = doc_to_dict_local(snap)
        if pedido.get("status") != "aberto":
            raise HTTPException(409, "Só pedidos abertos podem ser cancelados")
        if pedido.get("pagamentos"):
            raise HTTPException(409, "Pedido com pagamentos registrados — estorne-os antes")

        mesa_id = pedido.get("mesaId")
        mesa_ref = item_doc(restaurant_id, "mesas", mesa_id) if mesa_id else None
        mesa_snap = next(iter(t.get(mesa_ref)), None) if mesa_ref else None
        mesa = (mesa_snap.to_dict() or {}) if (mesa_snap and mesa_snap.exists) else {}

        # ---------- fase 2: escritas ----------
        t.update(pedido_ref, stamp_update({"status": "cancelado", "fechadoEm": now_utc()}))
        if mesa and mesa.get("pedidoAtivoId") == pedido_id:
            mesas_service.liberar_transacional(
                t, restaurant_id, pedido.get("mesaId")
            )

    _exec(db.transaction())
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
