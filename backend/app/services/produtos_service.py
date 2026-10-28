"""CRUD de produtos (com variações, ingredientes e imagem)."""

from __future__ import annotations

import base64

from fastapi import HTTPException
from google.cloud.firestore import transactional
from app.core.firebase import get_db
from app.services.unidades import quantidade_controle

from app.models.models import ImagemCreate, ProductCreate, ProductUpdate
from app.services.base import (
    ensure_parent,
    get_item,
    item_doc,
    items_col,
    list_items,
    stamp_create,
    stamp_update,
)


def listar(
    restaurant_id: str, *, categoria_id: str | None = None, apenas_ativos: bool = False
) -> list[dict]:
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


def _normalizar(t, rid, data, anterior=None):
    anteriores = {i["itemId"] for i in (anterior or {}).get("ingredientes", [])}
    if (anterior or {}).get("itemRevendaId"):
        anteriores.add(anterior["itemRevendaId"])
    refs = {}
    ids = {i.get("itemId") for i in data.get("ingredientes", [])}
    if data.get("modoEstoque") == "revenda":
        ids.add(data.get("itemRevendaId"))
    for iid in sorted(ids - {None, ""}):
        ref = item_doc(rid, "estoque", iid)
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(422, "Ingrediente não encontrado no restaurante")
        item = snap.to_dict() or {}
        if item.get("ativo") is False and iid not in anteriores:
            raise HTTPException(409, "Insumo arquivado não pode entrar em nova receita")
        refs[iid] = (ref, item)
    for ing in data.get("ingredientes", []):
        if ing.get("itemId") not in refs:
            raise HTTPException(422, "Selecione o ingrediente")
        item = refs[ing["itemId"]][1]
        # API accepts qtd in unidade. Historical recipes have qtd in control unit.
        original = ing["qtd"]
        unidade = ing.get("unidade") or item["unidade"]
        ing["qtd"] = quantidade_controle(original, unidade, item)
        if ing["qtd"] <= 0:
            raise HTTPException(422, "Quantidade de ingrediente inválida")
        ing["qtdInformada"], ing["unidadeInformada"] = original, unidade
        ing.pop("unidade", None)
    if data.get("modoEstoque") == "revenda" and not data.get("itemRevendaId"):
        raise HTTPException(422, "Selecione o insumo da revenda")
    return refs


def criar(restaurant_id: str, payload: ProductCreate) -> dict:
    ref = items_col(restaurant_id, "produtos").document()

    @transactional
    def executar(t):
        data = payload.model_dump(by_alias=True, exclude_none=True)
        refs = _normalizar(t, restaurant_id, data)
        for ir, item in refs.values():
            t.update(ir, stamp_update({"referenciaReceita": True}))
        t.set(ref, stamp_create({**data, "restaurantId": restaurant_id}))

    executar(get_db().transaction())
    return obter(restaurant_id, ref.id)


def atualizar(restaurant_id: str, produto_id: str, payload: ProductUpdate) -> dict:
    ref = item_doc(restaurant_id, "produtos", produto_id)

    @transactional
    def executar(t):
        snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Produto não encontrado")
        atual = snap.to_dict() or {}
        changes = payload.model_dump(by_alias=True, exclude_none=True)
        data = {**atual, **changes}
        # Do not normalize a historical normalized recipe twice on unrelated edits.
        refs = (
            _normalizar(t, restaurant_id, data, atual)
            if "ingredientes" in changes
            else {}
        )
        if "ingredientes" not in changes and data.get("modoEstoque") == "revenda":
            refs = _normalizar(t, restaurant_id, {**data, "ingredientes": []}, atual)
        for ir, item in refs.values():
            t.update(ir, stamp_update({"referenciaReceita": True}))
        if "ingredientes" in changes:
            changes["ingredientes"] = data["ingredientes"]
        t.update(ref, stamp_update(changes))

    executar(get_db().transaction())
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
    data = {
        "produtoId": produto_id,
        "mime": payload.mime,
        "base64": payload.imagem_base64,
    }
    ref = item_doc(restaurant_id, "imagens", produto_id)
    if get_item(restaurant_id, "imagens", produto_id):
        ref.update(stamp_update(data))
    else:
        ref.set(stamp_create(data))
    item_doc(restaurant_id, "produtos", produto_id).update(
        stamp_update({"temImagem": True})
    )
    return {"produtoId": produto_id, "mime": payload.mime}


def remover_imagem(restaurant_id: str, produto_id: str) -> None:
    obter(restaurant_id, produto_id)  # 404 se produto não existe
    item_doc(restaurant_id, "imagens", produto_id).delete()
    item_doc(restaurant_id, "produtos", produto_id).update(
        stamp_update({"temImagem": False})
    )


def bytes_imagem(restaurant_id: str, produto_id: str) -> tuple[bytes, str] | None:
    """Retorna (conteúdo, mime) da foto do produto, ou None se não houver."""
    doc = get_item(restaurant_id, "imagens", produto_id)
    if not doc or not doc.get("base64"):
        return None
    try:
        return base64.b64decode(doc["base64"]), doc.get("mime") or "image/jpeg"
    except Exception:
        return None
