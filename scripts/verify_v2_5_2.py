from pathlib import Path
import hashlib
import py_compile

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "templates/rack_shelf.html": "9a2f38420bc1695f702bd91f7090b70b4b4d6787",
    "templates/storage_view.html": "8c0701e0b097519113dc78dcc474cf05a4f9a276",
    "static/shelf_rack_3d.js": "ec068a1b08281a4a0b8a7c81a3eb4f014cf59704",
    "static/stock_3d.js": "c9e708adb5ccc15107adf1308f13a93b72efe82c",
}

def blob_sha(path: Path):
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

errors = []
if (ROOT / "VERSION").read_text(encoding="utf-8").strip() != "2.5.2":
    errors.append("VERSION is not 2.5.2")

base = (ROOT / "templates/base.html").read_text(encoding="utf-8")
flask = (ROOT / "flask_app.py").read_text(encoding="utf-8")
db = (ROOT / "database.py").read_text(encoding="utf-8")
storage = (ROOT / "storage_dual_master.py").read_text(encoding="utf-8")
publisher = (ROOT / "PUBLISH_TO_GITHUB.bat").read_text(encoding="utf-8")
updater = (ROOT / "windows/update_main_server.ps1").read_text(encoding="utf-8")

checks = {
    "professional UI": "pro_ui_v250.css" in base and "pro-2026" in base,
    "Open Rack nav": "url_for('open_rack_page')" in base,
    "Open Rack route": "def open_rack_page" in flask,
    "Open Rack template": (ROOT / "templates/open_rack.html").exists(),
    "busy timeout": "PRAGMA busy_timeout = 8000" in db,
    "storage index": "idx_storage_allocations_type_product_location" in db,
    "single allocation payload": storage.count("def _allocation_payload(") == 1,
    "dynamic publisher version": 'git commit -m "NUNES Stock v%APPVER% - production release"' in publisher,
    "scheduler nonfatal": "Task Scheduler permission unavailable; existing schedule is unchanged." in updater,
}
for name, ok in checks.items():
    if not ok:
        errors.append("Check failed: " + name)

for rel, expected in EXPECTED.items():
    p = ROOT / rel
    if not p.exists():
        errors.append("Protected file missing: " + rel)
    elif blob_sha(p) != expected:
        errors.append("Protected file changed: " + rel)

for p in ROOT.glob("*.py"):
    try:
        py_compile.compile(str(p), doraise=True)
    except Exception as exc:
        errors.append(f"Compile failed: {p.name}: {exc}")

if errors:
    for error in errors:
        print("[FAIL]", error)
    raise SystemExit(1)

print("[PASS] v2.5.2 verification complete.")
print("[PASS] Professional UI/Open Rack preserved.")
print("[PASS] Rack/Shelf and 3D protected files unchanged.")
