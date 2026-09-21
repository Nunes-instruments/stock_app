from __future__ import annotations

import json
import re
from io import BytesIO
from pathlib import Path

import pandas as pd

from runtime_paths import DATA_DIR
from database import get_connection, DEFAULT_BRANCH_KEY, get_active_branch_key

APP_DIR = Path(__file__).resolve().parent
BUNDLED_OPEN_RACK_MASTER = APP_DIR / "dashboard_data" / "open_rack_master.json"


def _clean(value):
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return " ".join(str(value).strip().split())


def _norm(value):
    return re.sub(r"[^a-z0-9]+", " ", _clean(value).lower()).strip()


def _find_column(frame, aliases):
    lookup = {_norm(column): column for column in frame.columns}
    for alias in aliases:
        key = _norm(alias)
        if key in lookup:
            return lookup[key]
    return None


def _quantity(value):
    text = _clean(value)
    match = re.search(r"-?\d+(?:\.\d+)?", text.replace(",", ""))
    if not match:
        return 0.0, "Nos"

    number = float(match.group(0))
    unit = text[match.end():].strip() or "Nos"
    normalized = unit.lower().replace("'", "").strip()

    if normalized in {"no", "nos", "no s"}:
        unit = "Nos"
    elif "pcs" in normalized or normalized == "pc":
        unit = "Pcs"
    elif "pair" in normalized:
        unit = "Pair"
    elif "box" in normalized:
        unit = "Box"
    elif "packet" in normalized:
        unit = "Packets"
    elif "pack" in normalized:
        unit = "Pack"
    elif normalized == "nil":
        unit = "Nos"

    return max(0.0, number), unit


def _storage_dir():
    folder = DATA_DIR / "storage_view_sources"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _shelf_file():
    return _storage_dir() / "shelf_rack_products.json"


def _open_file():
    return _storage_dir() / "open_rack_products.json"


def _empty_payload(source_file=""):
    return {
        "source_file": source_file,
        "products": [],
        "summary": {"products": 0, "quantity": 0, "groups": 0},
    }




def _summarize(products):
    groups = set()
    product_keys = set()
    quantity = 0.0
    for product in products:
        location = _clean(product.get("location")) or _clean(product.get("category")) or "Unassigned"
        groups.add(location)
        key = _clean(product.get("product_id")).upper() or _norm(product.get("product_name"))
        if key:
            product_keys.add(key)
        try:
            quantity += float(product.get("current_quantity") or 0)
        except (TypeError, ValueError):
            pass
    return {
        "products": len(product_keys),
        "quantity": quantity,
        "groups": len(groups) if products else 0,
    }

def _read_payload(path, fallback=None):
    if not path.exists():
        return fallback if fallback is not None else _empty_payload()

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback if fallback is not None else _empty_payload()

    if not isinstance(data, dict):
        return fallback if fallback is not None else _empty_payload()

    products = data.get("products")
    if not isinstance(products, list):
        products = []

    data["products"] = products
    data["summary"] = _summarize(products)
    return data



