"""Protected UI integrity check for NUNES Stock.

Rack/Shelf and 3D Storage are intentionally locked to the approved production
UI. The hashes below are Git blob SHA-1 values from the current approved main
branch. The main-server updater runs this check before accepting an update.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PROTECTED_UI_BLOBS = {
    "templates/rack_shelf.html": "9a2f38420bc1695f702bd91f7090b70b4b4d6787",
    "templates/storage_view.html": "8c0701e0b097519113dc78dcc474cf05a4f9a276",
    "static/shelf_rack_3d.js": "ec068a1b08281a4a0b8a7c81a3eb4f014cf59704",
    "static/stock_3d.js": "c9e708adb5ccc15107adf1308f13a93b72efe82c",
}


def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    header = f"blob {len(data)}\0".encode("utf-8")
    return hashlib.sha1(header + data).hexdigest()


def main() -> int:
    failures: list[str] = []

    for relative_path, expected_sha in PROTECTED_UI_BLOBS.items():
        path = ROOT / relative_path
        if not path.exists():
            failures.append(f"MISSING: {relative_path}")
            continue

        actual_sha = git_blob_sha(path)
        if actual_sha != expected_sha:
            failures.append(
                f"CHANGED: {relative_path} expected={expected_sha} actual={actual_sha}"
            )

    if failures:
        print("[PROTECTED UI CHECK FAILED]")
        for failure in failures:
            print(" - " + failure)
        return 1

    print("[PASS] Rack/Shelf and 3D Storage UI files match the approved design.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
