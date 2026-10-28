"""Financeiro: despesas (insumos, folha manual, contas fixas e outras).

Escrita TRANSACIONAL (P1-F): o documento da despesa e os incrementos dos
agregados dia/mês vão na MESMA transação — sem estado dividido entre doc e
agregado. Evento determinístico em `data/eventos_agregados/items/...` evita
duplicação por reprocessamento.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from google.cloud.firestore import transactional

from app.core.firebase import get_db
from app.models.models import DespesaCreate, DespesaPagar, DespesaUpdate
from app.services.base import (
    ensure_parent,
    get_item,
    item_doc,
    items_col,
    list_items,
    list_items_paginado,
    now_utc,
    stamp_create,
    stamp_update,
)
from app.services import agregados_service

CATEGORIAS = {"insumo", "folha", "conta_fixa", "outra"}


def _dt(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, "ToDatetime"):
        return value.ToDatetime().replace(tzinfo=timezone.utc)
    return None


def listar(
    restaurant_id: str,
    *,
    inicio: datetime | None = None,
    fim: datetime | None = None,
    status: str | None = None,
    categoria: str | None = None,
    fornecedor_id: str | None = None,
    usuario_id: str | None = None,
) -> list[dict]:
    if categoria and categoria not in CATEGORIAS:
        raise HTTPException(422, f"Categoria deve ser uma de: {', '.join(sorted(CATEGORIAS))}")
    docs = list_items(restaurant_id, "despesas")
    for d in docs:
        d["_dtComp"] = _dt(d.get("data"))
    if inicio is not None:
        docs = [d for d in docs if d["_dtComp"] and d["_dtComp"] >= inicio]
    if fim is not None:
        docs = [d for d in docs if d["_dtComp"] and d["_dtComp"] <= fim]
    if status:
        docs = [d for d in docs if d.get("status") == status]
    if categoria:
        docs = [d for d in docs if d.get("categoria") == categoria]
    if fornecedor_id:
        docs = [d for d in docs if d.get("fornecedorId") == fornecedor_id]
    if usuario_id:
        docs = [d for d in docs if d.get("usuarioId") == usuario_id]
    for d in docs:
        d.pop("_dtComp", None)
    return docs


def listar_paginado(
    restaurant_id: str,
    *,
    limit: int | None = None,
    cursor_id: str | None = None,
    inicio: datetime | None = None,
    fim: datetime | None = None,
    status: str | None = None,
    categoria: str | None = None,
    fornecedor_id: str | None = None,
    usuario_id: str | None = None,
) -> tuple[list[dict], str | None]:
    """Despesas paginadas por competência (`data` DESC — P1-L).

    Sem `limit`: comportamento antigo integral (`listar`) — next_cursor None.
    Com `limit` e sem filtros além da janela de datas: consulta server-side
    (range + order no MESMO campo `data` = índice automático). Qualquer
    outro filtro cai no caminho integral (não paginado) para evitar índice
    composto em produção.
    """
    if categoria and categoria not in CATEGORIAS:
        raise HTTPException(422, f"Categoria deve ser uma de: {', '.join(sorted(CATEGORIAS))}")
    outros_filtros = any((status, categoria, fornecedor_id, usuario_id))
    if limit is not None and not outros_filtros:
        if limit <= 0:
            raise HTTPException(422, "limit deve ser maior que zero")
        return list_items_paginado(
            restaurant_id,
            "despesas",
            limit=limit,
            cursor_id=cursor_id,
            field="data",
            inicio=inicio,
            fim=fim,
        )
    return (
        listar(
            restaurant_id,
            inicio=inicio,
            fim=fim,
            status=status,
            categoria=categoria,
            fornecedor_id=fornecedor_id,
            usuario_id=usuario_id,
        ),
        None,
    )


def obter(restaurant_id: str, despesa_id: str) -> dict:
    doc = get_item(restaurant_id, "despesas", despesa_id)
    if not doc:
        raise HTTPException(404, "Despesa não encontrada")
    return doc


def _ver(doc: dict) -> str:
    """Fingerprint do estado lido — compõe o evento idempotente de mutação."""
    if "versaoAgregado" in doc:
        return str(doc["versaoAgregado"])
    dt = _dt(doc.get("updatedAt") or doc.get("atualizadoEm") or doc.get("createdAt") or doc.get("criadoEm"))
    return dt.isoformat() if dt else "nd"


def criar(restaurant_id: str, payload: DespesaCreate) -> dict:
    ensure_parent(restaurant_id, "despesas")
    ref = items_col(restaurant_id, "despesas").document()
    data = payload.model_dump(by_alias=True)
    data.setdefault("status", "pendente")
    data["restaurantId"] = restaurant_id

    @transactional
    def _exec(t) -> None:
        # Agregado PRIMEIRO (leitura + escrita), doc da despesa por último
        # (Firestore proíbe leitura após escrita na transação).
        agregados_service.ajustar_despesa_tx(
            t, restaurant_id, None, data, evento_id=f"despesa:{ref.id}:cria"
        )
        t.set(ref, stamp_create(data))

    _exec(get_db().transaction())
    return obter(restaurant_id, ref.id)


def atualizar(restaurant_id: str, despesa_id: str, payload: DespesaUpdate) -> dict:
    db = get_db()
    ref = item_doc(restaurant_id, "despesas", despesa_id)

    @transactional
    def _exec(t) -> None:
        # ---------- fase 1: leitura ----------
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Despesa não encontrada")
        anterior = dict(snap.to_dict() or {})
        if anterior.get('pedidoReposicaoId'):
            # Origem financeira vinculada ao recebimento do estoque: não
            # permitir alterar valor/competência/fornecedor separadamente.
            campos_economicos = {'categoria', 'descricao', 'valor', 'data',
                                 'fornecedor_id', 'usuario_id', 'observacoes',
                                 'vencimento', 'forma_pagamento'}
            alterados = payload.model_fields_set & campos_economicos
            if alterados:
                raise HTTPException(
                    409, 'Despesa vinculada a reposição: os dados de compra são imutáveis. É possível marcar como paga ou reabrir.'
                )
        dump = payload.model_dump(by_alias=True)
        reabrir = dump.pop("ativoPago", None)  # True=marca pago agora; False=reabre
        changes = {k: v for k, v in dump.items() if v is not None}
        if reabrir is True:
            changes["status"] = "pago"
            changes["pagoEm"] = now_utc()
        elif reabrir is False:
            from google.cloud.firestore_v1 import DELETE_FIELD

            changes["status"] = "pendente"
            changes["pagoEm"] = DELETE_FIELD

        # Estado consolidado pós-mutação (sem re-ler): base p/ agregado.
        novo = dict(anterior)
        for k, v in changes.items():
            if v is None:
                continue
            if hasattr(v, "ToDatetime") or isinstance(v, datetime):
                novo[k] = v
            else:
                novo[k] = v
        if isinstance(changes.get("pagoEm"), object) and type(changes.get("pagoEm")).__name__ == "Sentinel":
            novo.pop("pagoEm", None)
        if changes.get("status") == "pendente" and reabrir is False:
            novo["status"] = "pendente"
            novo.pop("pagoEm", None)

        # ---------- escritas ----------
        evento = f"despesa:{despesa_id}:upd:{_ver(anterior)}"
        # Agregado ANTES de gravar o doc (leitura após escrita é proibida na tx)
        agregados_service.ajustar_despesa_tx(
            t, restaurant_id, anterior, novo, evento_id=evento
        )
        changes["versaoAgregado"] = int(anterior.get("versaoAgregado", 0)) + 1
        t.update(ref, stamp_update(changes))

    _exec(db.transaction())
    return obter(restaurant_id, despesa_id)


def marcar_pago(restaurant_id: str, despesa_id: str, payload: DespesaPagar | None) -> dict:
    db = get_db()
    ref = item_doc(restaurant_id, "despesas", despesa_id)

    @transactional
    def _exec(t) -> None:
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Despesa não encontrada")
        changes: dict = {"status": "pago", "pagoEm": now_utc()}
        if payload and payload.forma_pagamento:
            changes["formaPagamento"] = payload.forma_pagamento
        # Pagar/reabrir NÃO alteram agregado (competência segue `data`).
        t.update(ref, stamp_update(changes))

    _exec(db.transaction())
    return obter(restaurant_id, despesa_id)


def remover(restaurant_id: str, despesa_id: str) -> None:
    db = get_db()
    ref = item_doc(restaurant_id, "despesas", despesa_id)

    @transactional
    def _exec(t) -> None:
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Despesa não encontrada")
        anterior = dict(snap.to_dict() or {})
        if anterior.get('pedidoReposicaoId'):
            raise HTTPException(409, 'Despesa vinculada a recebimento: não pode ser excluída sem desfazer o estoque')
        evento_id = f"despesa:{despesa_id}:del:{_ver(anterior)}"
        # Agregado primeiro; delete do doc por último (no reads after writes).
        agregados_service.ajustar_despesa_tx(t, restaurant_id, anterior, None, evento_id=evento_id)
        t.delete(ref)

    _exec(db.transaction())
