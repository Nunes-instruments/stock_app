from __future__ import annotations

import compileall
import hashlib
import os
import shutil
import sys
import tempfile
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))


def verify_protected_files() -> None:
    manifest = APP_DIR / "PROTECTED_RACK_FILES.sha256"
    if not manifest.exists():
        raise RuntimeError("Protected Rack/3D checksum manifest is missing.")

    for raw in manifest.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        expected, rel = raw.split(None, 1)
        rel = rel.strip()
        path = APP_DIR / rel
        if not path.exists():
            raise RuntimeError(f"Protected file is missing: {rel}")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual.lower() != expected.lower():
            raise RuntimeError(
                f"Protected Rack/3D file changed unexpectedly: {rel}"
            )


def main() -> int:
    verify_protected_files()

    if not compileall.compile_dir(
        str(APP_DIR),
        quiet=1,
        rx=None,
        maxlevels=10,
    ):
        raise RuntimeError("Python compile validation failed.")

    with tempfile.TemporaryDirectory(prefix="nunes_stock_preflight_") as temp:
        os.environ["NUNES_STOCK_DATA_DIR"] = temp
        os.environ["NUNES_STOCK_PORT"] = "5099"

        # Imports happen only after the isolated data path is set.
        from database import (
            init_all_branch_databases,
            get_connection,
            get_inventory_revision,
        )
        from stock_service import (
            create_product,
            process_stock_movement,
            get_inventory_products,
            archive_product,
            restore_product,
            assign_product_to_shelf,
            unassign_product_from_shelf,
            get_shelf_rack_state,
            set_shelf_rack_count,
        )
        from flask_app import app

        init_all_branch_databases()

        create_product(
            product_id="PREFLIGHT-001",
            category="PREFLIGHT",
            product_name="Preflight Instrument",
            unit="Nos",
            location="Test",
            opening_quantity=0,
        )

        revision_before = get_inventory_revision()
        inward = process_stock_movement(
            product_id="PREFLIGHT-001",
            movement_type="inward",
            quantity=5,
            reason="preflight",
        )
        if inward["new_quantity"] != 5:
            raise RuntimeError("Inward movement calculation failed.")

        outward = process_stock_movement(
            product_id="PREFLIGHT-001",
            movement_type="outward",
            quantity=2,
            reason="preflight",
        )
        if outward["new_quantity"] != 3:
            raise RuntimeError("Outward movement calculation failed.")

        try:
            process_stock_movement(
                product_id="PREFLIGHT-001",
                movement_type="outward",
                quantity=4,
            )
            raise RuntimeError("Negative-stock protection did not run.")
        except ValueError:
            pass

        if get_inventory_revision() <= revision_before:
            raise RuntimeError("Inventory revision did not increment.")

        conn = get_connection()
        history_before = conn.execute(
            "SELECT COUNT(*) FROM stock_entries WHERE product_id = ?",
            ("PREFLIGHT-001",),
        ).fetchone()[0]
        conn.close()

        archive_product("PREFLIGHT-001", "preflight")
        if any(p["product_id"] == "PREFLIGHT-001" for p in get_inventory_products()):
            raise RuntimeError("Archive did not remove product from active stock.")

        conn = get_connection()
        history_after = conn.execute(
            "SELECT COUNT(*) FROM stock_entries WHERE product_id = ?",
            ("PREFLIGHT-001",),
        ).fetchone()[0]
        conn.close()
        if history_after != history_before:
            raise RuntimeError("Archive modified stock history.")

        restore_product("PREFLIGHT-001")

        # Shelf position is a physical placement only. It must be persistent,
        # movable, removable, and must never change inventory quantity.
        assign_product_to_shelf("PREFLIGHT-001", 1, 2)
        shelf_state = get_shelf_rack_state()
        if not any(
            row.get("product_id") == "PREFLIGHT-001"
            and int(row.get("rack_number") or 0) == 1
            and int(row.get("shelf_number") or 0) == 2
            for row in shelf_state.get("positions", [])
        ):
            raise RuntimeError("Shelf attach did not persist.")

        assign_product_to_shelf("PREFLIGHT-001", 2, 4)
        shelf_state = get_shelf_rack_state()
        matches = [
            row for row in shelf_state.get("positions", [])
            if row.get("product_id") == "PREFLIGHT-001"
        ]
        if len(matches) != 1 or int(matches[0].get("rack_number") or 0) != 2:
            raise RuntimeError("Shelf move did not replace the previous position.")

        try:
            set_shelf_rack_count(1)
            raise RuntimeError("Rack removal protection did not run.")
        except ValueError:
            pass

        unassign_product_from_shelf("PREFLIGHT-001")
        set_shelf_rack_count(3)
        product_after_shelf = next(
            p for p in get_inventory_products() if p["product_id"] == "PREFLIGHT-001"
        )
        if float(product_after_shelf.get("current_quantity") or 0) != 3:
            raise RuntimeError("Shelf placement changed inventory quantity.")

        client = app.test_client()
        for url in (
            "/api/system/health",
            "/api/system/state",
            "/",
            "/current-stock",
            "/storage-view",
            "/add-stock",
            "/import-excel",
            "/download-import-template",
            "/import-history",
        ):
            response = client.get(url)
            if response.status_code != 200:
                raise RuntimeError(
                    f"HTTP preflight failed for {url}: {response.status_code}"
                )

        # Branch behavior check. v3.2.11 intentionally preserves whichever
        # Current Stock visual design is already installed, so do not gate
        # this storage/client update on a cosmetic marker from another release.
        for branch_key in ("main", "gobalapuram", "gandhipuram"):
            response = client.post(
                "/switch-branch",
                data={"branch": branch_key, "return_to": "/current-stock"},
                follow_redirects=True,
            )
            if response.status_code != 200:
                raise RuntimeError(
                    f"Branch Current Stock preflight failed for {branch_key}: "
                    f"{response.status_code}"
                )
            health_response = client.get("/api/system/health")
            health_payload = health_response.get_json() or {}
            if health_response.status_code != 200 or health_payload.get("active_branch") != branch_key:
                raise RuntimeError(
                    f"Branch session did not switch correctly to {branch_key}."
                )

        # Shared Shelf Rack APIs must work independently for every branch.
        for index, branch_key in enumerate(("main", "gobalapuram", "gandhipuram"), start=1):
            client.post(
                "/switch-branch",
                data={"branch": branch_key, "return_to": "/storage-view"},
                follow_redirects=True,
            )
            product_id = f"BRANCH-SHELF-{index:03d}"
            movement = client.post(
                "/stock-movement",
                json={
                    "product_id": product_id,
                    "movement_type": "inward",
                    "quantity": 2,
                    "category": "PREFLIGHT",
                    "product_name": f"Branch Shelf Product {index}",
                    "unit": "Nos",
                },
            )
            if movement.status_code != 200:
                raise RuntimeError(f"Branch shelf product creation failed for {branch_key}.")
            assign_response = client.post(
                "/api/shelf-rack/assign",
                json={"product_id": product_id, "rack_number": 1, "shelf_number": index},
            )
            if assign_response.status_code != 200:
                raise RuntimeError(f"Shelf assignment API failed for {branch_key}.")
            state_response = client.get("/api/shelf-rack/state")
            state_payload = state_response.get_json() or {}
            positions = (state_payload.get("state") or {}).get("positions") or []
            if not any(row.get("product_id") == product_id for row in positions):
                raise RuntimeError(f"Shelf state is not branch-aware for {branch_key}.")
            storage_response = client.get("/storage-view")
            storage_html = storage_response.get_data(as_text=True)
            for marker in ("Shelf Contents", "Attach Product", "shelfInventoryData", "shelfRackStateData"):
                if marker not in storage_html:
                    raise RuntimeError(f"Shelf UI marker {marker!r} missing for {branch_key}.")

        # Excel import/history compatibility checks. The Shelf/client update
        # must preserve the currently installed UI rather than requiring
        # labels from v3.2.9/v3.2.10. Verify the routes and branch behavior.
        import_response = client.get("/import-excel")
        if import_response.status_code != 200:
            raise RuntimeError(
                f"Excel import page preflight failed: {import_response.status_code}"
            )
        template_response = client.get("/download-import-template")
        if template_response.status_code != 200:
            raise RuntimeError("Excel import template download preflight failed.")

        for branch_key in ("main", "gobalapuram", "gandhipuram"):
            response = client.post(
                "/switch-branch",
                data={"branch": branch_key, "return_to": "/import-history"},
                follow_redirects=True,
            )
            if response.status_code != 200:
                raise RuntimeError(
                    f"Branch Stock History preflight failed for {branch_key}: "
                    f"{response.status_code}"
                )
            health_response = client.get("/api/system/health")
            health_payload = health_response.get_json() or {}
            if health_response.status_code != 200 or health_payload.get("active_branch") != branch_key:
                raise RuntimeError(
                    f"History branch session did not switch correctly to {branch_key}."
                )

    print("NUNES STOCK PREFLIGHT: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
