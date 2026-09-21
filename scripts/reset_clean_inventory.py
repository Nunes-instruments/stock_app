"""Force-reset the live NUNES Stock inventory to zero, with recovery backup.

v2.4.3 behavior:
- Back up the entire live mutable data folder first.
- Remove live SQLite database files completely (including WAL/SHM companions).
- Remove runtime storage/import/export/cache sources that can make old stock reappear.
- Recreate fresh empty branch databases from the current schema.
- Verify Products, Stock Entries, Imports and Rack/Shelf allocations are all zero.

Configuration such as storage_categories.json and the Flask secret are retained.
This script is intended to run only while the NUNES Stock server is stopped.
"""
from __future__ import annotations

import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# When executed directly as scripts\reset_clean_inventory.py, Python adds only
# the scripts folder to sys.path. Add the application root explicitly so imports
# such as `database` and `runtime_paths` always work on Windows.
APP_DIR = Path(__file__).resolve().parents[1]
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from database import BRANCHES, get_database_path, init_all_branch_databases
from runtime_paths import DATA_DIR, DB_DIR, ensure_runtime_dirs


ZERO_TABLES = (
    "products",
    "stock_entries",
    "import_history",
    "import_errors",
    "storage_allocations",
    "storage_racks",
    "storage_shelves",
    "product_storage_map",
)


def _backup_data() -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_root = DATA_DIR.parent / "clean_reset_backups"
    backup_root.mkdir(parents=True, exist_ok=True)
    target = backup_root / f"before_v2_4_3_clean_{stamp}"
    target.mkdir(parents=True, exist_ok=False)

    if DATA_DIR.exists():
        shutil.copytree(DATA_DIR, target / "data", dirs_exist_ok=True)
    else:
        (target / "data").mkdir(parents=True, exist_ok=True)

    return target


def _remove_live_databases() -> list[str]:
    removed: list[str] = []
    DB_DIR.mkdir(parents=True, exist_ok=True)

    known = {Path(get_database_path(key)).resolve() for key in BRANCHES}
    # Also remove SQLite sidecar files belonging to configured branch databases.
    candidates = set(known)
    for db_path in known:
        candidates.add(Path(str(db_path) + "-wal"))
        candidates.add(Path(str(db_path) + "-shm"))
        candidates.add(Path(str(db_path) + "-journal"))

    for path in sorted(candidates, key=lambda p: str(p).lower()):
        if path.exists() and path.is_file():
            path.unlink()
            removed.append(str(path))

    return removed


def _clear_runtime_sources() -> list[str]:
    cleared: list[str] = []
    # These folders contain generated/imported inventory views or cached outputs.
    for name in (
        "storage_view_sources",
        "rack_shelf",
        "uploads",
        "processed",
        "exports",
        "cache",
    ):
        path = DATA_DIR / name
        if path.exists():
            shutil.rmtree(path, ignore_errors=False)
            cleared.append(str(path))

    # A stale PID must never make the next start attach to an old process.
    pid_file = DATA_DIR / "server.pid"
    if pid_file.exists():
        pid_file.unlink()
        cleared.append(str(pid_file))

    ensure_runtime_dirs()
    return cleared


def _table_count(con: sqlite3.Connection, table: str) -> int:
    exists = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    if not exists:
        return 0
    return int(con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] or 0)


def _verify_zero() -> dict[str, dict[str, int]]:
    results: dict[str, dict[str, int]] = {}
    failures: list[str] = []

    for branch_key in BRANCHES:
        db_path = Path(get_database_path(branch_key))
        if not db_path.exists():
            failures.append(f"{branch_key}: database was not recreated: {db_path}")
            continue

        con = sqlite3.connect(str(db_path))
        try:
            counts = {table: _table_count(con, table) for table in ZERO_TABLES}
        finally:
            con.close()

        results[branch_key] = counts
        nonzero = {name: value for name, value in counts.items() if value != 0}
        if nonzero:
            failures.append(f"{branch_key}: non-zero live rows remain: {nonzero}")

    if failures:
        raise RuntimeError("Live reset verification failed: " + " | ".join(failures))

    return results


def main() -> int:
    backup = _backup_data()
    print(f"[BACKUP] Previous live data preserved at: {backup}")

    removed_databases = _remove_live_databases()
    cleared_sources = _clear_runtime_sources()

    # Recreate brand-new empty databases from the current v2.4.3 schema.
    init_all_branch_databases()
    verification = _verify_zero()

    print("[CLEAN] Previous live inventory/history/storage data removed from active use.")
    for path in removed_databases:
        print(f"[CLEAN DB] {path}")
    for path in cleared_sources:
        print(f"[CLEAN DATA] {path}")
    for branch, counts in verification.items():
        print(f"[ZERO] {branch}: {counts}")

    print("[PASS] Active inventory is zero. New Rack/Shelf movements are now the source of truth.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
