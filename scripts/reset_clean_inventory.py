"""Reset NUNES Stock to a clean inventory while preserving a recovery backup.

This is intentionally run only by the v2.4 clean-setup BAT. It backs up the
entire mutable data folder first, then clears old inventory/history/storage
sources so the new Rack/Shelf movement workflow starts from zero.
"""
from __future__ import annotations

import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from database import BRANCHES, get_database_path
from runtime_paths import DATA_DIR, ensure_runtime_dirs


def _backup_data() -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_root = DATA_DIR.parent / "clean_reset_backups"
    backup_root.mkdir(parents=True, exist_ok=True)
    target = backup_root / f"before_v2_4_clean_{stamp}"
    if DATA_DIR.exists():
        shutil.copytree(DATA_DIR, target / "data")
    else:
        (target / "data").mkdir(parents=True, exist_ok=True)
    return target


def _table_exists(con: sqlite3.Connection, name: str) -> bool:
    row = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    return bool(row)


def _reset_database(path: Path) -> dict:
    if not path.exists():
        return {"database": str(path), "status": "missing"}

    con = sqlite3.connect(str(path))
    con.execute("PRAGMA foreign_keys=OFF")
    cleared = []
    try:
        con.execute("BEGIN")
        # Child/detail tables first, then product master.
        for table in (
            "product_storage_map",
            "storage_allocations",
            "stock_entries",
            "import_errors",
            "import_history",
            "storage_shelves",
            "storage_racks",
            "products",
        ):
            if _table_exists(con, table):
                con.execute(f'DELETE FROM "{table}"')
                cleared.append(table)

        if _table_exists(con, "sqlite_sequence"):
            marks = ",".join("?" for _ in cleared)
            if marks:
                con.execute(
                    f"DELETE FROM sqlite_sequence WHERE name IN ({marks})",
                    cleared,
                )
        con.commit()
        con.execute("VACUUM")
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

    return {"database": str(path), "status": "cleared", "tables": cleared}


def _clear_runtime_sources() -> list[str]:
    cleared = []
    for name in (
        "storage_view_sources",
        "rack_shelf",
        "uploads",
        "processed",
        "exports",
    ):
        path = DATA_DIR / name
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
            cleared.append(str(path))

    # Recreate required runtime directories. Settings, categories, secret key,
    # cache and the backup tree are deliberately retained.
    ensure_runtime_dirs()
    return cleared


def main() -> int:
    backup = _backup_data()
    print(f"[BACKUP] Old data preserved at: {backup}")

    results = []
    for branch_key in BRANCHES:
        results.append(_reset_database(Path(get_database_path(branch_key))))

    cleared_sources = _clear_runtime_sources()

    print("[CLEAN] Old inventory/history/storage data cleared.")
    for result in results:
        print(result)
    for path in cleared_sources:
        print(f"[CLEAN] {path}")
    print("[READY] Inventory starts from zero. New movements now drive Rack/Shelf totals.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
