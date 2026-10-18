#!/usr/bin/env python3
"""Gera ou remove uma semana de vendas sintéticas para demonstrar o PDV Lanchonete.

Salvar em <raiz-do-repositório>/scripts/seed_demo_sales.py e executar de backend:
  python ../scripts/seed_demo_sales.py --restaurant-id SEU_RESTAURANT_ID
  python ../scripts/seed_demo_sales.py --restaurant-id SEU_RESTAURANT_ID --apply

Por segurança, sem --apply o script apenas simula. Usa produtos ativos já
cadastrados; não cria produtos, não modifica estoque e não altera sessões de caixa.
Cada pedido e seus agregados diário/mensal são gravados numa transação. IDs
estáveis impedem duplicidade se a mesma semana for semeada novamente.
Para desfazer somente esse lote, use os mesmos --start-date/--days com --cleanup;
revise a prévia e passe --apply para excluir os pedidos de demonstração e reverter
seus incrementos nos agregados. Nunca remove pedidos sem a marca dadosDemo.
"""
from __future__ import annotations

import argparse
import os
import random
import sys
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

# O arquivo fica em <raiz-do-repositório>/scripts; o pacote Python fica em backend/app.
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from google.cloud.firestore import transactional  # noqa: E402
from google.cloud.firestore_v1.transforms import Increment  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.firebase import get_db  # noqa: E402
from app.services import agregados_service  # noqa: E402

TZ = ZoneInfo(settings.timezone)
PAYMENT_METHODS = ("pix", "dinheiro", "credito", "debito")


def money(value: Any) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def parse_args() -> argparse.Namespace:
    today = datetime.now(TZ).date()
    parser = argparse.ArgumentParser(
        description="Gera 7 dias de vendas demonstrativas (5 a 15 pedidos por dia)."
    )
    parser.add_argument(
        "--restaurant-id",
        default=None,
        help="ID do restaurante no Firestore. Também aceita DEMO_RESTAURANT_ID.",
    )
    parser.add_argument(
        "--start-date",
        default=(today - timedelta(days=6)).isoformat(),
        help="Primeiro dia local, formato AAAA-MM-DD (padrão: seis dias antes de hoje).",
    )
    parser.add_argument("--days", type=int, default=7, help="Quantidade de dias (padrão: 7).")
    parser.add_argument("--min-orders", type=int, default=5, help="Mínimo de pedidos por dia (padrão: 5).")
    parser.add_argument("--max-orders", type=int, default=15, help="Máximo de pedidos por dia (padrão: 15).")
    parser.add_argument("--seed", type=int, default=20261018, help="Semente para resultados reproduzíveis.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Confirma gravações ou exclusões. Sem esta opção, apenas simula.",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Em vez de semear, desfaz o lote demo correspondente ao período.",
    )
    return parser.parse_args()


def load_products(db, restaurant_id: str) -> list[dict[str, Any]]:
    col = db.collection(f"restaurantes/{restaurant_id}/data/produtos/items")
    products: list[dict[str, Any]] = []
    for snap in col.stream():
        product = snap.to_dict() or {}
        product["id"] = snap.id
        if product.get("ativo", True) and money(product.get("preco", 0)) > 0:
            product["preco"] = money(product["preco"])
            variations = [
                v for v in (product.get("variacoes") or [])
                if v.get("ativo", True)
            ]
            product["_variacoes_ativas"] = variations
            products.append(product)
    return products


def load_table_ids(db, restaurant_id: str) -> list[str]:
    col = db.collection(f"restaurantes/{restaurant_id}/data/mesas/items")
    ids: list[str] = []
    for snap in col.stream():
        data = snap.to_dict() or {}
        if data.get("status", "livre") not in {"inativa", "reservada"}:
            ids.append(snap.id)
    return ids


def build_order(
    *,
    restaurant_id: str,
    order_id: str,
    closed_at: datetime,
    products: list[dict[str, Any]],
    table_ids: list[str],
    rng: random.Random,
    batch_id: str,
) -> dict[str, Any]:
    max_lines = min(4, len(products))
    line_count = rng.randint(1, max_lines)
    chosen = rng.sample(products, k=line_count)
    items: list[dict[str, Any]] = []

    for index, product in enumerate(chosen, start=1):
        variation_id = None
        price = money(product["preco"])
        variations = product.get("_variacoes_ativas") or []
        if variations and rng.random() < 0.35:
            variation = rng.choice(variations)
            variation_id = variation.get("id")
            price = money(price + float(variation.get("precoAdicional", 0) or 0))

        item: dict[str, Any] = {
            "id": f"{order_id}_item_{index:02d}",
            "produtoId": product["id"],
            "qtd": rng.randint(1, 3),
            "precoUnitario": price,
            # Os pedidos são históricos já concluídos, então não entram na cozinha.
            "status": "entregue",
        }
        if variation_id:
            item["variacaoId"] = variation_id
        items.append(item)

    total = money(sum(Decimal(str(item["qtd"])) * Decimal(str(item["precoUnitario"])) for item in items))
    payment_type = rng.choices(PAYMENT_METHODS, weights=(45, 20, 20, 15), k=1)[0]
    payment = {
        "id": f"{order_id}_pag_01",
        "tipo": payment_type,
        "valor": total,
        "criadoEm": closed_at,
    }

    if table_ids:
        table_id = rng.choice(table_ids)
        order_type = "local"
    else:
        # Em instalações sem mesas, o pedido é identificado como balcão.
        table_id = "balcao-demo"
        order_type = "balcao"

    created_at = closed_at - timedelta(minutes=rng.randint(5, 45))
    return {
        "mesaId": table_id,
        "tipo": order_type,
        "status": "pago",
        "itens": items,
        "total": total,
        "pagamentos": [payment],
        "usuarioId": "seed-demo-sales",
        "restaurantId": restaurant_id,
        "createdAt": created_at,
        "updatedAt": closed_at,
        "fechadoEm": closed_at,
        "dadosDemo": True,
        "demoBatchId": batch_id,
    }


