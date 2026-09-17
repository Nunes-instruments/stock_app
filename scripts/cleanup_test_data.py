"""One-time cleanup for the development/demo data in the supplied legacy database.

SAFE mode removes only records that are explicitly tied to sample/demo imports or
Manual Test rows. It then recalculates stock from the remaining movement deltas.
It does not run automatically during normal app startup.
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path


def cleanup_database(db_path: Path) -> dict:
    if not db_path.exists():
        return {"database": str(db_path), "skipped": True}

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = db_path.with_name(f"{db_path.stem}_before_test_cleanup_{stamp}{db_path.suffix}")
    shutil.copy2(db_path, backup)

    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    removed_entries = 0
    removed_imports = 0
    removed_products = 0
    try:
        sample_import_ids = [
            row[0]
            for row in con.execute(
                """
                SELECT id FROM import_history
                WHERE lower(coalesce(file_name,'')) LIKE 'sample%'
                   OR lower(coalesce(original_file_name,'')) LIKE 'sample%'
                """
            )
        ]

        where_parts = ["lower(coalesce(source,''))='manual test'", "upper(product_id) LIKE 'TEST%'"]
        params: list[object] = []
        if sample_import_ids:
            marks = ",".join("?" for _ in sample_import_ids)
            where_parts.append(f"import_id IN ({marks})")
            params.extend(sample_import_ids)

        cursor = con.execute(
            f"DELETE FROM stock_entries WHERE {' OR '.join(where_parts)}",
            params,
        )
        removed_entries += cursor.rowcount if cursor.rowcount != -1 else 0

        if sample_import_ids:
            marks = ",".join("?" for _ in sample_import_ids)
            cursor = con.execute(f"DELETE FROM import_history WHERE id IN ({marks})", sample_import_ids)
            removed_imports += cursor.rowcount if cursor.rowcount != -1 else 0

        # Explicit development product, even if an old orphan row remains.
        con.execute("DELETE FROM products WHERE upper(product_id) LIKE 'TEST%'")

        # Rebuild quantities from surviving transaction deltas, not stale demo totals.
        products = [row[0] for row in con.execute("SELECT product_id FROM products")]
        for product_id in products:
            rows = con.execute(
                """
                SELECT id, previous_quantity, new_quantity
                FROM stock_entries
                WHERE product_id=?
                ORDER BY id
                """,
                (product_id,),
            ).fetchall()
            if not rows:
                con.execute("DELETE FROM products WHERE product_id=?", (product_id,))
                removed_products += 1
                continue

            quantity = 0.0
            for row in rows:
                delta = float(row["new_quantity"] or 0) - float(row["previous_quantity"] or 0)
                previous = quantity
                quantity = max(0.0, quantity + delta)
                con.execute(
                    "UPDATE stock_entries SET previous_quantity=?, new_quantity=? WHERE id=?",
                    (previous, quantity, row["id"]),
                )
            con.execute(
                "UPDATE products SET current_quantity=? WHERE product_id=?",
                (quantity, product_id),
            )

        con.commit()
        con.execute("VACUUM")
    finally:
        con.close()

    return {
        "database": str(db_path),
        "backup": str(backup),
        "removed_entries": removed_entries,
        "removed_imports": removed_imports,
        "removed_products_without_real_history": removed_products,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    print(cleanup_database(args.database.resolve()))


if __name__ == "__main__":
    main()
