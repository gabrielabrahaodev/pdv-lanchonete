"""Usuários do restaurante (Firebase Auth + documento Firestore)."""

from __future__ import annotations
from app.services.base import executar_transacao

from fastapi import HTTPException
from google.cloud.firestore import transactional
from app.core.firebase import get_db

from app.models.models import UserCreate, UserUpdate
from app.services.base import (
    ensure_parent,
    get_item,
    item_doc,
    items_col,
    list_items,
    stamp_create,
    stamp_update,
)

PAPEIS = {"admin", "gerente", "caixa", "garcom", "cozinha"}


def listar(restaurant_id: str) -> list[dict]:
    docs = list_items(restaurant_id, "usuarios")
    # Fallback em lote só para docs legados sem email persistido.
    faltando = [d for d in docs if not d.get("email")]
    if faltando:
        try:
            from firebase_admin import auth as fb_auth

            from app.core.firebase import get_auth

            identifiers = [fb_auth.UserIdentifier(d["id"]) for d in faltando]
            emails = {u.uid: u.email for u in get_auth().get_users(identifiers)}
            for d in faltando:
                d["email"] = emails.get(d["id"])
        except Exception:  # noqa: BLE001
            pass
    return docs


def criar(restaurant_id: str, criador_papel: str, payload: UserCreate) -> dict:
    if payload.papel not in PAPEIS - {"admin"}:
        raise HTTPException(
            422, f"Papel deve ser um de: {', '.join(sorted(PAPEIS - {'admin'}))}"
        )
    if payload.papel in {"gerente"} and criador_papel != "admin":
        raise HTTPException(403, "Somente admin cria gerentes")

    from app.core.firebase import get_auth

    auth = get_auth()
    try:
        user = auth.create_user(
            email=payload.email, password=payload.senha, display_name=payload.nome
        )
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "EMAIL_EXISTS" in msg or exc.__class__.__name__ == "EmailAlreadyExistsError":
            raise HTTPException(409, "E-mail já cadastrado") from exc
        raise HTTPException(
            422 if isinstance(exc, ValueError) else 503,
            "Não foi possível criar a conta. Confira e-mail, senha e disponibilidade do serviço.",
        ) from exc

    auth.set_custom_user_claims(
        user.uid, {"restaurantId": restaurant_id, "papel": payload.papel}
    )
    ensure_parent(restaurant_id, "usuarios")
    data = {
        "nome": payload.nome,
        "email": payload.email,
        "papel": payload.papel,
        "ativo": True,
        "restaurantId": restaurant_id,
        "criadoEm": _utcnow(),
        "atualizadoEm": _utcnow(),
    }
    items_col(restaurant_id, "usuarios").document(user.uid).set(data)
    return {**get_item(restaurant_id, "usuarios", user.uid), "email": user.email}  # type: ignore[operator]


def _alterar_perfil(rid, ator_papel, uid, changes, ator_uid=None):
    ref = item_doc(rid, "usuarios", uid)
    trava = item_doc(rid, "controle_acessos", "administradores")

    @transactional
    def executar(t):
        lock = next(iter(t.get(trava)), None)
        admins = list(t.get(items_col(rid, "usuarios").where("papel", "==", "admin")))
        snap = next((a for a in admins if a.id == uid), None)
        if snap is None:
            snap = next(iter(t.get(ref)), None)
        if not snap or not snap.exists:
            raise HTTPException(404, "Usuário não encontrado")
        atual = snap.to_dict() or {}
        novo_papel = changes.get("papel", atual.get("papel"))
        if novo_papel not in PAPEIS:
            raise HTTPException(422, "Papel inválido")
        if (
            novo_papel == "admin" or atual.get("papel") == "admin"
        ) and ator_papel != "admin":
            raise HTTPException(403, "Apenas admin altera contas admin")
        if ator_papel != "admin" and (
            atual.get("papel") == "gerente" or novo_papel == "gerente"
        ):
            raise HTTPException(403, "Apenas admin altera contas de gerência")
        if ator_uid == uid and novo_papel != atual.get("papel"):
            raise HTTPException(403, "Não é permitido alterar seu próprio papel")
        if (
            atual.get("papel") == "admin"
            and atual.get("ativo") is True
            and (changes.get("ativo") is False or novo_papel != "admin")
        ):
            if (
                len([a for a in admins if (a.to_dict() or {}).get("ativo") is True])
                <= 1
            ):
                raise HTTPException(
                    409, "Mantenha pelo menos um administrador ativo no restaurante"
                )
        if "nome" in changes and not changes["nome"].strip():
            raise HTTPException(422, "Informe um nome válido")
        t.set(
            trava,
            {
                "versao": (
                    (lock.to_dict() or {}).get("versao", 0)
                    if lock and lock.exists
                    else 0
                )
                + 1
            },
        )
        t.update(ref, stamp_update(changes))
        t.set(
            items_col(rid, "auditoria_acessos").document(),
            stamp_create(
                {
                    "acao": "alteracao_perfil",
                    "usuarioId": uid,
                    "atorId": ator_uid,
                    "campos": sorted(changes),
                    "papelAnterior": atual.get("papel"),
                    "papelNovo": novo_papel,
                }
            ),
        )

    executar_transacao(executar)