def insert_order(db, restaurant_id: str, order_id: str, order: dict[str, Any]) -> bool:
    """Cria pedido e agregados diário/mensal atomicamente; seguro para reexecução."""
    order_ref = db.document(
        f"restaurantes/{restaurant_id}/data/pedidos/items/{order_id}"
    )
    closed_at = order["fechadoEm"]
    event_id = f"demo-venda:{order_id}"

    @transactional
    def _write(transaction) -> bool:
        existing = next(iter(transaction.get(order_ref)), None)
        if existing and existing.exists:
            return False

        # O serviço faz as leituras dos docs de evento/agregado antes de escrever.
        agregados_service.registrar_venda_tx(
            transaction,
            restaurant_id,
            order,
            order.get("pagamentos", []),
            fechado_em=closed_at,
            evento_id=event_id,
        )
        transaction.set(order_ref, order)
        return True

    return _write(db.transaction())


def cleanup_order(db, restaurant_id: str, order_id: str, batch_id: str) -> bool:
    """Remove somente pedido tagged do lote e reverte seus agregados atomicamente."""
    order_ref = db.document(
        f"restaurantes/{restaurant_id}/data/pedidos/items/{order_id}"
    )
    event_id = f"demo-venda:{order_id}"
    event_ref = db.document(
        f"restaurantes/{restaurant_id}/data/eventos_agregados/items/{event_id}"
    )

    @transactional
    def _delete(transaction) -> bool:
        order_snap = next(iter(transaction.get(order_ref)), None)
        if not order_snap or not order_snap.exists:
            return False
        order = order_snap.to_dict() or {}
        # Dupla verificação para evitar tocar em pedido real ou de outro lote.
        if not order.get("dadosDemo") or order.get("demoBatchId") != batch_id:
            return False

        event_snap = next(iter(transaction.get(event_ref)), None)
        if not event_snap or not event_snap.exists:
            raise RuntimeError(
                f"O pedido {order_id} está marcado como demo, mas o evento de agregado "
                "não existe. Não removi nada para evitar divergência financeira."
            )

        closed_at = order.get("fechadoEm")
        if not isinstance(closed_at, datetime):
            if hasattr(closed_at, "ToDatetime"):
                closed_at = closed_at.ToDatetime().replace(tzinfo=ZoneInfo("UTC"))
            else:
                raise RuntimeError(f"Pedido demo {order_id} não tem fechadoEm válido.")
        if closed_at.tzinfo is None:
            closed_at = closed_at.replace(tzinfo=ZoneInfo("UTC"))
        local = closed_at.astimezone(TZ)
        day_key, month_key, hour_key = (
            local.strftime("%Y-%m-%d"),
            local.strftime("%Y-%m"),
            local.strftime("%H"),
        )
        aggregate_refs = agregados_service._refs(restaurant_id, day_key, month_key)
        aggregate_snaps = [next(iter(transaction.get(ref)), None) for ref in aggregate_refs]
        if any(not snap or not snap.exists for snap in aggregate_snaps):
            raise RuntimeError(
                f"Os agregados diário/mensal do pedido {order_id} estão ausentes. "
                "Não removi nada para evitar divergência financeira."
            )

        total = money(order.get("total", 0))
        increments: dict[str, Any] = {
            "faturamento": Increment(-total),
            "totalPedidos": Increment(-1),
            f"vendasPorHora.{hour_key}": Increment(-total),
            "restaurantId": restaurant_id,
        }
        payment_totals: dict[str, float] = {}
        for payment in order.get("pagamentos", []):
            method = payment.get("tipo", "outros")
            key = f"vendasPorFormaPagamento.{method}"
            payment_totals[key] = payment_totals.get(key, 0.0) + money(
                payment.get("valor", 0)
            )
        for key, value in payment_totals.items():
            increments[key] = Increment(-money(value))

        product_totals: dict[str, int] = {}
        for item in order.get("itens", []):
            product_id = item.get("produtoId")
            if product_id and item.get("status") != "cancelado":
                key = f"topProdutos.{product_id}"
                product_totals[key] = product_totals.get(key, 0) + int(
                    item.get("qtd", 1)
                )
        for key, quantity in product_totals.items():
            increments[key] = Increment(-quantity)

        # Todas as leituras já ocorreram; agora apenas escritas.
        for ref in aggregate_refs:
            transaction.update(ref, increments)
        transaction.delete(event_ref)
        transaction.delete(order_ref)
        return True

    return _delete(db.transaction())


