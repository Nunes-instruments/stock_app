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
    "templates/storage_view.html": "f9070ecd54ad5e5e2ca2abfbfc814ccb16d1dc25",
    "static/shelf_rack_3d.js": "bf7adce02ca4eaeaa84600c11308963c1832ef4a",
    "static/stock_3d.js": "cfb0d6c64142429a4ebb213916a597db76cf8c96",
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
