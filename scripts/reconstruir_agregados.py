"""Reconstrói agregados (dia/mês) a partir do histórico de produção.

Padrão: DRY-RUN — mostra o plano e NÃO escreve nada.
Escrita exige os DOIS comandos:
    python scripts/reconstruir_agregados.py --restaurante <id> --apply
e a confirmação digitando RECONSTRUIR no terminal.

Credencial: ARQUIVO local scripts/service-account.json (mesma resolução do backend).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BK / "backend"))

from app.services import backfill_service  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--restaurante", required=True, help="ID do tenant (ex.: demo_123)")
    p.add_argument("--apply", action="store_true", help="APLICA de verdade (derruba dry-run)")
    args = p.parse_args()

    if not args.apply:
        print("== DRY-RUN (nada será escrito) ==")
    else:
        resp = input("Isso RENOverá/sobrescreverá agregados. Digite RECONSTRUIR para confirmar: ")
        if resp.strip() != "RECONSTRUIR":
            print("Confirmação recusada — nada foi escrito.")
            return 1

    out = backfill_service.reconstruir(args.restaurante, apply=args.apply)

    if out.get("aviso"):
        print(f"{out['aviso']}")
        return 0
    print(f"pedidos considerados : {out['pedidosConsiderados']}")
    print(f"despesas consideradas: {out['despesasConsideradas']}")
    print(f"saídas consideradas  : {out['saidasConsideradas']}")
    print(f"dias                 : {', '.join(out['dias']) or '—'}")
    print(f"meses                : {', '.join(out['meses']) or '—'}")
    total = len(out["dias"]) + len(out["meses"])
    print(("APLICADO  " if out["aplicado"] else "PLANEJADO ") + f"({total} docs{' + cobertura' if out['aplicado'] else ''}) | agregadoDesde={out.get('agregadoDesde')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