def _allocation_payload(storage_type):
    """Build Storage View data from live Rack/Shelf movement allocations."""
    label = "3D Shelf Rack" if storage_type == "shelf" else "Open Rack"
    payload = _empty_payload("Live stock movements")
    if get_active_branch_key() != DEFAULT_BRANCH_KEY:
        return payload

    conn = get_connection(DEFAULT_BRANCH_KEY)
    cursor = conn.cursor()
    try:
        table = cursor.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='storage_allocations'"
        ).fetchone()
        if not table:
            return payload

        cursor.execute(
            """
            SELECT
                a.product_id,
                a.location_code,
                a.quantity,
                p.product_name,
                p.category,
                p.brand,
                p.model,
                p.unit
            FROM storage_allocations a
            JOIN products p ON p.product_id = a.product_id
            WHERE a.storage_type = ? AND a.quantity > 0
            ORDER BY p.product_name, a.location_code, a.id
            """,
            (storage_type,),
        )
        rows = [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

    grouped = {}
    for row in rows:
        key = _clean(row.get("product_id")).upper()
        if key not in grouped:
            grouped[key] = {
                "product_id": row.get("product_id") or "",
                "product_name": row.get("product_name") or "",
                "brand": row.get("brand") or "",
                "model": row.get("model") or "",
                "category": row.get("category") or label,
                "location": "",
                "current_quantity": 0.0,
                "unit": row.get("unit") or "Nos",
                "source": "Live Stock Movement",
                "image_url": "",
                "storage_source": label,
                "_locations": [],
            }
        item = grouped[key]
        item["current_quantity"] += float(row.get("quantity") or 0)
        location = _clean(row.get("location_code"))
        if location and location not in item["_locations"]:
            item["_locations"].append(location)

    products = []
    for item in grouped.values():
        locations = item.pop("_locations", [])
        item["location"] = " | ".join(locations) if locations else label
        products.append(item)

    products.sort(key=lambda p: _clean(p.get("product_name")).lower())
    payload["products"] = products
    payload["summary"] = _summarize(products)
    return payload



def _allocation_payload(storage_type):
    """Build Storage View data from live Rack/Shelf movement allocations."""
    label = "3D Shelf Rack" if storage_type == "shelf" else "Open Rack"
    payload = _empty_payload("Live stock movements")
    if get_active_branch_key() != DEFAULT_BRANCH_KEY:
        return payload

    conn = get_connection(DEFAULT_BRANCH_KEY)
    cursor = conn.cursor()
    try:
        table = cursor.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='storage_allocations'"
        ).fetchone()
        if not table:
            return payload

        cursor.execute(
            """
            SELECT
                a.product_id,
                a.location_code,
                a.quantity,
                p.product_name,
                p.category,
                p.brand,
                p.model,
                p.unit
            FROM storage_allocations a
            JOIN products p ON p.product_id = a.product_id
            WHERE a.storage_type = ? AND a.quantity > 0
            ORDER BY p.product_name, a.location_code, a.id
            """,
            (storage_type,),
        )
        rows = [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

    grouped = {}
    for row in rows:
        key = _clean(row.get("product_id")).upper()
        if key not in grouped:
            grouped[key] = {
                "product_id": row.get("product_id") or "",
                "product_name": row.get("product_name") or "",
                "brand": row.get("brand") or "",
                "model": row.get("model") or "",
                "category": row.get("category") or label,
                "location": "",
                "current_quantity": 0.0,
                "unit": row.get("unit") or "Nos",
                "source": "Live Stock Movement",
                "image_url": "",
                "storage_source": label,
                "_locations": [],
            }
        item = grouped[key]
        item["current_quantity"] += float(row.get("quantity") or 0)
        location = _clean(row.get("location_code"))
        if location and location not in item["_locations"]:
            item["_locations"].append(location)

    products = []
    for item in grouped.values():
        locations = item.pop("_locations", [])
        item["location"] = " | ".join(locations) if locations else label
        products.append(item)

    products.sort(key=lambda p: _clean(p.get("product_name")).lower())
    payload["products"] = products
    payload["summary"] = _summarize(products)
    return payload


def get_shelf_rack_payload():
    live = _allocation_payload("shelf")
    if live.get("products"):
        return live
    # Runtime Excel remains available only as an empty-system fallback.
    # Old bundled/demo data is intentionally not used in v2.4.
    return _read_payload(_shelf_file(), _empty_payload())


def get_open_rack_payload():
    live = _allocation_payload("rack")
    if live.get("products"):
        return live
    # No bundled Open Rack fallback: old data must not reappear after reset.
    return _read_payload(_open_file(), _empty_payload())


def get_combined_storage_products():
    """Return one row per product with Rack + Shelf quantities combined."""
    combined = {}

    for source_name, payload in (
        ("3D Shelf Rack", get_shelf_rack_payload()),
        ("Open Rack", get_open_rack_payload()),
    ):
        for item in payload.get("products", []):
            if not isinstance(item, dict):
                continue
            product_id = _clean(item.get("product_id")).upper()
            key = product_id or _norm(item.get("product_name"))
            if not key:
                continue

            quantity = 0.0
            try:
                quantity = float(item.get("current_quantity") or 0)
            except (TypeError, ValueError):
                pass

            if key not in combined:
                product = dict(item)
                product["current_quantity"] = 0.0
                product["_sources"] = []
                product["_locations"] = []
                combined[key] = product

            product = combined[key]
            product["current_quantity"] += quantity
            if source_name not in product["_sources"]:
                product["_sources"].append(source_name)
            location = _clean(item.get("location"))
            if location and location not in product["_locations"]:
                product["_locations"].append(location)

    products = []
    for product in combined.values():
        product["storage_source"] = " + ".join(product.pop("_sources", []))
        locations = product.pop("_locations", [])
        product["location"] = " | ".join(locations) if locations else "Unassigned"
        products.append(product)

    products.sort(key=lambda p: _clean(p.get("product_name")).lower())
    return products


def get_combined_storage_summary():
    products = get_combined_storage_products()
    quantity = 0.0
    for product in products:
        try:
            quantity += float(product.get("current_quantity") or 0)
        except (TypeError, ValueError):
            pass
    return {
        "total_products": len(products),
        "total_stock_quantity": quantity,
    }


def get_storage_dual_summary():
    shelf = get_shelf_rack_payload()
    open_rack = get_open_rack_payload()
    return {
        "shelf_products": int(shelf["summary"].get("products", 0) or 0),
        "shelf_quantity": float(shelf["summary"].get("quantity", 0) or 0),
        "shelf_groups": int(shelf["summary"].get("groups", 0) or 0),
        "shelf_source_file": _clean(shelf.get("source_file")),
        "open_rack_products": int(open_rack["summary"].get("products", 0) or 0),
        "open_rack_quantity": float(open_rack["summary"].get("quantity", 0) or 0),
        "open_rack_groups": int(open_rack["summary"].get("groups", 0) or 0),
        "open_rack_source_file": _clean(open_rack.get("source_file")),
    }

def _base_product(index, item, quantity, unit, category, location, brand="", model="", prefix="ITEM"):
    return {
        "product_id": f"{prefix}-{index:04d}",
        "product_name": item,
        "brand": brand,
        "model": model,
        "category": category or "Unassigned",
        "location": location or "Unassigned",
        "current_quantity": quantity,
        "unit": unit or "Nos",
        "source": "Storage View Excel",
        "image_url": "",
    }


def _parse_open_rack(frame):
    item_col = _find_column(frame, ["Item", "Product", "Product Name", "Item Name", "Description"])
    if item_col is None:
        return []

    source_col = _find_column(frame, ["Source File", "Rack Group", "Group", "Category"])
    location_col = _find_column(frame, ["Section / Rack", "Shelf", "Shelf Code", "Location", "Rack / Shelf"])
    model_col = _find_column(frame, ["Model / Brand", "Model", "Brand", "Model Brand"])
    qty_col = _find_column(frame, ["Quantity", "Qty", "Stock", "Current Quantity"])

    products = []

    for _, row in frame.iterrows():
        item = _clean(row.get(item_col))
        if not item:
            continue

        qty, unit = _quantity(row.get(qty_col) if qty_col is not None else "")
        category = _clean(row.get(source_col)) if source_col is not None else "Open Rack"
        location = _clean(row.get(location_col)) if location_col is not None else ""
        model = _clean(row.get(model_col)) if model_col is not None else ""

        products.append(
            _base_product(
                len(products) + 1,
                item=item,
                quantity=qty,
                unit=unit,
                category=category or "Open Rack",
                location=location,
                model=model,
                prefix="OPEN",
            )
        )

    columns = list(frame.columns)
    glass_col = None
    for column in columns:
        normalized = _norm(column)
        if "glass" in normalized and ("scientific" in normalized or "scentific" in normalized):
            glass_col = column
            break

    if glass_col is not None:
        column_index = columns.index(glass_col)
        glass_qty_col = columns[column_index + 1] if column_index + 1 < len(columns) else None

        for _, row in frame.iterrows():
            item = _clean(row.get(glass_col))
            if not item:
                continue

            qty, unit = _quantity(row.get(glass_qty_col) if glass_qty_col is not None else "")
            products.append(
                _base_product(
                    len(products) + 1,
                    item=item,
                    quantity=qty,
                    unit=unit,
                    category="GLASS SCIENTIFIC ITEMS",
                    location="Unassigned",
                    prefix="GLASS",
                )
            )

    return products


def _parse_shelf_rack(frame):
    item_col = _find_column(frame, ["Product", "Product Name", "Item", "Item Name", "Description"])
    if item_col is None:
        return []

    id_col = _find_column(frame, ["Product ID", "Product Code", "Item ID", "Item Code"])
    category_col = _find_column(frame, ["Category", "Group", "Section"])
    location_col = _find_column(frame, ["Shelf", "Shelf Code", "Location", "Rack / Shelf", "Section / Rack"])
    brand_col = _find_column(frame, ["Brand"])
    model_col = _find_column(frame, ["Model", "Model / Brand", "Model Brand"])
    qty_col = _find_column(frame, ["Quantity", "Qty", "Stock", "Current Quantity"])
    unit_col = _find_column(frame, ["Unit", "UOM"])

    products = []

    for _, row in frame.iterrows():
        item = _clean(row.get(item_col))
        if not item:
            continue

        qty, parsed_unit = _quantity(row.get(qty_col) if qty_col is not None else "")
        unit = _clean(row.get(unit_col)) if unit_col is not None else parsed_unit

        product = _base_product(
            len(products) + 1,
            item=item,
            quantity=qty,
            unit=unit or parsed_unit,
            category=_clean(row.get(category_col)) if category_col is not None else "Shelf Rack",
            location=_clean(row.get(location_col)) if location_col is not None else "",
            brand=_clean(row.get(brand_col)) if brand_col is not None else "",
            model=_clean(row.get(model_col)) if model_col is not None else "",
            prefix="SHELF",
        )

        if id_col is not None:
            explicit_id = _clean(row.get(id_col))
            if explicit_id:
                product["product_id"] = explicit_id

        products.append(product)

    return products


def import_storage_excel(file_storage, mode):
    mode = _clean(mode).lower()
    if mode not in {"shelf", "open"}:
        raise ValueError("Unknown storage Excel mode.")

    filename = Path(_clean(file_storage.filename) or "storage.xlsx").name
    if not filename.lower().endswith((".xlsx", ".xls")):
        raise ValueError("Please upload an Excel .xlsx or .xls file.")

    file_storage.stream.seek(0)
    content = file_storage.stream.read()
    if not content:
        raise ValueError("The Excel file is empty.")

    try:
        sheets = pd.read_excel(BytesIO(content), sheet_name=None)
    except Exception as error:
        raise ValueError(f"Unable to read Excel: {error}") from error

    products = []
    for _, frame in sheets.items():
        if frame is None or frame.empty:
            continue

        if mode == "shelf":
            products.extend(_parse_shelf_rack(frame))
        else:
            products.extend(_parse_open_rack(frame))

    if not products:
        raise ValueError("No product rows were detected in this Excel file.")

    payload = {
        "source_file": filename,
        "products": products,
        "summary": _summarize(products),
    }

    target = _shelf_file() if mode == "shelf" else _open_file()
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    uploads = _storage_dir() / "uploads"
    uploads.mkdir(parents=True, exist_ok=True)
    (uploads / f"{mode}_{filename}").write_bytes(content)

    return payload
