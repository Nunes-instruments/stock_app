from __future__ import annotations

import json
import re
from io import BytesIO
from pathlib import Path
from datetime import datetime

import pandas as pd

from database import BRANCHES, normalize_branch_key
from runtime_paths import DATA_DIR

APP_DIR = Path(__file__).resolve().parent
BUNDLED_MAIN_FILE = APP_DIR / "dashboard_data" / "main_rack_inventory.json"


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


def _column(frame, aliases):
    lookup = {_norm(c): c for c in frame.columns}
    for alias in aliases:
        key = _norm(alias)
        if key in lookup:
            return lookup[key]
    return None


def _runtime_dir(branch_key):
    key = normalize_branch_key(branch_key)
    folder = DATA_DIR / "rack_shelf" / key
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _runtime_json(branch_key):
    return _runtime_dir(branch_key) / "rack_inventory.json"


def _derive_rack_code(shelf_code, explicit_rack=""):
    explicit = _clean(explicit_rack).upper()
    if explicit:
        explicit = re.sub(r"^RACK\s+", "", explicit).strip()
        match = re.match(r"^([A-Z]+|\d+)", explicit)
        if match:
            return match.group(1)

    shelf = _clean(shelf_code).upper()
    match = re.match(r"^([A-Z]+)", shelf)
    if match:
        return match.group(1)
    match = re.match(r"^(\d+)", shelf)
    return match.group(1) if match else ""


def _quantity_value(text):
    match = re.search(r"-?\d+(?:\.\d+)?", _clean(text).replace(",", ""))
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _empty_inventory(branch_key="main"):
    key = normalize_branch_key(branch_key)
    return {
        "branch_key": key,
        "branch_name": BRANCHES[key]["name"],
        "source_file": "",
        "generated_at": "",
        "summary": {
            "coded_racks": 0,
            "occupied_shelves": 0,
            "located_stock_lines": 0,
            "unassigned_lines": 0,
            "scientific_items_unmapped": 0,
            "stock_lines_total": 0,
        },
        "racks": [],
        "last_rack": {"label": "Unassigned / Last Rack", "item_count": 0, "items": []},
        "unmapped_scientific_items": {
            "label": "Glass Scientific Items",
            "item_count": 0,
            "items": [],
        },
    }


def get_rack_shelf_inventory(branch_key="main"):
    key = normalize_branch_key(branch_key)
    runtime_file = _runtime_json(key)
    source = runtime_file
    if not source.exists() and key == "main" and BUNDLED_MAIN_FILE.exists():
        source = BUNDLED_MAIN_FILE
    if not source.exists():
        return _empty_inventory(key)

    try:
        data = json.loads(source.read_text(encoding="utf-8"))
    except Exception:
        return _empty_inventory(key)

    data["branch_key"] = key
    data["branch_name"] = BRANCHES[key]["name"]
    summary = data.setdefault("summary", {})
    if "located_stock_lines" not in summary:
        summary["located_stock_lines"] = int(
            summary.get("rack_stock_lines", 0) or summary.get("stock_lines_total", 0) or 0
        )
    summary.setdefault("coded_racks", len(data.get("racks", [])))
    summary.setdefault(
        "occupied_shelves",
        sum(len(r.get("shelves", [])) for r in data.get("racks", [])),
    )
    summary.setdefault("unassigned_lines", int(data.get("last_rack", {}).get("item_count", 0) or 0))
    return data


def _parse_dataframe(frame, source_name):
    item_col = _column(frame, ["Item", "Product", "Product Name", "Item Name", "Description"])
    if item_col is None:
        return [], [], []

    shelf_col = _column(frame, ["Section / Rack", "Shelf", "Shelf Code", "Shelf No", "Shelf Number", "Location"])
    rack_col = _column(frame, ["Rack", "Rack Code", "Rack No", "Rack Number"])
    model_col = _column(frame, ["Model / Brand", "Model", "Brand", "Model Brand"])
    quantity_col = _column(frame, ["Quantity", "Qty", "Stock", "Current Quantity"])
    source_col = _column(frame, ["Source File", "Source", "Section", "Group"])
    notes_col = _column(frame, ["Notes", "Remarks", "Remark"])

    located, unassigned = [], []
    for _, row in frame.iterrows():
        item = _clean(row.get(item_col))
        if not item:
            continue
        shelf = _clean(row.get(shelf_col)) if shelf_col is not None else ""
        explicit_rack = _clean(row.get(rack_col)) if rack_col is not None else ""
        source = _clean(row.get(source_col)) if source_col is not None else source_name
        model = _clean(row.get(model_col)) if model_col is not None else ""
        qty_text = _clean(row.get(quantity_col)) if quantity_col is not None else ""
        notes = _clean(row.get(notes_col)) if notes_col is not None else ""

        record = {
            "item": item,
            "model_brand": model,
            "quantity_text": qty_text,
            "quantity_value": _quantity_value(qty_text),
            "source": source,
            "notes": notes,
        }
        rack_code = _derive_rack_code(shelf, explicit_rack)

        # Missing shelf stays unassigned. Never create a dummy shelf.
        if not shelf:
            record["reason"] = "No shelf code in uploaded document"
            unassigned.append(record)
            continue
        if not rack_code:
            record["reason"] = "Rack code could not be derived"
            record["shelf"] = shelf
            unassigned.append(record)
            continue

        record["rack_code"] = rack_code
        record["shelf_code"] = shelf.upper()
        located.append(record)

    scientific = []
    columns = list(frame.columns)
    sci_index = None
    for index, column in enumerate(columns):
        normalized = _norm(column)
        if "glass" in normalized and ("scientific" in normalized or "scentific" in normalized):
            sci_index = index
            break

    if sci_index is not None:
        sci_col = columns[sci_index]
        sci_qty_col = columns[sci_index + 1] if sci_index + 1 < len(columns) else None
        for _, row in frame.iterrows():
            item = _clean(row.get(sci_col))
            if not item:
                continue
            qty_text = _clean(row.get(sci_qty_col)) if sci_qty_col is not None else ""
            scientific.append({
                "item": item,
                "model_brand": "",
                "quantity_text": qty_text,
                "quantity_value": _quantity_value(qty_text),
                "source": "Glass Scientific Items",
                "notes": "",
                "reason": "Separate list without rack/shelf location",
            })
    return located, unassigned, scientific


