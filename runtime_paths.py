"""Persistent runtime paths for NUNES Stock.

Application source code can be replaced/updated from GitHub. Mutable business data
is kept outside the source tree so a code update cannot overwrite stock records.
"""
from __future__ import annotations

import os
import shutil
import secrets
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent


def _default_data_root() -> Path:
    override = os.environ.get("NUNES_STOCK_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    if os.name == "nt":
        program_data = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
        return Path(program_data) / "NunesStock" / "data"
    return APP_DIR / "data"


DATA_DIR = _default_data_root()
DB_DIR = DATA_DIR / "db"
UPLOAD_DIR = DATA_DIR / "uploads"
PROCESSED_DIR = DATA_DIR / "processed"
EXPORT_DIR = DATA_DIR / "exports"
BACKUP_DIR = DATA_DIR / "backups"
CACHE_DIR = DATA_DIR / "cache"
AUTO_IMAGE_DIR = DATA_DIR / "product_images" / "auto"
STORAGE_CATEGORIES_FILE = DATA_DIR / "storage_categories.json"
SECRET_KEY_FILE = DATA_DIR / ".flask_secret"
MIGRATION_MARKER = DATA_DIR / ".legacy_migration_v2_done"


def ensure_runtime_dirs() -> None:
    for folder in (
        DATA_DIR,
        DB_DIR,
        UPLOAD_DIR,
        PROCESSED_DIR,
        EXPORT_DIR,
        BACKUP_DIR,
        CACHE_DIR,
        AUTO_IMAGE_DIR,
    ):
        folder.mkdir(parents=True, exist_ok=True)


def _copy_if_missing(source: Path, target: Path) -> None:
    if source.exists() and not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def migrate_legacy_data_once() -> list[str]:
    """Copy legacy mutable files out of the app folder once, without deleting source.

    Copy-not-move is intentional: if anything goes wrong the old folder remains a
    recovery copy. Existing persistent files always win.
    """
    ensure_runtime_dirs()
    if MIGRATION_MARKER.exists():
        return []

    copied: list[str] = []
    legacy_db_names = ("stock.db", "stock_gandhipuram.db", "stock_gobalapuram.db")
    for name in legacy_db_names:
        source = APP_DIR / name
        target = DB_DIR / name
        if source.exists() and not target.exists():
            _copy_if_missing(source, target)
            copied.append(name)

    for pattern in ("Master_Stock*.xlsx",):
        for source in APP_DIR.glob(pattern):
            target = EXPORT_DIR / source.name
            if not target.exists():
                _copy_if_missing(source, target)
                copied.append(source.name)

    for folder_name, target_dir in (("uploads", UPLOAD_DIR), ("processed", PROCESSED_DIR)):
        legacy_dir = APP_DIR / folder_name
        if legacy_dir.exists():
            for source in legacy_dir.iterdir():
                if source.is_file():
                    target = target_dir / source.name
                    if not target.exists():
                        _copy_if_missing(source, target)
                        copied.append(f"{folder_name}/{source.name}")

    legacy_categories = APP_DIR / "storage_categories.json"
    if legacy_categories.exists() and not STORAGE_CATEGORIES_FILE.exists():
        _copy_if_missing(legacy_categories, STORAGE_CATEGORIES_FILE)
        copied.append("storage_categories.json")

    legacy_auto = APP_DIR / "static" / "product_images" / "auto"
    if legacy_auto.exists():
        for source in legacy_auto.iterdir():
            if source.is_file():
                target = AUTO_IMAGE_DIR / source.name
                if not target.exists():
                    _copy_if_missing(source, target)
                    copied.append(f"product_images/auto/{source.name}")

    MIGRATION_MARKER.write_text("legacy mutable data copied to persistent runtime\n", encoding="utf-8")
    return copied


def get_flask_secret_key() -> str:
    ensure_runtime_dirs()
    if not SECRET_KEY_FILE.exists():
        SECRET_KEY_FILE.write_text(secrets.token_urlsafe(48), encoding="utf-8")
        try:
            os.chmod(SECRET_KEY_FILE, 0o600)
        except OSError:
            pass
    return SECRET_KEY_FILE.read_text(encoding="utf-8").strip()


ensure_runtime_dirs()
migrate_legacy_data_once()
