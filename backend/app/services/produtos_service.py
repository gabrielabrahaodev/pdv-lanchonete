"""CRUD de produtos (com variações, ingredientes e imagem)."""
from __future__ import annotations

import base64

from fastapi import HTTPException

from app.models.models import ImagemCreate, ProductCreate, ProductUpdate
from app.services.base import ensure_parent, get_item, item_doc, items_col, list_items, stamp_create, stamp_update


def listar(restaurant_id: str, *, categoria_id: str | None = None, apenas_ativos: bool = False) -> list[dict]:
    docs = list_items(restaurant_id, "produtos")
    if categoria_id:
        docs = [d for d in docs if d.get("categoriaId") == categoria_id]
    if apenas_ativos:
        docs = [d for d in docs if d.get("ativo", True)]
    return docs


def obter(restaurant_id: str, produto_id: str) -> dict:
    doc = get_item(restaurant_id, "produtos", produto_id)
    if not doc:
        raise HTTPException(404, "Produto não encontrado")
    return doc


def criar(restaurant_id: str, payload: ProductCreate) -> dict:
    ensure_parent(restaurant_id, "produtos")
    data = payload.model_dump(by_alias=True)
    _validar_estoque(restaurant_id, data)
    ref = items_col(restaurant_id, "produtos").document()
    ref.set(stamp_create({**data, "restaurantId": restaurant_id}))
    return obter(restaurant_id, ref.id)


def atualizar(restaurant_id: str, produto_id: str, payload: ProductUpdate) -> dict:
    atual = obter(restaurant_id, produto_id)  # 404 se não existir
    changes = {k: v for k, v in payload.model_dump(by_alias=True).items() if v is not None}
    _validar_estoque(restaurant_id, {**atual, **changes})
    if changes:
        item_doc(restaurant_id, "produtos", produto_id).update(stamp_update(changes))
    return obter(restaurant_id, produto_id)


def remover(restaurant_id: str, produto_id: str) -> None:
    item_doc(restaurant_id, "produtos", produto_id).delete()
    # imagem é opcional; apaga se existir (evita órfão)
    item_doc(restaurant_id, "imagens", produto_id).delete()


# ------------------------------------------------------------------ imagem
def obter_imagem(restaurant_id: str, produto_id: str) -> dict | None:
    return get_item(restaurant_id, "imagens", produto_id)


def definir_imagem(restaurant_id: str, produto_id: str, payload: ImagemCreate) -> dict:
    obter(restaurant_id, produto_id)  # 404 se produto não existe
    ensure_parent(restaurant_id, "imagens")
    data = {"produtoId": produto_id, "mime": payload.mime, "base64": payload.imagem_base64}
    ref = item_doc(restaurant_id, "imagens", produto_id)
    if get_item(restaurant_id, "imagens", produto_id):
        ref.update(stamp_update(data))
    else:
        ref.set(stamp_create(data))
    item_doc(restaurant_id, "produtos", produto_id).update(stamp_update({"temImagem": True}))
    return {"produtoId": produto_id, "mime": payload.mime}


def remover_imagem(restaurant_id: str, produto_id: str) -> None:
    obter(restaurant_id, produto_id)  # 404 se produto não existe
    item_doc(restaurant_id, "imagens", produto_id).delete()
    item_doc(restaurant_id, "produtos", produto_id).update(stamp_update({"temImagem": False}))


def bytes_imagem(restaurant_id: str, produto_id: str) -> tuple[bytes, str] | None:
    """Retorna (conteúdo, mime) da foto do produto, ou None se não houver."""
    doc = get_item(restaurant_id, "imagens", produto_id)
    if not doc or not doc.get("base64"):
        return None
    try:
        return base64.b64decode(doc["base64"]), doc.get("mime") or "image/jpeg"
    except Exception:
        return None


def _validar_estoque(rid, produto):
    if produto.get("modoEstoque") == "revenda":
        iid = produto.get("itemRevendaId")
        if not iid or not get_item(rid, "estoque", iid):
            raise HTTPException(422, "Selecione o item de estoque da revenda")
    if produto.get("modoEstoque") == "antecipado":
        for ing in produto.get("ingredientes") or []:
            if not ing.get("itemId") or not 0 < float(ing.get("qtd", 0)) < float("inf"):
                raise HTTPException(422, "Informe ingredientes e quantidades positivas")