def atualizar(
    restaurant_id: str,
    ator_papel: str,
    usuario_id: str,
    payload: UserUpdate,
    ator_uid=None,
) -> dict:
    changes = payload.model_dump(by_alias=True, exclude_none=True)
    if "senha" in changes:
        raise HTTPException(
            422,
            "Use a recuperação de senha por e-mail. A senha é gerenciada pelo próprio usuário.",
        )
    from app.core.firebase import get_auth

    auth = get_auth()
    _alterar_perfil(restaurant_id, ator_papel, usuario_id, changes, ator_uid)
    try:
        if "ativo" in changes:
            auth.update_user(usuario_id, disabled=not changes["ativo"])
        if changes.get("ativo") is False or "papel" in changes:
            auth.revoke_refresh_tokens(usuario_id)
        if "papel" in changes:
            claims = auth.get_user(usuario_id).custom_claims or {}
            if claims.get("restaurantId") not in {None, restaurant_id}:
                raise RuntimeError("Vínculo Auth divergente")
            auth.set_custom_user_claims(
                usuario_id,
                {**claims, "restaurantId": restaurant_id, "papel": changes["papel"]},
            )
        item_doc(restaurant_id, "usuarios", usuario_id).update(
            {"sincronizacaoAuthPendente": False}
        )
    except Exception as exc:
        # Perfil é a autoridade do backend/rules: rebaixamento/desativação já protege.
        item_doc(restaurant_id, "usuarios", usuario_id).update(
            {"sincronizacaoAuthPendente": True}
        )
        raise HTTPException(
            503,
            "Perfil salvo; sincronização com autenticação pendente. Repita a operação para concluir.",
        ) from exc
    return get_item(restaurant_id, "usuarios", usuario_id)


def remover(
    restaurant_id: str, ator_papel: str, usuario_id: str, ator_uid=None
) -> None:
    # Desativação lógica preserva autoria de operações históricas.
    atualizar(restaurant_id, ator_papel, usuario_id, UserUpdate(ativo=False), ator_uid)


def preparar_recuperacao(rid, uid, ator_papel, ator_uid):
    atual = get_item(rid, "usuarios", uid)
    if not atual:
        raise HTTPException(404, "Usuário não encontrado")
    if ator_papel != "admin" and atual.get("papel") in {"admin", "gerente"}:
        raise HTTPException(403, "Somente admin gerencia esta conta")
    from app.core.firebase import get_auth

    email = get_auth().get_user(uid).email
    items_col(rid, "auditoria_acessos").document().set(
        stamp_create(
            {"acao": "solicitacao_recuperacao", "usuarioId": uid, "atorId": ator_uid}
        )
    )
    return {"email": email}


def sincronizar_login(rid, uid):
    from app.core.firebase import get_auth

    user = get_auth().get_user(uid)
    atual = get_item(rid, "usuarios", uid)
    if not atual or not atual.get("ativo"):
        raise HTTPException(403, "Perfil inativo")
    if user.email != atual.get("email"):
        if not user.email_verified:
            raise HTTPException(
                409, "Verifique o novo endereço de e-mail antes de sincronizar"
            )
        item_doc(rid, "usuarios", uid).update(stamp_update({"email": user.email}))
        items_col(rid, "auditoria_acessos").document().set(
            stamp_create(
                {
                    "acao": "login_verificado_sincronizado",
                    "usuarioId": uid,
                    "atorId": uid,
                }
            )
        )
    return {"email": user.email}


# ------------------------------------------------------------- preferências
TEMA_DEFAULT = "claro"


def obter_preferencias(restaurant_id: str, uid: str) -> dict:
    doc = get_item(restaurant_id, "usuarios", uid)
    return {"tema": (doc or {}).get("tema") or TEMA_DEFAULT}


def atualizar_preferencias(
    restaurant_id: str,
    uid: str,
    email: str | None,
    nome: str | None,
    papel: str | None,
    payload,
) -> dict:
    """Atualiza somente campos pessoais de um perfil ativo existente."""
    ref = item_doc(restaurant_id, "usuarios", uid)
    atual = get_item(restaurant_id, "usuarios", uid)
    if not atual or not atual.get("ativo"):
        raise HTTPException(403, "Perfil inexistente ou inativo")
    changes = payload.model_dump(exclude_none=True)
    if changes.get("nome") is not None:
        changes["nome"] = changes["nome"].strip()
        if not changes["nome"]:
            raise HTTPException(422, "Informe o nome")
    ref.update(stamp_update(changes))
    return {k: (changes.get(k, atual.get(k))) for k in ("tema", "nome")}


def _utcnow():
    from app.services.base import now_utc

    return now_utc()


def registrar_solicitacao_seguranca(rid, uid, acao):
    if acao not in {"solicitar_troca_email", "solicitar_troca_senha"}:
        raise HTTPException(422, "Ação inválida")
    atual = get_item(rid, "usuarios", uid)
    if not atual or not atual.get("ativo"):
        raise HTTPException(403, "Perfil inativo")
    items_col(rid, "auditoria_acessos").document().set(
        stamp_create({"acao": acao, "usuarioId": uid, "atorId": uid})
    )
    return {"registrado": True}
