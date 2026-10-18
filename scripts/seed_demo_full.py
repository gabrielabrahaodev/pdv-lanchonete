#!/usr/bin/env python3
"""Gera uma semana de demonstração completa no PDV Lanchonete.

Inclui:
- 5 a 15 pedidos pagos por dia, com produtos e quantidades variadas;
- agregados diários/mensais de venda;
- saídas de estoque associadas a cada pedido e atualização do saldo;
- compras/entradas de estoque em dois momentos da semana;
- despesas da categoria `insumo` correspondentes às compras;
- marcação `dadosDemo`/`demoBatchId` e opção de limpeza segura.

Salvar em <raiz-do-repositório>/scripts/seed_demo_full.py e executar de dentro
`backend` usando o Python do ambiente virtual. Sem --apply, apenas simula.

AVISO: use uma instalação/restaurante de demonstração. Se algum produto não tiver
ficha técnica (ingredientes), o script simula consumo de insumos existentes e marca
essas saídas como consumo estimado, apenas para demonstrar o fluxo completo.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import random
import sys
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from google.cloud.firestore import transactional  # noqa: E402
from google.cloud.firestore_v1.transforms import Increment  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.firebase import get_db  # noqa: E402
from app.services import agregados_service  # noqa: E402
from app.services.base import now_utc  # noqa: E402

TZ = ZoneInfo(settings.timezone)
PAYMENT_METHODS = ("pix", "dinheiro", "credito", "debito")
_WARNED_RECIPE_QUANTITIES: set[str] = set()

FALLBACK_STOCK = [
    ("demo_insumo_pao", "Pão", "unidade", 0.55),
    ("demo_insumo_proteina", "Proteína", "kg", 25.00),
    ("demo_insumo_queijo", "Queijo", "kg", 32.00),
    ("demo_insumo_molho", "Molho", "litro", 12.00),
    ("demo_insumo_batata", "Batata", "kg", 6.50),
    ("demo_insumo_embalagem", "Embalagem", "unidade", 0.80),
]


def money(value: Any) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def round_qty(value: float) -> float:
    return round(float(value), 3)


def fmt_money(value: float) -> str:
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def short_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]


def parse_args() -> argparse.Namespace:
    today = datetime.now(TZ).date()
    parser = argparse.ArgumentParser(
        description="Popula 7 dias de vendas, compras e movimentos de estoque demonstrativos."
    )
    parser.add_argument("--restaurant-id", default=None, help="ID do restaurante no Firestore (ou DEMO_RESTAURANT_ID).")
    parser.add_argument("--start-date", default=(today - timedelta(days=6)).isoformat(), help="Primeiro dia local, AAAA-MM-DD.")
    parser.add_argument("--days", type=int, default=7, help="Dias a gerar (1 a 31; padrão 7).")
    parser.add_argument("--min-orders", type=int, default=5, help="Mínimo de pedidos por dia.")
    parser.add_argument("--max-orders", type=int, default=15, help="Máximo de pedidos por dia.")
    parser.add_argument("--seed", type=int, default=20261018, help="Semente aleatória reproduzível.")
    parser.add_argument("--apply", action="store_true", help="Grava os dados. Sem esta opção, apenas simula.")
    parser.add_argument("--cleanup", action="store_true", help="Remove exclusivamente os dados do lote demo informado pelo período.")
    return parser.parse_args()


def get_one(transaction, ref):
    return next(iter(transaction.get(ref)), None)


def ref_doc(db, restaurant_id: str, kind: str, item_id: str):
    return db.document(f"restaurantes/{restaurant_id}/data/{kind}/items/{item_id}")


def backup_ref(db, restaurant_id: str, batch_id: str, item_id: str):
    backup_id = f"{batch_id}__{short_hash(item_id)}"
    return ref_doc(db, restaurant_id, "demo_stock_backups", backup_id)


def inventory_path(restaurant_id: str, item_id: str) -> str:
    return f"restaurantes/{restaurant_id}/data/estoque/items/{item_id}"


def load_products(db, restaurant_id: str) -> list[dict[str, Any]]:
    col = db.collection(f"restaurantes/{restaurant_id}/data/produtos/items")
    products: list[dict[str, Any]] = []
    for snap in col.stream():
        p = snap.to_dict() or {}
        p["id"] = snap.id
        if not p.get("ativo", True) or money(p.get("preco", 0)) <= 0:
            continue
        p["preco"] = money(p["preco"])
        p["_variacoes_ativas"] = [v for v in (p.get("variacoes") or []) if v.get("ativo", True)]
        products.append(p)
    return products


def load_inventory(db, restaurant_id: str) -> dict[str, dict[str, Any]]:
    col = db.collection(f"restaurantes/{restaurant_id}/data/estoque/items")
    inventory: dict[str, dict[str, Any]] = {}
    for snap in col.stream():
        row = snap.to_dict() or {}
        row["id"] = snap.id
        row["nome"] = row.get("nome") or f"Insumo {snap.id}"
        row["unidade"] = row.get("unidade") or "unidade"
        row["quantidadeAtual"] = float(row.get("quantidadeAtual", 0) or 0)
        row["custoMedio"] = float(row.get("custoMedio", 0) or 0)
        inventory[snap.id] = row
    return inventory


def load_table_ids(db, restaurant_id: str) -> list[str]:
    col = db.collection(f"restaurantes/{restaurant_id}/data/mesas/items")
    table_ids: list[str] = []
    for snap in col.stream():
        data = snap.to_dict() or {}
        if data.get("status", "livre") not in {"inativa", "reservada"}:
            table_ids.append(snap.id)
    return table_ids


def fallback_rate(unit: str) -> float:
    u = (unit or "").strip().lower()
    if any(x in u for x in ("grama", "gram", " g")) or u == "g":
        return 120.0
    if any(x in u for x in ("ml", "mililitro")):
        return 120.0
    if any(x in u for x in ("kg", "quilo", "litro")) or u in {"l", "lt"}:
        return 0.16
    return 1.0


def normalize_recipe_quantity(quantity: float, item: dict[str, Any] | None) -> tuple[float, bool]:
    """Converte unidades comuns de ficha técnica para a unidade do estoque.

    Muitos cadastros de lanchonetes registram ingredientes em gramas/ml,
    enquanto o estoque está em kg/L. Valores extremos não são aplicados como
    consumo real: são substituídos por uma estimativa conservadora para a
    demonstração e retornados como estimados.
    """
    raw = max(0.0, float(quantity or 0))
    unit = str((item or {}).get("unidade", "unidade") or "unidade").strip().lower()

    kg_units = {"kg", "quilo", "quilos", "quilograma", "quilogramas"}
    gram_units = {"g", "gr", "grama", "gramas"}
    liter_units = {"l", "lt", "litro", "litros"}
    ml_units = {"ml", "mililitro", "mililitros"}

    normalized = raw
    if unit in kg_units and raw > 5:
        # Ficha técnica provavelmente está em gramas e o estoque em kg.
        normalized = raw / 1000.0
    elif unit in gram_units and 0 < raw < 5:
        # Ficha técnica provavelmente está em kg e o estoque em gramas.
        normalized = raw * 1000.0
    elif unit in liter_units and raw > 5:
        # Ficha técnica provavelmente está em ml e o estoque em litros.
        normalized = raw / 1000.0
    elif unit in ml_units and 0 < raw < 5:
        # Ficha técnica provavelmente está em litros e o estoque em ml.
        normalized = raw * 1000.0

    # Uma única porção não deve consumir dezenas/centenas de kg ou milhares
    # de unidades. Caso de cadastro claramente fora de escala: estima pelo
    # mesmo padrão conservador usado para os produtos sem ficha técnica.
    plausible_max = 2.0 if unit in kg_units else 2.0 if unit in liter_units else 2500.0 if unit in gram_units | ml_units else 20.0
    if normalized > plausible_max:
        item_name = str((item or {}).get("nome") or (item or {}).get("id") or "insumo")
        warning_key = f"{item_name}|{raw}|{unit}"
        if warning_key not in _WARNED_RECIPE_QUANTITIES:
            print(
                f"AVISO: quantidade de ficha técnica fora de escala para {item_name} "
                f"({raw:g} {unit}); usando consumo estimado de {fallback_rate(unit):g} {unit} por unidade vendida."
            )
            _WARNED_RECIPE_QUANTITIES.add(warning_key)
        return fallback_rate(unit), True
    return round_qty(normalized), False


def ensure_stock_record(db, restaurant_id: str, batch_id: str, item_id: str,
                        name: str, unit: str, default_cost: float, apply: bool,
                        inventory: dict[str, dict[str, Any]]) -> None:
    """Garante o insumo e registra o saldo/custo original antes da primeira mudança."""
    current = inventory.get(item_id)
    if current and not current.get("_virtual"):
        if apply:
            save_backup(db, restaurant_id, batch_id, current, existed_before=True)
        return

    virtual = current or {
        "id": item_id, "nome": name, "unidade": unit, "quantidadeAtual": 0.0,
        "minimo": 0.0, "custoMedio": 0.0, "restaurantId": restaurant_id,
        "_virtual": True,
    }
    virtual["nome"] = name or virtual.get("nome") or f"Insumo {item_id}"
    virtual["unidade"] = unit or virtual.get("unidade") or "unidade"
    virtual["_defaultCost"] = default_cost or virtual.get("_defaultCost", 0.0)
    inventory[item_id] = virtual
    if not apply:
        return

    b_ref = backup_ref(db, restaurant_id, batch_id, item_id)
    stock_ref = ref_doc(db, restaurant_id, "estoque", item_id)

    @transactional
    def _create(t):
        b_snap = get_one(t, b_ref)
        s_snap = get_one(t, stock_ref)
        # O backup existente indica que este lote já iniciou o item.
        if b_snap and b_snap.exists:
            return (s_snap.to_dict() or {}) if s_snap and s_snap.exists else None
        if s_snap and s_snap.exists:
            data = s_snap.to_dict() or {}
            t.set(b_ref, {
                "demoBatchId": batch_id, "itemId": item_id, "existedBefore": True,
                "originalQuantidadeAtual": float(data.get("quantidadeAtual", 0) or 0),
                "originalCustoMedio": float(data.get("custoMedio", 0) or 0),
                "createdAt": now_utc(), "updatedAt": now_utc(),
            })
            return data
        t.set(b_ref, {
            "demoBatchId": batch_id, "itemId": item_id, "existedBefore": False,
            "originalQuantidadeAtual": 0.0, "originalCustoMedio": 0.0,
            "createdAt": now_utc(), "updatedAt": now_utc(),
        })
        record = {
            "nome": virtual["nome"], "unidade": virtual["unidade"],
            "quantidadeAtual": 0.0, "minimo": 0.0, "custoMedio": 0.0,
            "restaurantId": restaurant_id, "dadosDemo": True,
            "demoBatchId": batch_id, "demoCreated": True,
            "createdAt": now_utc(), "updatedAt": now_utc(),
        }
        t.set(stock_ref, record)
        return record

    saved = _create(db.transaction())
    if saved:
        virtual.update(saved)
        virtual["id"] = item_id
        virtual.pop("_virtual", None)
    else:
        # If a previous interrupted run already created the item and its backup,
        # recover the persisted document instead of trying to create it again.
        snap = stock_ref.get()
        if snap.exists:
            virtual.update(snap.to_dict() or {})
            virtual.pop("_virtual", None)


def save_backup(db, restaurant_id: str, batch_id: str,
                item: dict[str, Any], existed_before: bool = True) -> None:
    b_ref = backup_ref(db, restaurant_id, batch_id, item["id"])
    stock_ref = ref_doc(db, restaurant_id, "estoque", item["id"])

    @transactional
    def _save(t):
        b_snap = get_one(t, b_ref)
        if b_snap and b_snap.exists:
            return
        s_snap = get_one(t, stock_ref)
        if not s_snap or not s_snap.exists:
            t.set(b_ref, {
                "demoBatchId": batch_id, "itemId": item["id"], "existedBefore": False,
                "originalQuantidadeAtual": 0.0, "originalCustoMedio": 0.0,
                "createdAt": now_utc(), "updatedAt": now_utc(),
            })
            return
        current = s_snap.to_dict() or {}
        t.set(b_ref, {
            "demoBatchId": batch_id, "itemId": item["id"], "existedBefore": existed_before,
            "originalQuantidadeAtual": float(current.get("quantidadeAtual", 0) or 0),
            "originalCustoMedio": float(current.get("custoMedio", 0) or 0),
            "createdAt": now_utc(), "updatedAt": now_utc(),
        })

    _save(db.transaction())


def build_order(restaurant_id: str, order_id: str, closed_at: datetime,
                products: list[dict[str, Any]], table_ids: list[str], rng: random.Random,
                batch_id: str, inventory: dict[str, dict[str, Any]],
                fallback_map: dict[str, list[tuple[str, float]]]) -> tuple[dict[str, Any], dict[str, float], bool]:
    line_count = rng.randint(1, min(4, len(products)))
    chosen = rng.sample(products, k=line_count)
    items: list[dict[str, Any]] = []
    consumption: dict[str, float] = defaultdict(float)
    recipe_consumption_estimated = False

    for index, product in enumerate(chosen, start=1):
        qty = rng.randint(1, 3)
        price = money(product["preco"])
        variation_id = None
        variations = product.get("_variacoes_ativas") or []
        if variations and rng.random() < 0.35:
            variation = rng.choice(variations)
            variation_id = variation.get("id")
            price = money(price + float(variation.get("precoAdicional", 0) or 0))
        item: dict[str, Any] = {
            "id": f"{order_id}_item_{index:02d}", "produtoId": product["id"], "qtd": qty,
            "precoUnitario": price, "status": "entregue",
        }
        if variation_id:
            item["variacaoId"] = variation_id
        items.append(item)

        recipe = [i for i in (product.get("ingredientes") or [])
                  if i.get("itemId") and float(i.get("qtd", 0) or 0) > 0]
        if recipe:
            for ingredient in recipe:
                iid = str(ingredient["itemId"])
                per_serving, was_estimated = normalize_recipe_quantity(
                    float(ingredient.get("qtd", 0) or 0), inventory.get(iid)
                )
                recipe_consumption_estimated = recipe_consumption_estimated or was_estimated
                consumption[iid] += per_serving * qty
        else:
            # Ficha técnica ausente: consumo estimado e explicitamente marcado no movimento.
            for iid, rate in fallback_map[product["id"]]:
                consumption[iid] += rate * qty

    consumption = {iid: round_qty(qty) for iid, qty in consumption.items() if qty > 0}
    total = money(sum(Decimal(str(i["qtd"])) * Decimal(str(i["precoUnitario"])) for i in items))
    payment_method = rng.choices(PAYMENT_METHODS, weights=(45, 20, 20, 15), k=1)[0]
    payment = {"id": f"{order_id}_pag_01", "tipo": payment_method, "valor": total, "criadoEm": closed_at}
    if table_ids:
        table_id, order_type = rng.choice(table_ids), "local"
    else:
        table_id, order_type = "balcao-demo", "balcao"
    created_at = closed_at - timedelta(minutes=rng.randint(5, 45))
    order = {
        "mesaId": table_id, "tipo": order_type, "status": "pago", "itens": items,
        "total": total, "pagamentos": [payment], "usuarioId": "seed-demo-full",
        "restaurantId": restaurant_id, "createdAt": created_at, "updatedAt": closed_at,
        "fechadoEm": closed_at, "dadosDemo": True, "demoBatchId": batch_id,
    }
    return order, consumption, recipe_consumption_estimated


def unit_cost(item: dict[str, Any], rng: random.Random) -> float:
    current = float(item.get("custoMedio", 0) or 0)
    if current > 0:
        base = current
    else:
        unit = str(item.get("unidade", "")).lower()
        base = 25.0 if ("kg" in unit or "quilo" in unit) else 10.0 if ("litro" in unit or unit in {"l", "lt"}) else 0.8
    return money(base * rng.uniform(0.92, 1.12))


def plan_purchases(start_date: date, days: int, inventory: dict[str, dict[str, Any]],
                   daily_consumption: list[dict[str, float]], rng: random.Random) -> list[dict[str, Any]]:
    midpoint = max(1, days // 2) if days > 1 else 1
    used = sorted({iid for day in daily_consumption for iid in day})
    plans: list[dict[str, Any]] = []
    for iid in used:
        item = inventory[iid]
        early_need = sum(daily_consumption[i].get(iid, 0.0) for i in range(min(midpoint, days)))
        late_need = sum(daily_consumption[i].get(iid, 0.0) for i in range(midpoint, days))
        cost = unit_cost(item, rng)
        # Compras sintéticas cobrem o consumo de cada metade da semana + margem de segurança.
        if early_need > 0:
            qty = round_qty(max(early_need * 1.18, 0.25 if fallback_rate(item.get("unidade", "")) < 1 else 1.0))
            plans.append({"date": start_date, "slot": "a", "itemId": iid, "qtd": qty, "unitCost": cost})
        if late_need > 0:
            qty = round_qty(max(late_need * 1.18, 0.25 if fallback_rate(item.get("unidade", "")) < 1 else 1.0))
            plans.append({"date": start_date + timedelta(days=midpoint), "slot": "b", "itemId": iid, "qtd": qty, "unitCost": cost})
    return plans


def create_purchase(db, restaurant_id: str, batch_id: str, purchase: dict[str, Any], item_info: dict[str, Any]) -> bool:
    iid = purchase["itemId"]
    day = purchase["date"]
    slot = purchase["slot"]
    movement_id = f"demo_compra_{day:%Y%m%d}_{slot}_{short_hash(iid)}"
    expense_id = f"demo_despesa_{day:%Y%m%d}_{slot}_{short_hash(iid)}"
    movement_ref = ref_doc(db, restaurant_id, "movimentacoes_estoque", movement_id)
    expense_ref = ref_doc(db, restaurant_id, "despesas", expense_id)
    stock_ref = ref_doc(db, restaurant_id, "estoque", iid)
    at = datetime.combine(day, time(9, 0 if slot == "a" else 20), tzinfo=TZ)
    qty, cost = float(purchase["qtd"]), float(purchase["unitCost"])
    total_cost = money(qty * cost)

    expense = {
        "categoria": "insumo", "descricao": f"Compra demo de {item_info.get('nome', iid)}",
        "valor": total_cost, "data": at, "vencimento": at, "status": "pago",
        "pagoEm": at, "formaPagamento": "pix", "fornecedorId": None,
        "usuarioId": "seed-demo-full", "restaurantId": restaurant_id,
        "dadosDemo": True, "demoBatchId": batch_id,
        "createdAt": at, "updatedAt": at,
    }
    movement = {
        "tipo": "entrada", "itemId": iid,
        "itemNome": item_info.get("nome", iid),
        "unidade": item_info.get("unidade", "unidade"),
        "qtd": qty, "saldoApos": None,
        "custoUnitario": cost, "custoTotal": total_cost,
        "observacao": "Compra demonstrativa de insumos", "pedidoId": None,
        "despesaId": expense_id, "usuarioId": "seed-demo-full", "restaurantId": restaurant_id,
        "dadosDemo": True, "demoBatchId": batch_id, "createdAt": at, "updatedAt": at,
    }

    @transactional
    def _write(t) -> bool:
        stock_snap = get_one(t, stock_ref)
        movement_snap = get_one(t, movement_ref)
        expense_snap = get_one(t, expense_ref)
        if not stock_snap or not stock_snap.exists:
            raise RuntimeError(f"Insumo de estoque não encontrado: {iid}")
        if movement_snap and movement_snap.exists:
            if expense_snap and expense_snap.exists:
                return False
            raise RuntimeError(f"Compra demo parcialmente gravada ({movement_id}); confira o Firestore antes de continuar.")

        stock = stock_snap.to_dict() or {}
        old_qty = float(stock.get("quantidadeAtual", 0) or 0)
        old_cost = float(stock.get("custoMedio", 0) or 0)
        new_qty = round_qty(old_qty + qty)
        new_cost = cost if new_qty <= 0 else money(((old_qty * old_cost) + (qty * cost)) / new_qty)
        movement["saldoApos"] = new_qty

        # O agregado financeiro da despesa é escrito antes das demais gravações;
        # a função garante que as próprias leituras sejam anteriores às escritas.
        agregados_service.ajustar_despesa_tx(
            t, restaurant_id, None, expense, evento_id=f"demo-compra-despesa:{expense_id}"
        )
        t.update(stock_ref, {"quantidadeAtual": new_qty, "custoMedio": new_cost, "updatedAt": now_utc()})
        t.set(movement_ref, movement)
        t.set(expense_ref, expense)
        return True

    return _write(db.transaction())


def create_order(db, restaurant_id: str, batch_id: str, order_id: str, order: dict[str, Any]) -> bool:
    order_ref = ref_doc(db, restaurant_id, "pedidos", order_id)
    event_id = f"venda:{order_id}"

    @transactional
    def _write(t) -> bool:
        existing = get_one(t, order_ref)
        if existing and existing.exists:
            old = existing.to_dict() or {}
            if old.get("dadosDemo") and old.get("demoBatchId") == batch_id:
                return False
            raise RuntimeError(f"ID de pedido demo colide com documento existente: {order_id}")
        agregados_service.registrar_venda_tx(
            t, restaurant_id, order, order.get("pagamentos", []),
            fechado_em=order["fechadoEm"], evento_id=event_id,
        )
        t.set(order_ref, order)
        return True

    return _write(db.transaction())


def create_sale_stock_out(db, restaurant_id: str, batch_id: str, order_id: str,
                          closed_at: datetime, consumption: dict[str, float],
                          inventory: dict[str, dict[str, Any]], estimated: bool) -> bool:
    if not consumption:
        return False
    event_id = f"demo-saidas:{order_id}"
    event_ref = ref_doc(db, restaurant_id, "eventos_agregados", event_id)
    ids = sorted(consumption)
    stock_refs = {iid: ref_doc(db, restaurant_id, "estoque", iid) for iid in ids}
    movement_ids = {iid: f"demo_saida_{order_id}_{short_hash(iid)}" for iid in ids}
    movement_refs = {iid: ref_doc(db, restaurant_id, "movimentacoes_estoque", movement_ids[iid]) for iid in ids}

    @transactional
    def _write(t) -> bool:
        # Todas as leituras de estoque/movimentos/evento acontecem antes de qualquer escrita.
        event_snap = get_one(t, event_ref)
        stock_snaps = {iid: get_one(t, stock_refs[iid]) for iid in ids}
        movement_snaps = {iid: get_one(t, movement_refs[iid]) for iid in ids}
        if event_snap and event_snap.exists:
            return False
        if any(m and m.exists for m in movement_snaps.values()):
            raise RuntimeError(f"Há saída de estoque incompleta para pedido {order_id}; não dupliquei movimentações.")
        missing = [iid for iid, snap in stock_snaps.items() if not snap or not snap.exists]
        if missing:
            raise RuntimeError(f"Itens de estoque ausentes no consumo do pedido {order_id}: {missing}")

        current = {iid: dict(stock_snaps[iid].to_dict() or {}) for iid in ids}
        # Chama a rotina transacional já existente para somar saídas nos agregados.
        # Em seguida, só fazemos escritas (não há leituras após esta chamada).
        agregados_service.registrar_saidas_tx(
            t, restaurant_id, consumption, ref_time=closed_at, evento_id=event_id
        )
        for iid in ids:
            qty = round_qty(consumption[iid])
            stock = current[iid]
            old_qty = float(stock.get("quantidadeAtual", 0) or 0)
            new_qty = round_qty(old_qty - qty)
            unit_cost = float(stock.get("custoMedio", 0) or 0)
            movement = {
                "tipo": "saida", "itemId": iid,
                "itemNome": stock.get("nome", iid),
                "unidade": stock.get("unidade", "unidade"),
                "qtd": qty, "saldoApos": new_qty,
                "custoUnitario": unit_cost, "custoTotal": money(qty * unit_cost),
                "observacao": (
                    "Consumo estimado demonstrativo — ficha técnica ausente ou quantidade fora de escala"
                    if estimated else "Consumo por ficha técnica — venda demonstrativa"
                ),
                "pedidoId": order_id, "usuarioId": "seed-demo-full", "restaurantId": restaurant_id,
                "dadosDemo": True, "demoBatchId": batch_id,
                "consumoEstimado": estimated, "createdAt": closed_at, "updatedAt": closed_at,
            }
            t.update(stock_refs[iid], {"quantidadeAtual": new_qty, "updatedAt": now_utc()})
            t.set(movement_refs[iid], movement)
        return True

    return _write(db.transaction())


def list_batch_docs(db, restaurant_id: str, kind: str, batch_id: str) -> list[Any]:
    col = db.collection(f"restaurantes/{restaurant_id}/data/{kind}/items")
    return list(col.where("demoBatchId", "==", batch_id).stream())


def cleanup_expense(db, restaurant_id: str, expense_snap, batch_id: str) -> bool:
    expense_id = expense_snap.id
    expense_ref = ref_doc(db, restaurant_id, "despesas", expense_id)
    original_event_ref = ref_doc(db, restaurant_id, "eventos_agregados", f"demo-compra-despesa:{expense_id}")

    @transactional
    def _delete(t) -> bool:
        snap = get_one(t, expense_ref)
        if not snap or not snap.exists:
            return False
        expense = snap.to_dict() or {}
        if not expense.get("dadosDemo") or expense.get("demoBatchId") != batch_id:
            return False
        agregados_service.ajustar_despesa_tx(
            t, restaurant_id, expense, None, evento_id=f"demo-limpeza-despesa:{expense_id}"
        )
        t.delete(expense_ref)
        t.delete(original_event_ref)
        return True

    return _delete(db.transaction())


def cleanup_order(db, restaurant_id: str, order_snap, batch_id: str,
                  out_movements: list[Any]) -> bool:
    order_id = order_snap.id
    order_ref = ref_doc(db, restaurant_id, "pedidos", order_id)
    closed = (order_snap.to_dict() or {}).get("fechadoEm")
    if not isinstance(closed, datetime):
        if hasattr(closed, "ToDatetime"):
            closed = closed.ToDatetime().replace(tzinfo=timezone.utc)
        else:
            raise RuntimeError(f"Pedido demo {order_id} não possui fechadoEm; limpeza cancelada.")
    if closed.tzinfo is None:
        closed = closed.replace(tzinfo=timezone.utc)
    local = closed.astimezone(TZ)
    day_key, month_key, hour_key = local.strftime("%Y-%m-%d"), local.strftime("%Y-%m"), local.strftime("%H")
    agg_refs = agregados_service._refs(restaurant_id, day_key, month_key)
    sale_event_ref = ref_doc(db, restaurant_id, "eventos_agregados", f"venda:{order_id}")
    out_event_ref = ref_doc(db, restaurant_id, "eventos_agregados", f"demo-saidas:{order_id}")
    output_ids = [m.id for m in out_movements]
    output_refs = [ref_doc(db, restaurant_id, "movimentacoes_estoque", mid) for mid in output_ids]

    @transactional
    def _delete(t) -> bool:
        order_doc = get_one(t, order_ref)
        sale_event = get_one(t, sale_event_ref)
        out_event = get_one(t, out_event_ref)
        agg_snaps = [get_one(t, ref) for ref in agg_refs]
        movement_snaps = [get_one(t, ref) for ref in output_refs]
        if not order_doc or not order_doc.exists:
            return False
        order = order_doc.to_dict() or {}
        if not order.get("dadosDemo") or order.get("demoBatchId") != batch_id:
            return False
        if not sale_event or not sale_event.exists or any(not s or not s.exists for s in agg_snaps):
            raise RuntimeError(f"Agregados/evento de venda ausentes para {order_id}; não removi o pedido.")
        has_outputs = bool(out_movements)
        if has_outputs and (not out_event or not out_event.exists):
            raise RuntimeError(f"Evento de saída ausente para {order_id}; não removi o pedido.")

        total = money(order.get("total", 0))
        increments: dict[str, Any] = {
            "faturamento": Increment(-total), "totalPedidos": Increment(-1),
            f"vendasPorHora.{hour_key}": Increment(-total), "restaurantId": restaurant_id,
        }
        for payment in order.get("pagamentos", []):
            method = payment.get("tipo", "outros")
            key = f"vendasPorFormaPagamento.{method}"
            increments[key] = Increment(money(increments[key].value - money(payment.get("valor", 0))) if key in increments else -money(payment.get("valor", 0)))
        for item in order.get("itens", []):
            pid = item.get("produtoId")
            if pid and item.get("status") != "cancelado":
                key = f"topProdutos.{pid}"
                increments[key] = Increment(increments[key].value - int(item.get("qtd", 1)) if key in increments else -int(item.get("qtd", 1)))
        for movement_snap in movement_snaps:
            if movement_snap and movement_snap.exists:
                mv = movement_snap.to_dict() or {}
                iid = mv.get("itemId")
                qty = float(mv.get("qtd", 0) or 0)
                if iid and qty:
                    key = f"saidasPorItem.{iid}"
                    increments[key] = Increment(increments[key].value - qty if key in increments else -qty)

        for ref in agg_refs:
            t.update(ref, increments)
        t.delete(sale_event_ref)
        if has_outputs:
            t.delete(out_event_ref)
        for ref in output_refs:
            t.delete(ref)
        t.delete(order_ref)
        return True

    return _delete(db.transaction())


def cleanup_batch(db, restaurant_id: str, batch_id: str) -> None:
    orders = list_batch_docs(db, restaurant_id, "pedidos", batch_id)
    expenses = list_batch_docs(db, restaurant_id, "despesas", batch_id)
    movements = list_batch_docs(db, restaurant_id, "movimentacoes_estoque", batch_id)
    outs_by_order: dict[str, list[Any]] = defaultdict(list)
    for snap in movements:
        row = snap.to_dict() or {}
        if row.get("tipo") == "saida" and row.get("pedidoId"):
            outs_by_order[str(row["pedidoId"])].append(snap)

    print(f"Lote {batch_id}: {len(orders)} pedidos, {len(expenses)} despesas de compra, {len(movements)} movimentações de estoque.")

    # Verificação ANTES de apagar qualquer pedido/despesa. Se houve movimento real
    # depois da demonstração, interrompe para não deixar o lote parcialmente limpo.
    backup_col = db.collection(f"restaurantes/{restaurant_id}/data/demo_stock_backups/items")
    backups = list(backup_col.where("demoBatchId", "==", batch_id).stream())
    demo_items = {str((b.to_dict() or {}).get("itemId")) for b in backups}
    all_movements = list(db.collection(f"restaurantes/{restaurant_id}/data/movimentacoes_estoque/items").stream())
    demo_first_time: dict[str, datetime] = {}
    for snap in movements:
        d = snap.to_dict() or {}
        iid, at = d.get("itemId"), d.get("createdAt")
        if iid in demo_items and isinstance(at, datetime):
            if at.tzinfo is None:
                at = at.replace(tzinfo=timezone.utc)
            demo_first_time[iid] = min(demo_first_time.get(iid, at), at)
    for snap in all_movements:
        d = snap.to_dict() or {}
        iid, at = d.get("itemId"), d.get("createdAt")
        if iid not in demo_items or d.get("demoBatchId") == batch_id or not isinstance(at, datetime):
            continue
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        if iid in demo_first_time and at > demo_first_time[iid]:
            raise RuntimeError(
                f"Limpeza cancelada antes de remover dados: o insumo {iid} tem movimentação não-demo posterior ao início do lote. "
                "Revise o estoque manualmente para não sobrescrever uma movimentação real."
            )

    # Reverte primeiro a receita agregada e remove pedidos marcados deste lote.
    for snap in orders:
        cleanup_order(db, restaurant_id, snap, batch_id, outs_by_order.get(snap.id, []))
    for snap in expenses:
        cleanup_expense(db, restaurant_id, snap, batch_id)

    # Restaurar quantidade/custo originais só depois de os lançamentos demo serem removidos.
    for backup_snap in backups:
        backup = backup_snap.to_dict() or {}
        iid = backup.get("itemId")
        if not iid:
            continue
        stock_ref = ref_doc(db, restaurant_id, "estoque", iid)
        b_ref = backup_ref(db, restaurant_id, batch_id, iid)

        @transactional
        def _restore(t):
            b = get_one(t, b_ref)
            s = get_one(t, stock_ref)
            if not b or not b.exists:
                return
            bd = b.to_dict() or {}
            if bd.get("existedBefore"):
                if not s or not s.exists:
                    raise RuntimeError(f"Estoque original {iid} desapareceu; não consigo restaurar.")
                t.update(stock_ref, {
                    "quantidadeAtual": float(bd.get("originalQuantidadeAtual", 0) or 0),
                    "custoMedio": float(bd.get("originalCustoMedio", 0) or 0),
                    "updatedAt": now_utc(),
                })
            elif s and s.exists:
                t.delete(stock_ref)
            t.delete(b_ref)
        _restore(db.transaction())

    # Remover entradas de compra remanescentes. As saídas foram apagadas junto aos pedidos.
    for snap in list_batch_docs(db, restaurant_id, "movimentacoes_estoque", batch_id):
        row = snap.to_dict() or {}
        if row.get("tipo") == "entrada":
            ref_doc(db, restaurant_id, "movimentacoes_estoque", snap.id).delete()

    print("Limpeza concluída: pedidos, agregados, despesas, movimentos e saldos demo foram revertidos.")


def main() -> int:
    args = parse_args()
    restaurant_id = args.restaurant_id or os.environ.get("DEMO_RESTAURANT_ID")
    if not restaurant_id:
        print("ERRO: informe --restaurant-id SEU_ID ou defina DEMO_RESTAURANT_ID.", file=sys.stderr)
        return 2
    if not 1 <= args.days <= 31 or args.min_orders < 1 or args.max_orders < args.min_orders:
        print("ERRO: --days deve ser 1..31 e o intervalo de pedidos precisa ser válido.", file=sys.stderr)
        return 2
    try:
        start_date = date.fromisoformat(args.start_date)
    except ValueError:
        print("ERRO: --start-date deve estar no formato AAAA-MM-DD.", file=sys.stderr)
        return 2

    batch_id = f"demo-full-v1-week-{start_date.isoformat()}-{args.days}d"
    db = get_db()
    if args.cleanup:
        if not args.apply:
            print(f"SIMULAÇÃO de limpeza: lote {batch_id}. Acrescente --apply para remover.")
            print(f"Pedidos: {len(list_batch_docs(db, restaurant_id, 'pedidos', batch_id))}; despesas: {len(list_batch_docs(db, restaurant_id, 'despesas', batch_id))}; movimentos: {len(list_batch_docs(db, restaurant_id, 'movimentacoes_estoque', batch_id))}.")
            return 0
        cleanup_batch(db, restaurant_id, batch_id)
        return 0

    products = load_products(db, restaurant_id)
    if not products:
        print("ERRO: não encontrei produtos ativos com preço positivo.", file=sys.stderr)
        return 2
    inventory = load_inventory(db, restaurant_id)
    table_ids = load_table_ids(db, restaurant_id)

    # Se a instalação não possui estoque/fichas técnicas, cria um catálogo mínimo
    # de insumos exclusivamente para a demonstração. Não cria produtos de venda.
    has_any_recipe = any(
        any(i.get("itemId") and float(i.get("qtd", 0) or 0) > 0 for i in (p.get("ingredientes") or []))
        for p in products
    )
    if not inventory and not has_any_recipe:
        for iid, name, unit, cost in FALLBACK_STOCK:
            inventory[iid] = {"id": iid, "nome": name, "unidade": unit, "quantidadeAtual": 0.0, "custoMedio": 0.0, "_defaultCost": cost, "_virtual": True}

    inventory_ids = sorted(inventory)
    if not inventory_ids and has_any_recipe:
        recipe_ids = sorted({str(i["itemId"]) for p in products for i in (p.get("ingredientes") or []) if i.get("itemId") and float(i.get("qtd", 0) or 0) > 0})
        for iid in recipe_ids:
            inventory[iid] = {"id": iid, "nome": f"Insumo da receita {iid}", "unidade": "unidade", "quantidadeAtual": 0.0, "custoMedio": 0.0, "_virtual": True}
        inventory_ids = sorted(inventory)

    fallback_stock_ids = {row[0] for row in FALLBACK_STOCK}
    # Não usar insumos criados por este lote como candidatos aleatórios após uma reexecução,
    # exceto o catálogo fallback deliberadamente criado para esse propósito. Isso mantém
    # o conjunto de pedidos/consumo idêntico entre execuções do mesmo lote.
    fallback_candidates = sorted(
        iid for iid, row in inventory.items()
        if row.get("demoBatchId") != batch_id or iid in fallback_stock_ids or not row.get("demoCreated")
    )
    if not fallback_candidates:
        fallback_candidates = list(inventory_ids)

    # Se o lote já foi iniciado, recuperar custo unitário-base do backup para não
    # recalcular preços usando o custo médio já modificado pelas compras da demo.
    for iid in inventory_ids:
        b_snap = backup_ref(db, restaurant_id, batch_id, iid).get()
        if b_snap.exists:
            original_cost = float((b_snap.to_dict() or {}).get("originalCustoMedio", 0) or 0)
            inventory[iid]["custoMedio"] = original_cost
    for iid, _, _, fallback_cost in FALLBACK_STOCK:
        if iid in inventory:
            inventory[iid]["_defaultCost"] = fallback_cost

    # Para produtos sem ficha técnica, atribui consumo estimado reproduzível a 1-2 insumos.
    fallback_map: dict[str, list[tuple[str, float]]] = {}
    if fallback_candidates:
        for idx, product in enumerate(sorted(products, key=lambda p: p["id"])):
            recipe = [i for i in (product.get("ingredientes") or []) if i.get("itemId") and float(i.get("qtd", 0) or 0) > 0]
            if recipe:
                continue
            local_rng = random.Random(args.seed + idx * 7919)
            candidates = list(fallback_candidates)
            local_rng.shuffle(candidates)
            chosen_ids = candidates[:min(2, len(candidates))]
            fallback_map[product["id"]] = [(iid, fallback_rate(inventory[iid].get("unidade", ""))) for iid in chosen_ids]
    else:
        print("ERRO: não há insumos para registrar saídas de estoque e nenhum ingrediente em fichas técnicas.", file=sys.stderr)
        return 2

    # Gere todos os pedidos antes das compras, para calcular consumo esperado por dia.
    orders_by_day: list[list[tuple[str, dict[str, Any], dict[str, float], bool]]] = []
    daily_consumption: list[dict[str, float]] = []
    day_summary: list[tuple[date, int, float]] = []
    order_rng = random.Random(args.seed)
    for offset in range(args.days):
        current_day = start_date + timedelta(days=offset)
        rng = random.Random(args.seed + current_day.toordinal())
        count = rng.randint(args.min_orders, args.max_orders)
        day_orders = []
        consumption_day: dict[str, float] = defaultdict(float)
        sales_total = 0.0
        for number in range(1, count + 1):
            order_id = f"demo_full_{current_day:%Y%m%d}_{number:03d}"
            hour = rng.choices((11, 12, 13, 14, 17, 18, 19, 20, 21), weights=(5, 10, 8, 5, 5, 10, 12, 10, 5), k=1)[0]
            closed_at = datetime.combine(current_day, time(hour, rng.randint(0, 59)), tzinfo=TZ)
            order, consumption, invalid_recipe_estimated = build_order(
                restaurant_id, order_id, closed_at, products, table_ids, rng,
                batch_id, inventory, fallback_map,
            )
            estimated = invalid_recipe_estimated or any(
                not [i for i in (p.get("ingredientes") or [])
                     if i.get("itemId") and float(i.get("qtd", 0) or 0) > 0]
                for p in products
                if any(x.get("produtoId") == p["id"] for x in order["itens"])
            )
            day_orders.append((order_id, order, consumption, estimated))
            for iid, qty in consumption.items():
                consumption_day[iid] += qty
            sales_total += float(order["total"])
        orders_by_day.append(day_orders)
        daily_consumption.append({iid: round_qty(qty) for iid, qty in consumption_day.items()})
        day_summary.append((current_day, count, money(sales_total)))

    used_ids = sorted({iid for day in daily_consumption for iid in day})
    # Cria apenas itens de estoque necessários a receitas referenciadas que estejam faltando.
    for iid in used_ids:
        if iid not in inventory:
            recipe_name = next((i.get("nome") for p in products for i in (p.get("ingredientes") or []) if str(i.get("itemId")) == iid and i.get("nome")), None)
            inventory[iid] = {"id": iid, "nome": recipe_name or f"Insumo da receita {iid}", "unidade": "unidade", "quantidadeAtual": 0.0, "custoMedio": 0.0, "_virtual": True}

    # Compras são determinísticas e suficientes para o consumo gerado, divididas na semana.
    purchase_rng = random.Random(args.seed + 404)
    purchases = plan_purchases(start_date, args.days, inventory, daily_consumption, purchase_rng)
    # Se os preços dos itens virtuais têm custo de referência, aplique-o aos planos.
    for purchase in purchases:
        if inventory[purchase["itemId"]].get("_defaultCost"):
            prng = random.Random(args.seed + int(short_hash(purchase["itemId"]), 16))
            purchase["unitCost"] = money(float(inventory[purchase["itemId"]]["_defaultCost"]) * prng.uniform(0.92, 1.12))

    print(f"Restaurante: {restaurant_id}")
    print(f"Lote: {batch_id}")
    print(f"Período: {start_date.isoformat()} até {(start_date + timedelta(days=args.days - 1)).isoformat()} ({settings.timezone})")
    print(f"Produtos ativos: {len(products)} | Insumos usados: {len(used_ids)} | Mesas disponíveis: {len(table_ids)}")
    print("Pedidos previstos:")
    for day, count, total in day_summary:
        print(f"  {day.isoformat()}: {count:2d} pedidos | {fmt_money(total)}")
    purchase_total = sum(money(p["qtd"] * p["unitCost"]) for p in purchases)
    print(f"Total: {sum(x[1] for x in day_summary)} pedidos | faturamento {fmt_money(sum(x[2] for x in day_summary))}")
    print(f"Compras previstas: {len(purchases)} entradas de estoque | despesas de insumos {fmt_money(purchase_total)}")
    print(f"Saídas previstas: {sum(len(x[2]) for day in orders_by_day for x in day)} registros de consumo de estoque")
    if any("Batata" in str(item.get("nome", "")) and str(item.get("unidade", "")).lower() == "kg" for item in inventory.values()):
        print("Nota: fichas técnicas de itens em kg foram verificadas para evitar confundir gramas com kg.")
    print("Movimentações incluem nome/unidade do insumo para aparecerem no painel lateral do estoque.")

    if not args.apply:
        print("\nSIMULAÇÃO: nada foi gravado. Acrescente --apply para confirmar.")
        if not has_any_recipe:
            print("Nota: os produtos sem ficha técnica terão consumo estimado marcado como demonstrativo.")
        return 0

    # Primeiro preserva o estado de estoque e cria insumos virtuais faltantes.
    for iid in used_ids:
        item = inventory[iid]
        ensure_stock_record(
            db, restaurant_id, batch_id, iid, item.get("nome", iid), item.get("unidade", "unidade"),
            float(item.get("_defaultCost", 0) or item.get("custoMedio", 0) or 0), True, inventory,
        )
    # Processamento cronológico: compras às 09h, vendas entre 11h e 21h.
    timeline: list[tuple[datetime, str, Any]] = []
    midpoint = max(1, args.days // 2) if args.days > 1 else 1
    for p in purchases:
        at = datetime.combine(p["date"], time(9, 0 if p["slot"] == "a" else 20), tzinfo=TZ)
        timeline.append((at, "purchase", p))
    for day_orders in orders_by_day:
        for order_id, order, consumption, estimated in day_orders:
            timeline.append((order["fechadoEm"], "sale", (order_id, order, consumption, estimated)))
    timeline.sort(key=lambda e: (e[0], 0 if e[1] == "purchase" else 1))

    inserted_orders = skipped_orders = created_purchases = skipped_purchases = created_out = skipped_out = 0
    try:
        for _, kind, payload in timeline:
            if kind == "purchase":
                item = inventory[payload["itemId"]]
                if create_purchase(db, restaurant_id, batch_id, payload, item):
                    created_purchases += 1
                else:
                    skipped_purchases += 1
            else:
                order_id, order, consumption, estimated = payload
                if create_order(db, restaurant_id, batch_id, order_id, order):
                    inserted_orders += 1
                else:
                    skipped_orders += 1
                if create_sale_stock_out(db, restaurant_id, batch_id, order_id, order["fechadoEm"], consumption, inventory, estimated):
                    created_out += len(consumption)
                else:
                    skipped_out += len(consumption)
    except Exception as exc:
        print(f"\nERRO durante a gravação: {type(exc).__name__}: {exc}", file=sys.stderr)
        print(f"Lote preservado para diagnóstico/reexecução: {batch_id}", file=sys.stderr)
        print("Não execute --cleanup sem revisar os dados do lote.", file=sys.stderr)
        return 1

    print("\nConcluído:")
    print(f"  Pedidos criados: {inserted_orders}; já existentes ignorados: {skipped_orders}")
    print(f"  Compras/entradas criadas: {created_purchases}; já existentes ignoradas: {skipped_purchases}")
    print(f"  Saídas de estoque criadas: {created_out}; saídas já existentes ignoradas: {skipped_out}")
    print("  Cada compra também gerou uma despesa de insumo e atualizou o agregado financeiro.")
    print("  Os pedidos, movimentos e despesas estão marcados dadosDemo=true e demoBatchId.")
    if not has_any_recipe:
        print("  ATENÇÃO: as saídas de estoque são estimativas demonstrativas, pois não há fichas técnicas.")
    print(f"Para simular a limpeza: python seed_demo_full.py --restaurant-id {restaurant_id} --start-date {start_date.isoformat()} --days {args.days} --cleanup")
    print("Após revisar a prévia de limpeza, acrescente --apply para remover o lote demo e restaurar os saldos originais.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
