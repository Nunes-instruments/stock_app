from __future__ import annotations

import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from runtime_paths import BACKUP_DIR, DB_DIR, DATA_DIR, STORAGE_CATEGORIES_FILE, ensure_runtime_dirs


def sqlite_backup(source: Path, target: Path) -> None:
    source_conn = sqlite3.connect(str(source))
    try:
        target_conn = sqlite3.connect(str(target))
        try:
            source_conn.backup(target_conn)
        finally:
            target_conn.close()
    finally:
        source_conn.close()


def create_backup() -> Path:
    ensure_runtime_dirs()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    folder = BACKUP_DIR / stamp
    folder.mkdir(parents=True, exist_ok=False)

    for db_file in DB_DIR.glob("*.db"):
        sqlite_backup(db_file, folder / db_file.name)

    if STORAGE_CATEGORIES_FILE.exists():
        shutil.copy2(STORAGE_CATEGORIES_FILE, folder / STORAGE_CATEGORIES_FILE.name)

    manifest = folder / "BACKUP_INFO.txt"
    manifest.write_text(
        f"NUNES Stock backup\nCreated: {datetime.now().isoformat(timespec='seconds')}\nData root: {DATA_DIR}\n",
        encoding="utf-8",
    )
    print(folder)
    return folder


if __name__ == "__main__":
    create_backup()
