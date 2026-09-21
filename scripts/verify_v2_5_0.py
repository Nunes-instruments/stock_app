from pathlib import Path
import hashlib, py_compile
ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "templates/rack_shelf.html": "9a2f38420bc1695f702bd91f7090b70b4b4d6787",
    "templates/storage_view.html": "8c0701e0b097519113dc78dcc474cf05a4f9a276",
    "static/shelf_rack_3d.js": "ec068a1b08281a4a0b8a7c81a3eb4f014cf59704",
    "static/stock_3d.js": "c9e708adb5ccc15107adf1308f13a93b72efe82c"
}

def git_blob_sha(path: Path):
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

errors = []
for rel, expected in EXPECTED.items():
    p = ROOT / rel
    if not p.exists():
        errors.append(f"Missing protected file: {rel}")
    elif git_blob_sha(p) != expected:
        errors.append(f"Protected UI changed: {rel}")

if (ROOT / "VERSION").read_text(encoding="utf-8").strip() != "2.5.0":
    errors.append("VERSION is not 2.5.0")

flask = (ROOT / "flask_app.py").read_text(encoding="utf-8")
base = (ROOT / "templates" / "base.html").read_text(encoding="utf-8")
db = (ROOT / "database.py").read_text(encoding="utf-8")
storage = (ROOT / "storage_dual_master.py").read_text(encoding="utf-8")

checks = {
    "Open Rack template": (ROOT / "templates" / "open_rack.html").exists(),
    "Professional CSS": (ROOT / "static" / "pro_ui_v250.css").exists(),
    "Open Rack route": "def open_rack_page" in flask,
    "Open Rack upload route": "def open_rack_upload" in flask,
    "Open Rack nav": "url_for('open_rack_page')" in base,
    "Rack/Shelf nav": "url_for('rack_shelf_page')" in base,
    "Professional body class": "pro-2026" in base,
    "DB busy timeout": "PRAGMA busy_timeout = 8000" in db,
    "Composite storage index": "idx_storage_allocations_type_product_location" in db,
    "Single allocation payload": storage.count("def _allocation_payload(") == 1,
}
for name, ok in checks.items():
    if not ok:
        errors.append("Check failed: " + name)

for p in ROOT.glob("*.py"):
    try:
        py_compile.compile(str(p), doraise=True)
    except Exception as e:
        errors.append(f"Python compile failed: {p.name}: {e}")

if errors:
    for e in errors:
        print("[FAIL]", e)
    raise SystemExit(1)
print("[PASS] NUNES Stock v2.5.0 source verification complete.")
print("[PASS] Open Rack is a dedicated page.")
print("[PASS] Protected Rack/Shelf and 3D files are unchanged.")