def import_rack_shelf_document(file_storage, branch_key="main"):
    key = normalize_branch_key(branch_key)
    filename = Path(_clean(file_storage.filename) or "rack_shelf.xlsx").name
    if not filename.lower().endswith((".xlsx", ".xls")):
        raise ValueError("Please upload an Excel .xlsx or .xls file.")

    file_storage.stream.seek(0)
    content = file_storage.stream.read()
    if not content:
        raise ValueError("The uploaded Excel file is empty.")

    try:
        sheets = pd.read_excel(BytesIO(content), sheet_name=None)
    except Exception as error:
        raise ValueError(f"Excel could not be read: {error}") from error

    all_located, all_unassigned, all_scientific = [], [], []
    for sheet_name, frame in sheets.items():
        if frame is None or frame.empty:
            continue
        located, unassigned, scientific = _parse_dataframe(frame, str(sheet_name))
        all_located.extend(located)
        all_unassigned.extend(unassigned)
        all_scientific.extend(scientific)

    if not all_located and not all_unassigned and not all_scientific:
        raise ValueError(
            "No product rows were detected. Expected Item/Product, Shelf/Section, Quantity and optional Rack columns."
        )

    rack_map = {}
    for record in all_located:
        rack_code, shelf_code = record["rack_code"], record["shelf_code"]
        rack = rack_map.setdefault(rack_code, {
            "code": rack_code,
            "label": f"Rack {rack_code}",
            "item_count": 0,
            "shelf_count": 0,
            "_shelves": {},
        })
        shelf = rack["_shelves"].setdefault(shelf_code, {
            "code": shelf_code,
            "label": f"Shelf {shelf_code}",
            "item_count": 0,
            "items": [],
        })
        shelf["items"].append({
            "item": record["item"],
            "model_brand": record["model_brand"],
            "quantity_text": record["quantity_text"],
            "quantity_value": record["quantity_value"],
            "source": record["source"],
            "notes": record["notes"],
        })
        shelf["item_count"] += 1
        rack["item_count"] += 1

    racks = []
    for rack_code in sorted(rack_map, key=lambda value: (0 if value.isalpha() else 1, value)):
        rack = rack_map[rack_code]
        shelves = list(rack.pop("_shelves").values())
        shelves.sort(key=lambda shelf: shelf["code"])
        rack["shelves"] = shelves
        rack["shelf_count"] = len(shelves)
        racks.append(rack)

    inventory = {
        "branch_key": key,
        "branch_name": BRANCHES[key]["name"],
        "source_file": filename,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "summary": {
            "coded_racks": len(racks),
            "occupied_shelves": sum(r["shelf_count"] for r in racks),
            "located_stock_lines": len(all_located),
            "unassigned_lines": len(all_unassigned),
            "scientific_items_unmapped": len(all_scientific),
            "stock_lines_total": len(all_located) + len(all_unassigned) + len(all_scientific),
        },
        "racks": racks,
        "last_rack": {
            "label": "Unassigned / Last Rack",
            "item_count": len(all_unassigned),
            "items": all_unassigned,
        },
        "unmapped_scientific_items": {
            "label": "Glass Scientific Items",
            "item_count": len(all_scientific),
            "items": all_scientific,
        },
    }

    target_dir = _runtime_dir(key)
    (target_dir / "uploads").mkdir(parents=True, exist_ok=True)
    (target_dir / "uploads" / filename).write_bytes(content)
    _runtime_json(key).write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
    return inventory


def apply_document_counts_to_overview(overview):
    branches = overview.get("branches", [])
    for branch in branches:
        inv = get_rack_shelf_inventory(branch.get("key", "main"))
        summary = inv.get("summary", {})
        branch["racks"] = int(summary.get("coded_racks", 0) or 0)
        branch["shelves"] = int(summary.get("occupied_shelves", 0) or 0)

    grand = overview.setdefault("grand", {})
    grand["racks"] = sum(int(branch.get("racks", 0) or 0) for branch in branches)
    grand["shelves"] = sum(int(branch.get("shelves", 0) or 0) for branch in branches)
    return overview