def cleanup_batch(db, restaurant_id: str, batch_id: str, apply: bool) -> int:
    """Prévia/exclusão limitada a pedidos que pertencem ao batch ID informado."""
    orders_col = db.collection(
        f"restaurantes/{restaurant_id}/data/pedidos/items"
    )
    demo_orders = list(orders_col.where("demoBatchId", "==", batch_id).stream())
    print(f"Lote: {batch_id}")
    print(f"Pedidos de demonstração encontrados: {len(demo_orders)}")
    if not apply:
        print("SIMULAÇÃO: nada foi excluído. Acrescente --apply para confirmar a limpeza.")
        return 0

    deleted = 0
    for snap in demo_orders:
        if cleanup_order(db, restaurant_id, snap.id, batch_id):
            deleted += 1
    print(f"Limpeza concluída: {deleted} pedidos de demonstração removidos; agregados revertidos.")
    return deleted


def main() -> int:
    args = parse_args()
    restaurant_id = args.restaurant_id or os.environ.get("DEMO_RESTAURANT_ID")
    if not restaurant_id:
        print(
            "ERRO: informe --restaurant-id SEU_ID ou defina DEMO_RESTAURANT_ID. "
            "O script não escolhe um restaurante automaticamente.",
            file=sys.stderr,
        )
        return 2
    if not 1 <= args.days <= 31:
        print("ERRO: --days deve estar entre 1 e 31.", file=sys.stderr)
        return 2
    if args.min_orders < 1 or args.max_orders < args.min_orders:
        print("ERRO: intervalo de pedidos inválido.", file=sys.stderr)
        return 2

    try:
        start_date = date.fromisoformat(args.start_date)
    except ValueError:
        print("ERRO: --start-date deve estar no formato AAAA-MM-DD.", file=sys.stderr)
        return 2

    batch_id = f"demo-week-{start_date.isoformat()}-{args.days}d"
    db = get_db()
    if args.cleanup:
        cleanup_batch(db, restaurant_id, batch_id, args.apply)
        return 0

    products = load_products(db, restaurant_id)
    if len(products) < 3:
        print(
            f"ERRO: encontrei apenas {len(products)} produtos ativos com preço positivo. "
            "Cadastre pelo menos 3 produtos ativos antes de gerar a demonstração.",
            file=sys.stderr,
        )
        return 2
    table_ids = load_table_ids(db, restaurant_id)

    plans: list[tuple[str, dict[str, Any]]] = []
    day_counts: list[tuple[date, int, float]] = []
    for day_offset in range(args.days):
        current_day = start_date + timedelta(days=day_offset)
        rng = random.Random(args.seed + current_day.toordinal())
        count = rng.randint(args.min_orders, args.max_orders)
        daily_total = 0.0

        for order_number in range(1, count + 1):
            order_id = f"demo_{current_day:%Y%m%d}_{order_number:03d}"
            # Horários variados dentro do horário de funcionamento típico.
            hour = rng.choices((11, 12, 13, 14, 17, 18, 19, 20, 21), weights=(5, 10, 8, 5, 5, 10, 12, 10, 5), k=1)[0]
            minute = rng.randint(0, 59)
            closed_at = datetime.combine(current_day, time(hour, minute), tzinfo=TZ)
            order = build_order(
                restaurant_id=restaurant_id,
                order_id=order_id,
                closed_at=closed_at,
                products=products,
                table_ids=table_ids,
                rng=rng,
                batch_id=batch_id,
            )
            plans.append((order_id, order))
            daily_total += float(order["total"])
        day_counts.append((current_day, count, money(daily_total)))

    print(f"Restaurante: {restaurant_id}")
    print(f"Período local: {start_date.isoformat()} até {(start_date + timedelta(days=args.days - 1)).isoformat()} ({settings.timezone})")
    print(f"Produtos ativos: {len(products)} | Mesas utilizáveis: {len(table_ids)}")
    print("Resumo planejado:")
    for day, count, total in day_counts:
        print(f"  {day.isoformat()}: {count:2d} pedidos | faturamento sintético previsto R$ {total:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))
    print(f"Total planejado: {len(plans)} pedidos | R$ {sum(x[2] for x in day_counts):,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))

    if not args.apply:
        print("\nSIMULAÇÃO: nada foi gravado. Revise o período e execute novamente com --apply para confirmar.")
        return 0

    inserted = 0
    skipped = 0
    for order_id, order in plans:
        if insert_order(db, restaurant_id, order_id, order):
            inserted += 1
        else:
            skipped += 1

    print(f"\nConcluído: {inserted} pedidos criados; {skipped} já existiam e foram ignorados.")
    print("Os pedidos e agregados diário/mensal foram gravados. O estoque e as sessões de caixa não foram modificados.")
    print("Os dados estão marcados com dadosDemo=true e IDs iniciados por demo_. Não confunda essas vendas sintéticas com vendas reais.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
