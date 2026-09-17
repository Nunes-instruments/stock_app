from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

import pandas as pd

from database import BRANCHES, get_connection, normalize_branch_key


BASE_DIR = Path(__file__).resolve().parent
MAIN_RACK_INVENTORY_FILE = BASE_DIR / "dashboard_data" / "main_rack_inventory.json"


def get_main_rack_inventory():
    """Load the approved rack master used by the executive dashboard.

    This is a read-only dashboard source generated from the user's rack Excel.
    It does not change stock quantities or create dummy shelf records.
    """
    if not MAIN_RACK_INVENTORY_FILE.exists():
        return {
            "summary": {
                "rack_groups": 0,
                "coded_racks": 0,
                "occupied_shelves": 0,
                "rack_stock_lines": 0,
                "last_rack_unlocated_lines": 0,
                "stock_lines_total": 0,
                "unique_item_names": 0,
                "rows_without_quantity": 0,
                "scientific_items_unmapped": 0,
            },
            "racks": [],
            "last_rack": {"label": "Last Rack", "item_count": 0, "items": []},
            "unmapped_scientific_items": {
                "label": "Glass Scientific Items",
                "item_count": 0,
                "items": [],
            },
        }

    try:
        return json.loads(MAIN_RACK_INVENTORY_FILE.read_text(encoding="utf-8"))
    except Exception as error:
        print("Unable to load dashboard rack inventory:", error)
        return {
            "summary": {"rack_groups": 0, "occupied_shelves": 0, "stock_lines_total": 0},
            "racks": [],
            "last_rack": {"label": "Last Rack", "item_count": 0, "items": []},
            "unmapped_scientific_items": {"label": "Glass Scientific Items", "item_count": 0, "items": []},
        }


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _clean(value) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return str(value).strip()


def _normal_col(value) -> str:
    text = _clean(value).lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _find_column(frame, aliases):
    normalized = {_normal_col(column): column for column in frame.columns}
    for alias in aliases:
        key = _normal_col(alias)
        if key in normalized:
            return normalized[key]
    return None


def _safe_float(value, default=0.0):
    text = _clean(value)
    if not text:
        return default
    try:
        number = float(text)
    except (TypeError, ValueError):
        return default
    return max(0.0, number)


def _safe_int(value, default=0):
    text = _clean(value)
    if not text:
        return default
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return default


