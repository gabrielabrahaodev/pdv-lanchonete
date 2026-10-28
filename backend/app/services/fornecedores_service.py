"""Financeiro: fornecedores (cadastro simples)."""
from __future__ import annotations

from fastapi import HTTPException

from app.models.models import FornecedorCreate, FornecedorUpdate
from app.services.base import ensure_parent, get_item, item_doc, items_col, list_items, stamp_create, stamp_update


def listar(restaurant_id: str, *, apenas_ativos: bool = False) -> list[dict]:
    docs = list_items(restaurant_id, "fornecedores")
    if apenas_ativos:
        docs = [d for d in docs if d.get("ativo", True)]
    return docs


def obter(restaurant_id: str, fornecedor_id: str) -> dict:
    doc = get_item(restaurant_id, "fornecedores", fornecedor_id)
    if not doc:
        raise HTTPException(404, "Fornecedor não encontrado")
    return doc


def criar(restaurant_id: str, payload: FornecedorCreate) -> dict:
    ensure_parent(restaurant_id, "fornecedores")
    ref = items_col(restaurant_id, "fornecedores").document()
    ref.set(stamp_create({**payload.model_dump(by_alias=True), "restaurantId": restaurant_id}))
    return obter(restaurant_id, ref.id)


def atualizar(restaurant_id: str, fornecedor_id: str, payload: FornecedorUpdate) -> dict:
    obter(restaurant_id, fornecedor_id)
    changes = {k: v for k, v in payload.model_dump(by_alias=True).items() if v is not None}
    if changes:
        item_doc(restaurant_id, "fornecedores", fornecedor_id).update(stamp_update(changes))
    return obter(restaurant_id, fornecedor_id)


def remover(restaurant_id: str, fornecedor_id: str) -> None:
    from google.cloud.firestore import transactional
    from app.services.base import executar_transacao
    ref = item_doc(restaurant_id, 'fornecedores', fornecedor_id)

    @transactional
    def executar(t):
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, 'Fornecedor não encontrado')
        for colecao in ('estoque', 'pedidos_reposicao', 'despesas', 'movimentacoes_estoque'):
            vinculados = t.get(items_col(restaurant_id, colecao).where('fornecedorId', '==', fornecedor_id).limit(1))
            if any(d.exists for d in vinculados):
                raise HTTPException(409, 'Fornecedor com vínculos ou histórico: desative em vez de excluir')
        t.delete(ref)
    executar_transacao(executar)
