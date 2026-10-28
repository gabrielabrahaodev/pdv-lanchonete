"""Pedidos: criação, itens e fechamento — preços sempre resolvidos no servidor."""
from __future__ import annotations
from app.services.base import executar_transacao

import hashlib
import json
from copy import deepcopy

from fastapi import HTTPException
from google.cloud.firestore import transactional

from app.core.firebase import get_db
from app.models.models import OrderItemAdd
from app.services import calculos, mesas_service, produtos_service, producao_service
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
    modo = produto.get("modoEstoque", "sob_pedido")
    status = "pendente" if precisa else ("pronto" if modo == "antecipado" else "entregue")
    receita = produto.get("ingredientes") or []
    if modo == "antecipado":
        receita = []
    elif modo == "revenda":
        if not produto.get("itemRevendaId"):
            raise HTTPException(422, "Vincule o item de estoque da revenda")
        receita = [{"itemId": produto["itemRevendaId"], "qtd": 1}]
    return {**data, "id": item_id, "precoUnitario": preco, "status": status,
            "modoEstoque": modo, "produtoNome": produto.get("nome"), "categoriaId": produto.get("categoriaId"), "metaMargem": (100 * float(produto.get("acrescimoLucroPercentual", 0)) / (100 + float(produto.get("acrescimoLucroPercentual", 0)))),
            "consumoEstoque": calculos.agregar_consumo_receita(receita, 1)}


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

    # Transação: evita corrida de dois pedidos simultâneos na mesma mesa
    @transactional
    def _exec(t) -> str:
        snap = next(iter(t.get(mesa_ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Mesa não encontrada")
        mesa = snap.to_dict() or {}
        if mesa.get("pedidoAtivoId") or mesa.get("status") not in {"livre", "reservada"}:
            raise HTTPException(409, f"Mesa {mesa.get('numero')} já está ocupada")
        ref = items_col(restaurant_id, "pedidos").document()
        gravar_reservas = producao_service.planejar_reservas(t, restaurant_id, ref.id, itens, usuario_id)
        if consumo_inicial:
            gravar, aplicadas = _planejar_consumo(t, restaurant_id, ref.id, consumo_inicial, usuario_id, itens=[i for i in itens if i.get("status") == "entregue"])
            from app.services import agregados_service
            agregados_service.registrar_saidas_tx(t, restaurant_id, aplicadas)
            gravar()
        gravar_reservas()
        t.set(ref, stamp_create(pedido_data))
        t.update(
            mesa_ref,
            stamp_update({"status": "ocupada", "pedidoAtivoId": ref.id, "garcomId": usuario_id}),
        )
        return ref.id

    pedido_id = executar_transacao(_exec)
    return obter(restaurant_id, pedido_id)


def criar_balcao(restaurant_id: str, usuario_id: str, itens_payload: list[OrderItemAdd], chave: str) -> dict:
    """Pedido sem mesa; chave protege reserva e baixa inicial contra repeticao."""
    if not 1 <= len(itens_payload) <= 50:
        raise HTTPException(422, "Informe entre 1 e 50 itens")
    corpo = [i.model_dump(by_alias=True) for i in itens_payload]
    fingerprint = hashlib.sha256(json.dumps(corpo, sort_keys=True).encode()).hexdigest()
    evento = item_doc(restaurant_id, "eventos_itens", "balcao_" + chave)
    ref = items_col(restaurant_id, "pedidos").document()

    @transactional
    def executar(t):
        snap = next(iter(t.get(evento)), None)
        if snap and snap.exists:
            data = snap.to_dict() or {}
            if data.get("fingerprint") != fingerprint:
                raise HTTPException(409, "Chave de venda ja utilizada com outros itens")
            return data["pedidoId"]
        sessao = next(iter(t.get(items_col(restaurant_id, "sessoes_caixa").where("status", "==", "aberto"))), None)
        if not sessao or not sessao.exists:
            raise HTTPException(409, "Abra o caixa antes de iniciar uma venda direta")
        itens = [_montar_item(restaurant_id, new_id("item_"), i) for i in itens_payload]
        consumo = _consumo_itens_entregues(restaurant_id, itens)
        gravar_lotes = producao_service.planejar_reservas(t, restaurant_id, ref.id, itens, usuario_id)
        gravar_consumo, aplicadas = _planejar_consumo(t, restaurant_id, ref.id, consumo, usuario_id, itens=[i for i in itens if i.get("status") == "entregue"])
        from app.services import agregados_service
        agregados_service.registrar_saidas_tx(t, restaurant_id, aplicadas, evento_id=f"balcao:{ref.id}")
        gravar_consumo()
        gravar_lotes()
        t.set(ref, {**stamp_create({"tipo": "balcao", "status": "aberto",
            "itens": itens, "total": _total(itens), "pagamentos": [],
            "usuarioId": usuario_id, "restaurantId": restaurant_id}), "mesaId": None})
        t.set(evento, stamp_create({"fingerprint": fingerprint, "pedidoId": ref.id}))
        return ref.id

    pedido_id = executar_transacao(executar)
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
    return adicionar_itens(restaurant_id, usuario_id, pedido_id, [payload])


def adicionar_itens(restaurant_id: str, usuario_id: str, pedido_id: str,
                    payloads: list[OrderItemAdd], idempotency_key: str | None = None) -> dict:
    if not payloads or len(payloads) > 100:
        raise HTTPException(422, "Informe de 1 a 100 itens")
    fingerprint = hashlib.sha256(json.dumps(
        [p.model_dump(by_alias=True) for p in payloads], sort_keys=True
    ).encode()).hexdigest()
    evento = item_doc(restaurant_id, "eventos_itens", f"{pedido_id}:{idempotency_key}") if idempotency_key else None

    def txn(transaction, doc_ref):
        if evento:
            anterior = next(iter(transaction.get(evento)), None)
            if anterior and anterior.exists:
                if (anterior.to_dict() or {}).get("fingerprint") != fingerprint:
                    raise HTTPException(409, "Chave de envio já utilizada para outros itens")
                return
        snap = next(iter(transaction.get(doc_ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Pedido não encontrado")
        pedido = doc_to_dict_local(snap)
        if pedido.get("status") != "aberto":
            raise HTTPException(409, "Pedido não está aberto")
        # Valida TODOS os produtos antes de qualquer escrita ou baixa.
        novos = [_montar_item(restaurant_id, new_id("item_"), p) for p in payloads]
        itens = [*pedido.get("itens", []), *novos]
        consumo = _consumo_itens_entregues(restaurant_id, novos)
        gravar_reservas = producao_service.planejar_reservas(transaction, restaurant_id, pedido_id, novos, usuario_id)
        if consumo:
            gravar, aplicadas = _planejar_consumo(transaction, restaurant_id, pedido_id, consumo, usuario_id, itens=[i for i in novos if i.get("status") == "entregue"])
            from app.services import agregados_service
            agregados_service.registrar_saidas_tx(transaction, restaurant_id, aplicadas)
            gravar()
        gravar_reservas()
        transaction.update(doc_ref, stamp_update({"itens": itens, "total": _total(itens)}))
        if evento:
            transaction.set(evento, stamp_create({"fingerprint": fingerprint, "pedidoId": pedido_id}))

    pedido = _run_txn(restaurant_id, pedido_id, txn)
    return pedido


def _consumo_itens_entregues(restaurant_id: str, itens: list[dict]) -> dict[str, float]:
    """Consumo agregado dos itens que nasceram entregues (sem preparo)."""
    consumo: dict[str, float] = {}
    receitas: dict[str, dict] = {}
    for item in itens:
        if item.get("status") != "entregue" or item.get("modoEstoque") == "antecipado":
            continue
        pid = item.get("produtoId")
        if not pid:
            continue
        if pid not in receitas:
            receitas[pid] = item["consumoEstoque"] if "consumoEstoque" in item else _consumo_produto(restaurant_id, pid)
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
        if alvo.get("status") != "pendente" and not (alvo.get("modoEstoque") == "antecipado" and alvo.get("status") == "pronto"):
            raise HTTPException(409, "Só é possível remover itens pendentes")
        if pedido.get("pagamentos"):
            raise HTTPException(409, "Pedido com pagamento: não é possível remover itens")
        gravar_lotes = producao_service.planejar_destino(transaction, restaurant_id, pedido_id, [deepcopy(alvo)], "liberacao", None)
        itens.remove(alvo)
        gravar_lotes()
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

    def txn(transaction, doc_ref):
        snap = next(iter(transaction.get(doc_ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Pedido não encontrado")
        pedido = doc_to_dict_local(snap)
        if pedido.get("encerramentoOperacional"):
            raise HTTPException(409, "Mesa encerrada. Use a conferência de reservas na estufa.")
        if pedido.get("status") not in {"aberto", "pago"}:
            raise HTTPException(409, "Pedido não está aberto")
        if novo_status == "cancelado" and (pedido.get("status") == "pago" or pedido.get("pagamentos")):
            raise HTTPException(409, "Pedido com pagamento: não é possível cancelar itens")
        itens = deepcopy(pedido.get("itens", []))
        if not ids or not set(ids).issubset({i.get("id") for i in itens}):
            raise HTTPException(404, "Item não encontrado no pedido")
        transicoes = {
            "pendente": {"preparo", "cancelado"},
            "preparo": {"pronto", "cancelado"},
            "pronto": {"entregue", "cancelado"},
            "entregue": {"cancelado"},
            "cancelado": set(),
        }
        consumo: dict[str, float] = {}
        algum = False
        receitas: dict[str, dict] = {}
        for item in itens:
            if item.get("id") not in ids:
                continue
            algum = True
            atual = item.get("status")
            if atual == novo_status:
                continue
            if novo_status not in transicoes.get(atual, set()):
                raise HTTPException(409, f"Transição inválida: {atual} → {novo_status}")
            vai_baixar = (
                novo_status == "preparo"
                and item.get("status") == "pendente"
                and not item.get("baixadoEm")
                and item.get("modoEstoque") != "antecipado"
            )
            if vai_baixar:
                pid = item.get("produtoId")
                if pid:
                    if pid not in receitas:
                        receitas[pid] = item["consumoEstoque"] if "consumoEstoque" in item else _consumo_produto(restaurant_id, pid)
                    mult = float(item.get("qtd", 1) or 1)
                    for k, v in receitas[pid].items():
                        consumo[k] = consumo.get(k, 0.0) + v * mult
                item["baixadoEm"] = now_utc()
            item["status"] = novo_status
        if not algum:
            raise HTTPException(404, "Nenhum dos itens informados está neste pedido")
        gravar_lotes = producao_service.planejar_destino(
            transaction, restaurant_id, pedido_id, [i for i in itens if i.get("id") in ids],
            "entrega" if novo_status == "entregue" else "liberacao", usuario_id,
        ) if novo_status in {"entregue", "cancelado"} else lambda: None
        if consumo:
            gravar, aplicadas = _planejar_consumo(transaction, restaurant_id, pedido_id, consumo, usuario_id, itens=[i for i in itens if i.get("id") in ids and i.get("status") == "preparo"])
            from app.services import agregados_service
            agregados_service.registrar_saidas_tx(transaction, restaurant_id, aplicadas)
            gravar()
        gravar_lotes()
        transaction.update(doc_ref, stamp_update({"itens": itens, "total": pedido["total"] if pedido.get("status") == "pago" else _total(itens),
            "cozinhaPendente": any(i.get("status") in {"pendente", "preparo", "pronto"} for i in itens)}))

    pedido = _run_txn(restaurant_id, pedido_id, txn)
    return pedido


def _consumo_produto(restaurant_id: str, produto_id: str) -> dict[str, float]:
    """Receita do produto agregada por itemId (vazio se sem receita/produto removido)."""
    try:
        produto = produtos_service.obter(restaurant_id, produto_id)
    except HTTPException:
        return {}
    if produto.get("modoEstoque") == "antecipado":
        return {}
    if produto.get("modoEstoque") == "revenda":
        iid = produto.get("itemRevendaId")
        return {iid: 1} if iid else {}
    return calculos.agregar_consumo_receita((produto or {}).get("ingredientes") or [], 1)


def _aplicar_consumo(
    transaction,
    restaurant_id: str,
    pedido_id: str,
    consumo: dict[str, float],
    usuario_id: str | None,
) -> tuple[bool, dict[str, float]]:
    """Compatibilidade: planeja as leituras e aplica a baixa imediatamente."""
    gravar, aplicadas = _planejar_consumo(transaction, restaurant_id, pedido_id, consumo, usuario_id)
    gravar()
    return bool(aplicadas), aplicadas


def _planejar_consumo(
    transaction,
    restaurant_id: str,
    pedido_id: str,
    consumo: dict[str, float],
    usuario_id: str | None,
    itens=None,
):
    """Le os insumos e devolve a fase de escrita e as quantidades aplicadas."""
    # -------- fase 1: TODAS as leituras --------
    cfg_snap = next(iter(transaction.get(config_doc(restaurant_id))), None)
    if cfg_snap and cfg_snap.exists:
        if not (cfg_snap.to_dict() or {}).get("baixaEstoqueAutomatica", True):
            return (lambda: None), {}  # controle desativado pelo admin

    custos = {}
    pendentes: list[tuple[str, object, float, float, float]] = []  # (itemId, doc_ref, qtd_consumida, novo_saldo)
    for iid, total in sorted(consumo.items()):
        total = round(total, 3)
        if total <= 0:
            continue
        ref = item_doc(restaurant_id, "estoque", iid)
        snap = next(iter(transaction.get(ref)), None)
        if not snap or not snap.exists:
            continue  # ingrediente removido do estoque: ignora sem travar o preparo
        custo = (snap.to_dict() or {}).get('custoMedio')
        if custo is not None and float(custo) > 0:
            custos[iid] = custo
        atual = float((snap.to_dict() or {}).get("quantidadeAtual", 0) or 0)
        pendentes.append((iid, ref, total, round(atual - total, 3), float((snap.to_dict() or {}).get("custoMedio", 0))))

    from app.services.lucratividade import decimal
    for item in itens or []:
        if 'custoDiretoSnapshot' in item or item.get('modoEstoque') == 'antecipado':
            continue
        receita = item.get('consumoEstoque') or {}
        if receita and all(iid in custos for iid in receita):
            valor = sum(decimal(q) * decimal(custos[iid]) for iid, q in receita.items()) * decimal(item.get('qtd', 1))
            item.update(custoDiretoSnapshot=float(valor), custoDiretoEstado='conhecido',
                        custoTeoricoSnapshot=float(valor), custoReferenciaEm=now_utc())
    def gravar():
        # -------- fase 2: TODAS as escritas --------
        observacao = f"Baixa automática — preparo do pedido {pedido_id}"
        for iid, ref, qtd, novo_saldo, custo_unitario in pendentes:
            mov_ref = items_col(restaurant_id, "movimentacoes_estoque").document()
            transaction.set(
                mov_ref,
                stamp_create(
                    {
                        "tipo": "saida",
                        "itemId": iid,
                        "qtd": qtd,
                        "saldoApos": novo_saldo,
                        "custoUnitario": custo_unitario,
                        "observacao": observacao,
                        "pedidoId": pedido_id,
                        "usuarioId": usuario_id,
                        "restaurantId": restaurant_id,
                    }
                ),
            )
            transaction.update(ref, stamp_update({"quantidadeAtual": novo_saldo}))
    aplicadas = {iid: qtd for (iid, _, qtd, _, _) in pendentes}
    return gravar, aplicadas


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

        itens = deepcopy(pedido.get("itens", []))
        gravar_lotes = producao_service.planejar_destino(t, restaurant_id, pedido_id, itens, "liberacao", None)
        # ---------- fase 2: escritas ----------
        gravar_lotes()
        t.update(pedido_ref, stamp_update({"status": "cancelado", "fechadoEm": now_utc(), "itens": itens, "cozinhaPendente": False}))
        if mesa and mesa.get("pedidoAtivoId") == pedido_id:
            mesas_service.liberar_transacional(
                t, restaurant_id, pedido.get("mesaId")
            )

    executar_transacao(_exec)
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


def renovar_reserva(restaurant_id: str, pedido_id: str, item_id: str, usuario_id: str):
    def txn(t, ref):
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Pedido não encontrado")
        pedido = snap.to_dict() or {}
        if pedido.get("encerramentoOperacional"):
            raise HTTPException(409, "Mesa encerrada. Use a conferência da estufa.")
        if pedido.get("status") not in {"aberto", "pago"}:
            raise HTTPException(409, "Pedido cancelado")
        itens = deepcopy(pedido.get("itens", []))
        alvo = next((i for i in itens if i.get("id") == item_id), None)
        if not alvo or alvo.get("modoEstoque") != "antecipado":
            raise HTTPException(404, "Item de estufa não encontrado")
        if alvo.get("status") in {"entregue", "cancelado"}:
            raise HTTPException(409, "Item já finalizado")
        antigo_custo = alvo.get("custoProducao", 0)
        liberar = {a["loteId"]: a["qtd"] for a in alvo.get("lotesReservados", [])}
        gravar_liberacao = producao_service.planejar_destino(t, restaurant_id, pedido_id, [alvo], "liberacao", usuario_id)
        alvo.pop("reservaLiberadaEm", None)
        gravar_reserva = producao_service.planejar_reservas(t, restaurant_id, pedido_id, [alvo], usuario_id, liberar)
        if pedido.get("status") == "pago":
            alvo["custoProducao"] = antigo_custo  # custo reconhecido na venda já quitada
        gravar_liberacao()
        gravar_reserva()
        t.update(ref, stamp_update({"itens": itens}))
    return _run_txn(restaurant_id, pedido_id, txn)


def conferir_reserva(rid, uid, pedido_id, item_id, payload):
    """Conferência física explícita após fechamento; decisão única por item."""
    @transactional
    def executar(t):
        ref = item_doc(rid, "pedidos", pedido_id)
        pedido = producao_service._ler(t, ref, "Pedido não encontrado")
        if not pedido.get("encerramentoOperacional"):
            raise HTTPException(409, "Pedido não possui encerramento de mesa")
        itens = deepcopy(pedido.get("itens", []))
        item = next((i for i in itens if i["id"] == item_id), None)
        if not item:
            raise HTTPException(404, "Item não encontrado")
        anterior = item.get("conferenciaReserva")
        if anterior:
            if anterior["acao"] == payload.acao and anterior["motivo"] == payload.motivo:
                return
            raise HTTPException(409, "Reserva já conferida com outra decisão")
        if not item.get("reservaConferenciaPendente"):
            raise HTTPException(409, "Item não possui reserva pendente")
        gravar = producao_service.planejar_destino(t, rid, pedido_id, [item],
            "consumo_conferencia" if payload.acao == "consumido" else "liberacao", uid)
        item["reservaConferenciaPendente"] = False
        item["conferenciaReserva"] = {"acao": payload.acao, "motivo": payload.motivo, "em": now_utc(), "usuarioId": uid}
        gravar()
        t.update(ref, stamp_update({"itens": itens, "reservaConferenciaPendente": any(i.get("reservaConferenciaPendente") for i in itens)}))
    executar_transacao(executar)
    return obter(rid, pedido_id)
