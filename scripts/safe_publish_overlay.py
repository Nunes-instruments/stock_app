from __future__ import annotations

import fnmatch
import os
import shutil
import subprocess
import sys
from pathlib import Path

EXCLUDED_DIRS = {
    ".git", "__pycache__", ".venv", "venv", "data", "backups",
    "uploads", "processed", "logs", "tmp", "temp", ".pytest_cache",
    ".mypy_cache", ".ruff_cache",
}
EXCLUDED_DIR_PREFIXES = ("code_backup_", "ui_backup_", "backup_")
EXCLUDED_FILE_PATTERNS = (
    "*.db", "*.db-shm", "*.db-wal", "*.sqlite", "*.sqlite3",
    "Master_Stock*.xlsx", "*.log", "*.zip", "*.rar", "*.7z",
    ".env", ".env.*", "*.key", "*.pem", "credentials*.json",
    "client_secret*.json", "token*.json",
)


def is_excluded_name(name: str, is_dir: bool) -> bool:
    low = name.lower()
    if is_dir:
        if low in EXCLUDED_DIRS:
            return True
        return any(low.startswith(prefix.lower()) for prefix in EXCLUDED_DIR_PREFIXES)
    return any(fnmatch.fnmatch(low, pattern.lower()) for pattern in EXCLUDED_FILE_PATTERNS)


def overlay(source: Path, target: Path) -> int:
    source = source.resolve()
    target = target.resolve()
    if not source.is_dir():
        raise RuntimeError(f"Source application folder does not exist: {source}")
    if not target.is_dir():
        raise RuntimeError(f"Temporary Git clone does not exist: {target}")
    try:
        target.relative_to(source)
    except ValueError:
        pass
    else:
        raise RuntimeError("Refusing to copy into a destination inside the source application folder.")

    copied = 0
    skipped = 0
    errors: list[str] = []

    for root, dirs, files in os.walk(source):
        root_path = Path(root)
        keep_dirs = []
        for d in dirs:
            if is_excluded_name(d, True):
                skipped += 1
            else:
                keep_dirs.append(d)
        dirs[:] = keep_dirs

        rel_root = root_path.relative_to(source)
        dest_root = target / rel_root
        dest_root.mkdir(parents=True, exist_ok=True)

        for name in files:
            if is_excluded_name(name, False):
                skipped += 1
                continue
            src = root_path / name
            dst = dest_root / name
            try:
                shutil.copy2(src, dst)
                copied += 1
            except Exception as exc:
                errors.append(f"{src} -> {dst}: {exc}")

    print(f"Overlay copied {copied} code files; skipped {skipped} runtime/sensitive items.")
    if errors:
        print("COPY ERRORS:")
        for item in errors[:50]:
            print(" -", item)
        raise RuntimeError(f"Overlay copy failed for {len(errors)} file(s).")
    return 0


def validate_staged(repo: Path) -> int:
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "-z"],
        cwd=repo,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", "replace").strip() or "Unable to list staged files.")

    paths = [p.decode("utf-8", "replace") for p in result.stdout.split(b"\0") if p]
    blocked: list[str] = []
    for path_text in paths:
        p = Path(path_text)
        parts = [part.lower() for part in p.parts]
        name = p.name.lower()
        if any(part in EXCLUDED_DIRS for part in parts):
            blocked.append(path_text)
            continue
        if any(part.startswith(prefix.lower()) for part in parts for prefix in EXCLUDED_DIR_PREFIXES):
            blocked.append(path_text)
            continue
        if any(fnmatch.fnmatch(name, pattern.lower()) for pattern in EXCLUDED_FILE_PATTERNS):
            blocked.append(path_text)

    if blocked:
        print("BLOCKED STAGED FILES:")
        for path_text in blocked:
            print(" -", path_text)
        raise RuntimeError("Runtime, business-data, archive, or credential files are staged. Publish aborted.")

    print(f"Staged-file safety check PASS ({len(paths)} changed path(s)).")
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: safe_publish_overlay.py overlay <source> <target> | validate <repo>")
        return 2
    mode = sys.argv[1].lower()
    if mode == "overlay" and len(sys.argv) == 4:
        return overlay(Path(sys.argv[2]), Path(sys.argv[3]))
    if mode == "validate" and len(sys.argv) == 3:
        return validate_staged(Path(sys.argv[2]))
    print("Invalid arguments.")
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}")
        raise SystemExit(1)