def ensure_storage_layout_tables(branch_key=None):
    keys = [normalize_branch_key(branch_key)] if branch_key else list(BRANCHES.keys())

    for key in keys:
        conn = get_connection(key)
        cursor = conn.cursor()

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS storage_racks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rack_code TEXT NOT NULL UNIQUE,
                rack_name TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS storage_shelves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rack_id INTEGER NOT NULL,
                shelf_code TEXT NOT NULL,
                shelf_name TEXT,
                position_order INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(rack_id, shelf_code),
                FOREIGN KEY(rack_id)
                    REFERENCES storage_racks(id)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS product_storage_map (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id TEXT NOT NULL,
                shelf_id INTEGER NOT NULL,
                mapped_quantity REAL NOT NULL DEFAULT 0
                    CHECK(mapped_quantity >= 0),
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(product_id, shelf_id),
                FOREIGN KEY(product_id)
                    REFERENCES products(product_id)
                    ON UPDATE CASCADE
                    ON DELETE RESTRICT,
                FOREIGN KEY(shelf_id)
                    REFERENCES storage_shelves(id)
                    ON UPDATE CASCADE
                    ON DELETE CASCADE
            )
            """
        )

        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_storage_shelves_rack ON storage_shelves(rack_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_product_storage_product ON product_storage_map(product_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_product_storage_shelf ON product_storage_map(shelf_id)"
        )

        conn.commit()
        conn.close()


def _branch_overview(branch_key):
    ensure_storage_layout_tables(branch_key)
    conn = get_connection(branch_key)
    cursor = conn.cursor()

    def scalar(sql, params=()):
        cursor.execute(sql, params)
        row = cursor.fetchone()
        if not row:
            return 0
        value = row[0]
        return value if value is not None else 0

    total_products = int(scalar("SELECT COUNT(*) FROM products"))
    total_stock = float(
        scalar("SELECT COALESCE(SUM(current_quantity), 0) FROM products")
    )
    racks = int(scalar("SELECT COUNT(*) FROM storage_racks"))
    shelves = int(scalar("SELECT COUNT(*) FROM storage_shelves"))
    mapped_products = int(
        scalar("SELECT COUNT(DISTINCT product_id) FROM product_storage_map")
    )
    mapped_quantity = float(
        scalar("SELECT COALESCE(SUM(mapped_quantity), 0) FROM product_storage_map")
    )
    legacy_locations = int(
        scalar(
            """
            SELECT COUNT(*)
            FROM products
            WHERE TRIM(COALESCE(location, '')) <> ''
            """
        )
    )
    inward_today = 0.0

    cursor.execute(
        """
        SELECT r.rack_code, r.rack_name,
               COUNT(DISTINCT s.id) AS shelf_count,
               COUNT(DISTINCT m.product_id) AS product_count,
               COALESCE(SUM(m.mapped_quantity), 0) AS mapped_quantity
        FROM storage_racks r
        LEFT JOIN storage_shelves s ON s.rack_id = r.id
        LEFT JOIN product_storage_map m ON m.shelf_id = s.id
        GROUP BY r.id
        ORDER BY r.rack_code
        LIMIT 8
        """
    )
    rack_preview = [dict(row) for row in cursor.fetchall()]

    conn.close()

    unassigned = max(total_products - mapped_products, 0)
    coverage = round((mapped_products / total_products * 100), 1) if total_products else 0.0

    meta = BRANCHES[branch_key]
    return {
        "key": branch_key,
        "name": meta["name"],
        "slug": meta["slug"],
        "total_products": total_products,
        "total_stock": total_stock,
        "racks": racks,
        "shelves": shelves,
        "mapped_products": mapped_products,
        "unassigned_products": unassigned,
        "mapped_quantity": mapped_quantity,
        "legacy_locations": legacy_locations,
        "coverage": coverage,
        "inward_today": inward_today,
        "rack_preview": rack_preview,
    }


def get_company_overview():
    rack_inventory = get_main_rack_inventory()
    rack_summary = rack_inventory.get("summary") or {}

    branches = [_branch_overview(key) for key in BRANCHES]

    # Main-company rack/shelf figures come from the real A-to-Last-Rack Excel
    # supplied for this dashboard. We do not fabricate empty/dummy shelves.
    for branch in branches:
        if branch["key"] == "main":
            branch["racks"] = int(rack_summary.get("rack_groups") or 0)
            branch["shelves"] = int(rack_summary.get("occupied_shelves") or 0)
            branch["rack_stock_lines"] = int(rack_summary.get("stock_lines_total") or 0)
            branch["rack_preview"] = [
                {
                    "rack_code": rack.get("code"),
                    "rack_name": rack.get("label"),
                    "shelf_count": rack.get("shelf_count", 0),
                    "product_count": rack.get("item_count", 0),
                    "mapped_quantity": rack.get("listed_quantity_numeric", 0),
                }
                for rack in (rack_inventory.get("racks") or [])[:8]
            ]
        else:
            branch["rack_stock_lines"] = 0

    grand = {
        "total_products": sum(x["total_products"] for x in branches),
        "total_stock": sum(x["total_stock"] for x in branches),
        "racks": sum(x["racks"] for x in branches),
        "shelves": sum(x["shelves"] for x in branches),
        "mapped_products": sum(x["mapped_products"] for x in branches),
        "unassigned_products": sum(x["unassigned_products"] for x in branches),
        "mapped_quantity": sum(x["mapped_quantity"] for x in branches),
        "inward_today": sum(x["inward_today"] for x in branches),
    }
    grand["coverage"] = round(
        (grand["mapped_products"] / grand["total_products"] * 100), 1
    ) if grand["total_products"] else 0.0

    max_stock = max([x["total_stock"] for x in branches] + [1])
    for branch in branches:
        branch["stock_bar"] = round(branch["total_stock"] / max_stock * 100, 1)

    return {
        "branches": branches,
        "grand": grand,
        "main_rack_inventory": rack_inventory,
    }


def _upsert_rack(cursor, rack_code, rack_name="", notes=""):
    now = _now()
    cursor.execute(
        "SELECT id FROM storage_racks WHERE UPPER(rack_code) = UPPER(?)",
        (rack_code,),
    )
    row = cursor.fetchone()
    if row:
        rack_id = row["id"]
        cursor.execute(
            """
            UPDATE storage_racks
            SET rack_name = ?, notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (rack_name, notes, now, rack_id),
        )
        return rack_id, False

    cursor.execute(
        """
        INSERT INTO storage_racks
        (rack_code, rack_name, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (rack_code, rack_name, notes, now, now),
    )
    return cursor.lastrowid, True


def import_racks_excel(file_storage, branch_key):
    branch_key = normalize_branch_key(branch_key)
    ensure_storage_layout_tables(branch_key)

    file_storage.stream.seek(0)
    frame = pd.read_excel(file_storage.stream)
    if frame.empty:
        raise ValueError("Rack Excel has no rows.")

    rack_col = _find_column(
        frame,
        ["Rack Code", "Rack", "Rack No", "Rack Number", "Rack ID"],
    )
    if rack_col is None:
        raise ValueError("Rack Excel must contain a 'Rack Code' column.")

    name_col = _find_column(frame, ["Rack Name", "Name", "Description"])
    notes_col = _find_column(frame, ["Notes", "Remark", "Remarks"])

    conn = get_connection(branch_key)
    cursor = conn.cursor()
    created = 0
    updated = 0
    skipped = 0
    errors = []

    try:
        cursor.execute("BEGIN")
        for index, row in frame.iterrows():
            excel_row = index + 2
            rack_code = _clean(row.get(rack_col)).upper()

            if not rack_code:
                skipped += 1
                errors.append(f"Row {excel_row}: Rack Code is blank.")
                continue

            rack_name = _clean(row.get(name_col)) if name_col else ""
            notes = _clean(row.get(notes_col)) if notes_col else ""

            _, was_created = _upsert_rack(
                cursor, rack_code, rack_name, notes
            )
            if was_created:
                created += 1
            else:
                updated += 1

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return {
        "kind": "Rack",
        "branch": BRANCHES[branch_key]["name"],
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "errors": errors[:12],
    }


def import_shelves_excel(file_storage, branch_key):
    branch_key = normalize_branch_key(branch_key)
    ensure_storage_layout_tables(branch_key)

    file_storage.stream.seek(0)
    frame = pd.read_excel(file_storage.stream)
    if frame.empty:
        raise ValueError("Shelf Excel has no rows.")

    rack_col = _find_column(
        frame,
        ["Rack Code", "Rack", "Rack No", "Rack Number", "Rack ID"],
    )
    shelf_col = _find_column(
        frame,
        ["Shelf Code", "Shelf", "Shelf No", "Shelf Number", "Shelf ID"],
    )

    if rack_col is None or shelf_col is None:
        raise ValueError(
            "Shelf Excel must contain 'Rack Code' and 'Shelf Code' columns."
        )

    shelf_name_col = _find_column(frame, ["Shelf Name", "Name", "Description"])
    position_col = _find_column(
        frame, ["Position", "Position Order", "Order", "Level"]
    )
    notes_col = _find_column(frame, ["Notes", "Remark", "Remarks"])
    product_col = _find_column(
        frame, ["Product ID", "Product Code", "Item ID", "Item Code"]
    )
    quantity_col = _find_column(
        frame, ["Mapped Quantity", "Quantity", "Qty", "Stock"]
    )

    conn = get_connection(branch_key)
    cursor = conn.cursor()

    created_shelves = 0
    updated_shelves = 0
    mapped_products = 0
    skipped = 0
    errors = []

    try:
        cursor.execute("BEGIN")

        for index, row in frame.iterrows():
            excel_row = index + 2
            rack_code = _clean(row.get(rack_col)).upper()
            shelf_code = _clean(row.get(shelf_col)).upper()

            if not rack_code or not shelf_code:
                skipped += 1
                errors.append(
                    f"Row {excel_row}: Rack Code / Shelf Code is required."
                )
                continue

            rack_id, _ = _upsert_rack(cursor, rack_code)

            shelf_name = (
                _clean(row.get(shelf_name_col)) if shelf_name_col else ""
            )
            position = _safe_int(
                row.get(position_col) if position_col else "", 0
            )
            notes = _clean(row.get(notes_col)) if notes_col else ""
            now = _now()

            cursor.execute(
                """
                SELECT id
                FROM storage_shelves
                WHERE rack_id = ?
                  AND UPPER(shelf_code) = UPPER(?)
                """,
                (rack_id, shelf_code),
            )
            shelf_row = cursor.fetchone()

            if shelf_row:
                shelf_id = shelf_row["id"]
                cursor.execute(
                    """
                    UPDATE storage_shelves
                    SET shelf_name = ?, position_order = ?,
                        notes = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (shelf_name, position, notes, now, shelf_id),
                )
                updated_shelves += 1
            else:
                cursor.execute(
                    """
                    INSERT INTO storage_shelves
                    (
                        rack_id, shelf_code, shelf_name,
                        position_order, notes, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        rack_id,
                        shelf_code,
                        shelf_name,
                        position,
                        notes,
                        now,
                        now,
                    ),
                )
                shelf_id = cursor.lastrowid
                created_shelves += 1

            if not product_col:
                continue

            product_id = _clean(row.get(product_col)).upper()
            if not product_id:
                continue

            cursor.execute(
                """
                SELECT current_quantity
                FROM products
                WHERE UPPER(product_id) = UPPER(?)
                """,
                (product_id,),
            )
            product = cursor.fetchone()
            if not product:
                errors.append(
                    f"Row {excel_row}: Product ID '{product_id}' not found. "
                    "Shelf was saved; product mapping was skipped."
                )
                continue

            mapped_quantity = _safe_float(
                row.get(quantity_col) if quantity_col else "", 0.0
            )
            current_quantity = float(product["current_quantity"] or 0)

            if mapped_quantity > current_quantity + 0.000001:
                errors.append(
                    f"Row {excel_row}: mapped quantity {mapped_quantity:g} "
                    f"is above current stock {current_quantity:g} for "
                    f"{product_id}. Mapping skipped."
                )
                continue

            cursor.execute(
                """
                SELECT id
                FROM product_storage_map
                WHERE product_id = ? AND shelf_id = ?
                """,
                (product_id, shelf_id),
            )
            map_row = cursor.fetchone()

            if map_row:
                cursor.execute(
                    """
                    UPDATE product_storage_map
                    SET mapped_quantity = ?, notes = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (mapped_quantity, notes, now, map_row["id"]),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO product_storage_map
                    (
                        product_id, shelf_id, mapped_quantity,
                        notes, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        product_id,
                        shelf_id,
                        mapped_quantity,
                        notes,
                        now,
                        now,
                    ),
                )

            mapped_products += 1

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return {
        "kind": "Shelf",
        "branch": BRANCHES[branch_key]["name"],
        "created": created_shelves,
        "updated": updated_shelves,
        "mapped_products": mapped_products,
        "skipped": skipped,
        "errors": errors[:12],
    }
