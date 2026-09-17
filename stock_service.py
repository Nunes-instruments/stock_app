from datetime import datetime
from pathlib import Path
import json
import sqlite3

from database import get_connection


# =============================================================
# PROJECT PATHS
# =============================================================

BASE_DIR = Path(__file__).resolve().parent

STORAGE_CATEGORIES_FILE = (
    BASE_DIR / "storage_categories.json"
)


# =============================================================
# DEFAULT STORAGE CATEGORIES
#
# Used only if storage_categories.json cannot be read.
# The JSON file remains the main source of truth.
# =============================================================

DEFAULT_STORAGE_CATEGORIES = [
    "GAS TESTING & ANALYSER",
    "LABORATORY TESTING & MEASURING",
    "HYDROLOGY INSTRUMENTS",
    "METROLOGY TESTING & MEASURING",
    "AGRICULTURE TESTING & MEASURING",
    "SOIL & WATER TESTING",
    "FOOD PROCESSING MACHINERIES",
    "JUICE PROCESSING MACHINERIES",
    "PACKAGING MACHINERIES",
    "SNACKS PROCESSING MACHINERIES",
    "BAKERY PROCESSING MACHINERIES",
    "SEED & GRAIN MACHINERIES",
]


# =============================================================
# DATE HELPERS
# =============================================================

def get_now():
    return datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )


def get_today():
    return datetime.now().strftime(
        "%Y-%m-%d"
    )


# =============================================================
# NORMALIZATION
# =============================================================

def normalize_text(value):
    if value is None:
        return ""

    return str(value).strip()


def normalize_name(value):
    """
    Used for matching category/product names.

    Example:
        ' Gas Leak Detector '
        'GAS LEAK DETECTOR'

    both become:
        GAS LEAK DETECTOR
    """

    return " ".join(
        normalize_text(value)
        .upper()
        .split()
    )


def normalize_loose(value):
    """
    Removes punctuation/spaces for safer matching.
    """

    return "".join(
        character
        for character in normalize_name(value)
        if character.isalnum()
    )


def normalize_product_id(product_id):
    return normalize_text(
        product_id
    ).upper()


def normalize_movement_type(value):
    value = normalize_text(
        value
    ).lower()

    if value in {
        "in",
        "inward",
        "receive",
        "received",
        "add",
        "incoming",
    }:
        return "inward"

    if value in {
        "out",
        "outward",
        "issue",
        "issued",
        "dispatch",
        "delivery",
        "sold",
        "remove",
        "outgoing",
    }:
        return "outward"

    raise ValueError(
        "Movement type must be either "
        "'inward' or 'outward'."
    )


def normalize_positive_quantity(
    value,
    field_name="Quantity",
):
    try:
        quantity = float(
            value
        )

    except (
        TypeError,
        ValueError,
    ):
        raise ValueError(
            f"{field_name} must be a valid number."
        )

    quantity = abs(
        quantity
    )

    if quantity <= 0:
        raise ValueError(
            f"{field_name} must be greater than zero."
        )

    return quantity


# =============================================================
# INTEGER-FRIENDLY VALUE
# =============================================================

def clean_quantity(value):
    """
    Return integer when quantity is whole.

    10.0 -> 10
    5.0  -> 5

    Decimal quantities remain decimal:
    2.5 -> 2.5
    """

    try:
        number = float(
            value or 0
        )

    except (
        TypeError,
        ValueError,
    ):
        return 0

    if number.is_integer():
        return int(
            number
        )

    return number


# =============================================================
# STORAGE CATEGORY MASTER
# =============================================================

def load_storage_category_records():
    """
    Read storage_categories.json.

    Supported structures include:

    {
        "categories": [
            {
                "category": "...",
                "productTypes": [...]
            }
        ]
    }

    or a direct list.
    """

    if not STORAGE_CATEGORIES_FILE.exists():
        return []

    try:

        with STORAGE_CATEGORIES_FILE.open(
            "r",
            encoding="utf-8",
        ) as file:

            data = json.load(
                file
            )

    except Exception as error:

        print(
            "WARNING: Unable to read "
            "storage_categories.json:",
            error,
        )

        return []

    if isinstance(
        data,
        dict,
    ):

        records = data.get(
            "categories",
            [],
        )

    elif isinstance(
        data,
        list,
    ):

        records = data

    else:

        records = []

    if not isinstance(
        records,
        list,
    ):
        return []

    return records


def get_storage_master():
    """
    Returns:

    {
        "GAS TESTING & ANALYSER": {
            "Gas Leak Detector",
            "Flue Gas Analyser",
            ...
        },

        ...
    }

    This becomes the authoritative inventory scope.
    """

    records = (
        load_storage_category_records()
    )

    master = {}

    for record in records:

        if not isinstance(
            record,
            dict,
        ):
            continue

        category = normalize_name(
            record.get(
                "category"
            )
            or record.get(
                "category_name"
            )
            or record.get(
                "name"
            )
        )

        if not category:
            continue

        product_types = (
            record.get(
                "productTypes"
            )
            or record.get(
                "product_types"
            )
            or record.get(
                "products"
            )
            or []
        )

        if not isinstance(
            product_types,
            list,
        ):
            product_types = []

        master[
            category
        ] = {
            normalize_name(
                product
            )
            for product in product_types
            if normalize_text(
                product
            )
        }

    return master


def get_storage_categories():
    """
    Return configured category names.

    If JSON cannot be loaded, use the 12 default
    categories as a safe category-level fallback.
    """

    master = get_storage_master()

    if master:
        return list(
            master.keys()
        )

    return [
        normalize_name(
            category
        )
        for category
        in DEFAULT_STORAGE_CATEGORIES
    ]


def get_storage_product_names():
    """
    Flatten all configured product types.
    """

    master = get_storage_master()

    names = set()

    for product_names in master.values():

        names.update(
            product_names
        )

    return names


def is_product_in_storage_master(
    product_name,
    category=None,
):
    """
    Check whether a database product belongs to the
    configured category/product master.

    Strict rule when JSON has product types:
        category must exist
        AND product must exist under that category.

    Safe fallback:
        category must be one of the 12 defaults.
    """

    normalized_product = (
        normalize_name(
            product_name
        )
    )

    normalized_category = (
        normalize_name(
            category
        )
    )

    master = get_storage_master()

    # ---------------------------------------------------------
    # FULL MASTER AVAILABLE
    # ---------------------------------------------------------

    if master:

        if not normalized_category:
            return False

        if (
            normalized_category
            not in master
        ):
            return False

        configured_products = (
            master[
                normalized_category
            ]
        )

        # Category has no configured product types.
        if not configured_products:
            return False

        if (
            normalized_product
            in configured_products
        ):
            return True

        # ---------------------------------------------
        # Loose match for harmless formatting variants
        # ---------------------------------------------

        product_loose = (
            normalize_loose(
                normalized_product
            )
        )

        for master_product in (
            configured_products
        ):

            if (
                normalize_loose(
                    master_product
                )
                ==
                product_loose
            ):
                return True

        return False

    # ---------------------------------------------------------
    # JSON UNAVAILABLE:
    # category-only safe fallback
    # ---------------------------------------------------------

    return (
        normalized_category
        in {
            normalize_name(
                item
            )
            for item
            in DEFAULT_STORAGE_CATEGORIES
        }
    )


# =============================================================
# FILTER DATABASE PRODUCTS TO STORAGE MASTER
# =============================================================

def filter_products_to_storage_master(
    products,
):
    """
    Remove old sample/test products from application views.

    This does NOT delete anything from SQLite.

    It only excludes rows that are not part of the
    storage master.
    """

    filtered = []

    for product in products:

        if is_product_in_storage_master(
            product.get(
                "product_name"
            ),
            product.get(
                "category"
            ),
        ):

            product_copy = dict(
                product
            )

            product_copy[
                "current_quantity"
            ] = clean_quantity(
                product_copy.get(
                    "current_quantity"
                )
            )

            filtered.append(
                product_copy
            )

    return filtered


# =============================================================
# PRODUCT READ
# =============================================================

def get_product(
    product_id,
):
    product_id = (
        normalize_product_id(
            product_id
        )
    )

    if not product_id:
        return None

    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute(
            """
            SELECT *
            FROM products
            WHERE product_id = ?
            """,
            (
                product_id,
            ),
        )

        row = cursor.fetchone()

        if not row:
            return None

        product = dict(
            row
        )

        product[
            "current_quantity"
        ] = clean_quantity(
            product.get(
                "current_quantity"
            )
        )

        return product

    finally:

        conn.close()


# =============================================================
# ALL VALID PRODUCTS
#
# IMPORTANT:
# Old sample/test rows are filtered out here.
# =============================================================

def get_all_products():
    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute(
            """
            SELECT *
            FROM products
            ORDER BY product_name ASC
            """
        )

        products = [
            dict(row)
            for row
            in cursor.fetchall()
        ]

    finally:

        conn.close()

    return (
        filter_products_to_storage_master(
            products
        )
    )


# =============================================================
# SEARCH VALID PRODUCTS
# =============================================================

def search_products(
    search_text="",
):
    search_text = normalize_text(
        search_text
    )

    products = get_all_products()

    if not search_text:
        return products

    search_value = (
        normalize_name(
            search_text
        )
    )

    results = []

    for product in products:

        searchable = " ".join(
            [
                normalize_name(
                    product.get(
                        "product_id"
                    )
                ),
                normalize_name(
                    product.get(
                        "product_name"
                    )
                ),
                normalize_name(
                    product.get(
                        "model"
                    )
                ),
                normalize_name(
                    product.get(
                        "brand"
                    )
                ),
                normalize_name(
                    product.get(
                        "category"
                    )
                ),
            ]
        )

        if search_value in searchable:

            results.append(
                product
            )

    return results


# =============================================================
# CREATE PRODUCT
# =============================================================

def create_product(
    product_id,
    category,
    product_name,
    brand="",
    model="",
    unit="Nos",
    location="",
    opening_quantity=0,
):
    product_id = (
        normalize_product_id(
            product_id
        )
    )

    category = normalize_text(
        category
    )

    product_name = (
        normalize_text(
            product_name
        )
    )

    brand = normalize_text(
        brand
    )

    model = normalize_text(
        model
    )

    unit = (
        normalize_text(
            unit
        )
        or "Nos"
    )

    location = normalize_text(
        location
    )

    if not product_id:
        raise ValueError(
            "Product ID is required."
        )

    if not category:
        raise ValueError(
            "Category is required."
        )

    if not product_name:
        raise ValueError(
            "Product Name is required."
        )

    # ---------------------------------------------------------
    # INVENTORY MASTER VALIDATION
    # ---------------------------------------------------------

    if not is_product_in_storage_master(
        product_name,
        category,
    ):

        raise ValueError(
            f"'{product_name}' is not configured under "
            f"the storage category '{category}'. "
            "Add the product type to the category master first."
        )

    try:

        opening_quantity = float(
            opening_quantity
        )

    except (
        TypeError,
        ValueError,
    ):

        raise ValueError(
            "Opening quantity must be a valid number."
        )

    if opening_quantity < 0:

        raise ValueError(
            "Opening quantity cannot be negative."
        )

    now = get_now()

    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute(
            """
            INSERT INTO products (
                product_id,
                category,
                product_name,
                brand,
                model,
                unit,
                location,
                current_quantity,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                product_id,
                category,
                product_name,
                brand,
                model,
                unit,
                location,
                opening_quantity,
                now,
                now,
            ),
        )

        conn.commit()

        return {
            "success": True,
            "database_id":
                cursor.lastrowid,
            "product_id":
                product_id,
            "current_quantity":
                clean_quantity(
                    opening_quantity
                ),
        }

    except sqlite3.IntegrityError:

        conn.rollback()

        raise ValueError(
            f"Product ID '{product_id}' already exists."
        )

    finally:

        conn.close()


# =============================================================
# ENTRY NUMBER
# =============================================================

def generate_entry_number(
    entry_id,
):
    return (
        f"STK{entry_id:06d}"
    )


# =============================================================
# STANDARD ADD STOCK
# =============================================================

def add_stock(
    product_id,
    quantity_added,
    category="",
    product_name="",
    brand="",
    model="",
    unit="Nos",
    location="",
    stock_date=None,
    import_id=None,
    excel_row=None,
    source="Excel Import",
    remarks="",
):
    product_id = (
        normalize_product_id(
            product_id
        )
    )

    category = normalize_text(
        category
    )

    product_name = (
        normalize_text(
            product_name
        )
    )

    brand = normalize_text(
        brand
    )

    model = normalize_text(
        model
    )

    unit = (
        normalize_text(
            unit
        )
        or "Nos"
    )

    location = normalize_text(
        location
    )

    source = (
        normalize_text(
            source
        )
        or "Excel Import"
    )

    remarks = normalize_text(
        remarks
    )

    if not product_id:
        raise ValueError(
            "Product ID is required."
        )

    quantity_added = (
        normalize_positive_quantity(
            quantity_added
        )
    )

    if (
        stock_date is None
        or not normalize_text(
            stock_date
        )
    ):

        stock_date = get_today()

    else:

        stock_date = (
            normalize_text(
                stock_date
            )
        )

    now = get_now()

    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute(
            "BEGIN"
        )

        cursor.execute(
            """
            SELECT *
            FROM products
            WHERE product_id = ?
            """,
            (
                product_id,
            ),
        )

        existing_product = (
            cursor.fetchone()
        )

        # =====================================================
        # EXISTING PRODUCT
        # =====================================================

        if existing_product:

            existing_product = dict(
                existing_product
            )

            effective_category = (
                category
                or existing_product.get(
                    "category",
                    ""
                )
            )

            effective_name = (
                product_name
                or existing_product.get(
                    "product_name",
                    ""
                )
            )

            if not is_product_in_storage_master(
                effective_name,
                effective_category,
            ):

                raise ValueError(
                    f"'{effective_name}' is not part of the "
                    "configured storage product master."
                )

            previous_quantity = float(
                existing_product.get(
                    "current_quantity"
                )
                or 0
            )

            new_quantity = (
                previous_quantity
                + quantity_added
            )

            cursor.execute(
                """
                UPDATE products

                SET current_quantity = ?,
                    updated_at = ?,

                    category = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE category
                    END,

                    product_name = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE product_name
                    END,

                    brand = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE brand
                    END,

                    model = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE model
                    END,

                    unit = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE unit
                    END,

                    location = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE location
                    END

                WHERE product_id = ?
                """,
                (
                    new_quantity,
                    now,

                    category,
                    category,

                    product_name,
                    product_name,

                    brand,
                    brand,

                    model,
                    model,

                    unit,
                    unit,

                    location,
                    location,

                    product_id,
                ),
            )

            product_created = False

        # =====================================================
        # NEW PRODUCT
        # =====================================================

        else:

            if not category:

                raise ValueError(
                    f"Product '{product_id}' does not exist. "
                    "Category is required."
                )

            if not product_name:

                raise ValueError(
                    f"Product '{product_id}' does not exist. "
                    "Product Name is required."
                )

            if not is_product_in_storage_master(
                product_name,
                category,
            ):

                raise ValueError(
                    f"'{product_name}' is not configured under "
                    f"'{category}'. Add it as a product type "
                    "in Category Management first."
                )

            previous_quantity = 0.0

            new_quantity = (
                quantity_added
            )

            cursor.execute(
                """
                INSERT INTO products (
                    product_id,
                    category,
                    product_name,
                    brand,
                    model,
                    unit,
                    location,
                    current_quantity,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    product_id,
                    category,
                    product_name,
                    brand,
                    model,
                    unit,
                    location,
                    new_quantity,
                    now,
                    now,
                ),
            )

            product_created = True

        # =====================================================
        # HISTORY
        # =====================================================

        cursor.execute(
            """
            INSERT INTO stock_entries (
                entry_number,
                product_id,
                previous_quantity,
                quantity_added,
                new_quantity,
                stock_date,
                import_id,
                excel_row,
                source,
                remarks,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                None,
                product_id,
                previous_quantity,
                quantity_added,
                new_quantity,
                stock_date,
                import_id,
                excel_row,
                source,
                remarks,
                now,
            ),
        )

        entry_id = (
            cursor.lastrowid
        )

        entry_number = (
            generate_entry_number(
                entry_id
            )
        )

        cursor.execute(
            """
            UPDATE stock_entries
            SET entry_number = ?
            WHERE id = ?
            """,
            (
                entry_number,
                entry_id,
            ),
        )

        conn.commit()

        return {
            "success":
                True,

            "movement_type":
                "inward",

            "entry_id":
                entry_id,

            "entry_number":
                entry_number,

            "product_id":
                product_id,

            "product_created":
                product_created,

            "previous_quantity":
                clean_quantity(
                    previous_quantity
                ),

            "quantity":
                clean_quantity(
                    quantity_added
                ),

            "quantity_added":
                clean_quantity(
                    quantity_added
                ),

            "new_quantity":
                clean_quantity(
                    new_quantity
                ),

            "stock_date":
                stock_date,
        }

    except Exception:

        conn.rollback()
        raise

    finally:

        conn.close()


# =============================================================
# INWARD / OUTWARD MOVEMENT
# =============================================================

def process_stock_movement(
    product_id,
    movement_type,
    quantity,
    category="",
    product_name="",
    brand="",
    model="",
    unit="Nos",
    location="",
    reason="",
    reason_label="",
    reference="",
    remarks="",
    stock_date=None,
    source="Storage View",
):
    product_id = (
        normalize_product_id(
            product_id
        )
    )

    movement_type = (
        normalize_movement_type(
            movement_type
        )
    )

    quantity = (
        normalize_positive_quantity(
            quantity,
            "Movement quantity",
        )
    )

    category = normalize_text(
        category
    )

    product_name = (
        normalize_text(
            product_name
        )
    )

    brand = normalize_text(
        brand
    )

    model = normalize_text(
        model
    )

    unit = (
        normalize_text(
            unit
        )
        or "Nos"
    )

    location = normalize_text(
        location
    )

    reason = normalize_text(
        reason
    )

    reason_label = (
        normalize_text(
            reason_label
        )
    )

    reference = normalize_text(
        reference
    )

    remarks = normalize_text(
        remarks
    )

    source = (
        normalize_text(
            source
        )
        or "Stock Movement"
    )

    if not product_id:

        raise ValueError(
            "Product ID is required."
        )

    if (
        stock_date is None
        or not normalize_text(
            stock_date
        )
    ):

        stock_date = get_today()

    else:

        stock_date = (
            normalize_text(
                stock_date
            )
        )

    now = get_now()

    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute(
            "BEGIN"
        )

        cursor.execute(
            """
            SELECT *
            FROM products
            WHERE product_id = ?
            """,
            (
                product_id,
            ),
        )

        existing_product = (
            cursor.fetchone()
        )

        # =====================================================
        # FIRST INWARD
        # =====================================================

        if not existing_product:

            if movement_type == "outward":

                raise ValueError(
                    f"Product '{product_id}' is not registered. "
                    "Complete INWARD first."
                )

            if not category:

                raise ValueError(
                    "Category is required for first INWARD."
                )

            if not product_name:

                raise ValueError(
                    "Product Name is required for first INWARD."
                )

            if not is_product_in_storage_master(
                product_name,
                category,
            ):

                raise ValueError(
                    f"'{product_name}' is not configured under "
                    f"'{category}'."
                )

            previous_quantity = 0.0

            new_quantity = quantity

            cursor.execute(
                """
                INSERT INTO products (
                    product_id,
                    category,
                    product_name,
                    brand,
                    model,
                    unit,
                    location,
                    current_quantity,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    product_id,
                    category,
                    product_name,
                    brand,
                    model,
                    unit,
                    location,
                    new_quantity,
                    now,
                    now,
                ),
            )

            product_created = True

        # =====================================================
        # REGISTERED PRODUCT
        # =====================================================

        else:

            existing_product = dict(
                existing_product
            )

            product_created = False

            effective_category = (
                category
                or existing_product.get(
                    "category",
                    ""
                )
            )

            effective_product_name = (
                product_name
                or existing_product.get(
                    "product_name",
                    ""
                )
            )

            if not is_product_in_storage_master(
                effective_product_name,
                effective_category,
            ):

                raise ValueError(
                    f"'{effective_product_name}' is not part "
                    "of the active storage product master."
                )

            previous_quantity = float(
                existing_product.get(
                    "current_quantity"
                )
                or 0
            )

            # -------------------------------------------------
            # INWARD
            # -------------------------------------------------

            if movement_type == "inward":

                new_quantity = (
                    previous_quantity
                    + quantity
                )

            # -------------------------------------------------
            # OUTWARD
            # -------------------------------------------------

            else:

                if previous_quantity <= 0:

                    raise ValueError(
                        "No stock is available for OUTWARD."
                    )

                if quantity > previous_quantity:

                    raise ValueError(
                        "Outward quantity cannot exceed "
                        "available stock. "
                        f"Available: "
                        f"{clean_quantity(previous_quantity)} "
                        f"{unit}."
                    )

                new_quantity = (
                    previous_quantity
                    - quantity
                )

                if abs(
                    new_quantity
                ) < 0.0000001:

                    new_quantity = 0.0

            cursor.execute(
                """
                UPDATE products

                SET current_quantity = ?,
                    updated_at = ?,

                    category = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE category
                    END,

                    product_name = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE product_name
                    END,

                    brand = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE brand
                    END,

                    model = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE model
                    END,

                    unit = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE unit
                    END,

                    location = CASE
                        WHEN ? <> ''
                        THEN ?
                        ELSE location
                    END

                WHERE product_id = ?
                """,
                (
                    new_quantity,
                    now,

                    category,
                    category,

                    product_name,
                    product_name,

                    brand,
                    brand,

                    model,
                    model,

                    unit,
                    unit,

                    location,
                    location,

                    product_id,
                ),
            )

        # =====================================================
        # HISTORY DESCRIPTION
        # =====================================================

        history_parts = [
            (
                "INWARD"
                if movement_type
                == "inward"
                else "OUTWARD"
            )
        ]

        if reason_label:

            history_parts.append(
                f"Reason: {reason_label}"
            )

        elif reason:

            history_parts.append(
                f"Reason: {reason}"
            )

        if reference:

            history_parts.append(
                f"Reference: {reference}"
            )

        if remarks:

            history_parts.append(
                remarks
            )

        history_remarks = " | ".join(
            history_parts
        )

        movement_source = (
            "Stock Inward"
            if movement_type
            == "inward"
            else "Stock Outward"
        )

        # =====================================================
        # SAVE MOVEMENT
        #
        # quantity_added remains POSITIVE.
        # Direction comes from previous/new quantity.
        # =====================================================

        cursor.execute(
            """
            INSERT INTO stock_entries (
                entry_number,
                product_id,
                previous_quantity,
                quantity_added,
                new_quantity,
                stock_date,
                import_id,
                excel_row,
                source,
                remarks,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                None,
                product_id,
                previous_quantity,
                quantity,
                new_quantity,
                stock_date,
                None,
                None,
                movement_source,
                history_remarks,
                now,
            ),
        )

        entry_id = (
            cursor.lastrowid
        )

        entry_number = (
            generate_entry_number(
                entry_id
            )
        )

        cursor.execute(
            """
            UPDATE stock_entries
            SET entry_number = ?
            WHERE id = ?
            """,
            (
                entry_number,
                entry_id,
            ),
        )

        conn.commit()

        return {
            "success":
                True,

            "movement_type":
                movement_type,

            "entry_id":
                entry_id,

            "entry_number":
                entry_number,

            "product_id":
                product_id,

            "product_created":
                product_created,

            "previous_quantity":
                clean_quantity(
                    previous_quantity
                ),

            "quantity":
                clean_quantity(
                    quantity
                ),

            "quantity_added":
                clean_quantity(
                    quantity
                ),

            "new_quantity":
                clean_quantity(
                    new_quantity
                ),

            "unit":
                unit,

            "reason":
                reason,

            "reason_label":
                reason_label,

            "reference":
                reference,

            "stock_date":
                stock_date,

            "source":
                movement_source,
        }

    except Exception:

        conn.rollback()
        raise

    finally:

        conn.close()


# =============================================================
# COMPATIBILITY ALIASES
# =============================================================

def stock_movement(
    product_id,
    movement_type,
    quantity,
    category="",
    product_name="",
    brand="",
    model="",
    unit="Nos",
    location="",
    reason="",
    reason_label="",
    reference="",
    remarks="",
    stock_date=None,
    source="Stock Movement",
):

    return process_stock_movement(
        product_id=product_id,
        movement_type=movement_type,
        quantity=quantity,
        category=category,
        product_name=product_name,
        brand=brand,
        model=model,
        unit=unit,
        location=location,
        reason=reason,
        reason_label=reason_label,
        reference=reference,
        remarks=remarks,
        stock_date=stock_date,
        source=source,
    )


def move_stock(
    *args,
    **kwargs,
):

    return stock_movement(
        *args,
        **kwargs,
    )


# =============================================================
# STOCK HISTORY
#
# IMPORTANT:
# Only active storage-master products are returned.
# =============================================================

def get_stock_history(
    product_id=None,
    limit=500,
):
    try:

        limit = int(
            limit
        )

    except (
        TypeError,
        ValueError,
    ):

        limit = 500

    limit = max(
        1,
        min(
            limit,
            5000,
        ),
    )

    valid_products = (
        get_all_products()
    )

    valid_product_ids = {
        normalize_product_id(
            product.get(
                "product_id"
            )
        )
        for product
        in valid_products
    }

    if product_id:

        normalized_requested_id = (
            normalize_product_id(
                product_id
            )
        )

        if (
            normalized_requested_id
            not in valid_product_ids
        ):
            return []

    conn = get_connection()
    cursor = conn.cursor()

    try:

        if product_id:

            cursor.execute(
                """
                SELECT
                    se.*,
                    p.product_name,
                    p.category,
                    p.model,
                    p.brand,
                    p.unit,
                    p.location

                FROM stock_entries se

                LEFT JOIN products p
                    ON se.product_id = p.product_id

                WHERE se.product_id = ?

                ORDER BY se.id DESC

                LIMIT ?
                """,
                (
                    normalize_product_id(
                        product_id
                    ),
                    limit,
                ),
            )

        else:

            # Fetch extra because old sample rows may later
            # be removed by filtering.
            cursor.execute(
                """
                SELECT
                    se.*,
                    p.product_name,
                    p.category,
                    p.model,
                    p.brand,
                    p.unit,
                    p.location

                FROM stock_entries se

                LEFT JOIN products p
                    ON se.product_id = p.product_id

                ORDER BY se.id DESC

                LIMIT ?
                """,
                (
                    max(
                        limit * 10,
                        500,
                    ),
                ),
            )

        rows = [
            dict(row)
            for row
            in cursor.fetchall()
        ]

    finally:

        conn.close()

    results = []

    for row in rows:

        row_product_id = (
            normalize_product_id(
                row.get(
                    "product_id"
                )
            )
        )

        if (
            row_product_id
            not in valid_product_ids
        ):
            continue

        previous = float(
            row.get(
                "previous_quantity"
            )
            or 0
        )

        current = float(
            row.get(
                "new_quantity"
            )
            or 0
        )

        row[
            "movement_type"
        ] = (
            "outward"
            if current < previous
            else "inward"
        )

        row[
            "previous_quantity"
        ] = clean_quantity(
            previous
        )

        row[
            "quantity_added"
        ] = clean_quantity(
            row.get(
                "quantity_added"
            )
        )

        row[
            "new_quantity"
        ] = clean_quantity(
            current
        )

        results.append(
            row
        )

        if len(
            results
        ) >= limit:
            break

    return results


# =============================================================
# RECENT MOVEMENT
# =============================================================

def get_recent_stock_entries(
    limit=10,
):

    return get_stock_history(
        limit=limit
    )


# =============================================================
# TOTAL PRODUCTS
#
# Counts only REGISTERED products from active storage master.
# It does not count old test/sample records.
# =============================================================

def get_total_products():

    products = get_all_products()

    return len(
        products
    )


# =============================================================
# TOTAL STOCK
#
# THIS FIXES YOUR "373" ISSUE.
#
# Only current configured storage-master products contribute.
# =============================================================

def get_total_stock_quantity():

    products = get_all_products()

    total = sum(
        float(
            product.get(
                "current_quantity"
            )
            or 0
        )
        for product
        in products
    )

    return clean_quantity(
        total
    )


# =============================================================
# INWARD TODAY
#
# Only movements for active storage-master products.
# =============================================================

def get_stock_added_today():

    today = get_today()

    history = get_stock_history(
        limit=5000
    )

    total = 0.0

    for entry in history:

        if (
            normalize_text(
                entry.get(
                    "stock_date"
                )
            )
            != today
        ):
            continue

        if (
            entry.get(
                "movement_type"
            )
            != "inward"
        ):
            continue

        total += float(
            entry.get(
                "quantity_added"
            )
            or 0
        )

    return clean_quantity(
        total
    )


# =============================================================
# OUTWARD TODAY
# =============================================================

def get_stock_outward_today():

    today = get_today()

    history = get_stock_history(
        limit=5000
    )

    total = 0.0

    for entry in history:

        if (
            normalize_text(
                entry.get(
                    "stock_date"
                )
            )
            != today
        ):
            continue

        if (
            entry.get(
                "movement_type"
            )
            != "outward"
        ):
            continue

        total += float(
            entry.get(
                "quantity_added"
            )
            or 0
        )

    return clean_quantity(
        total
    )


# =============================================================
# DASHBOARD
# =============================================================

def get_dashboard_summary():

    return {
        "total_products":
            get_total_products(),

        "total_stock_quantity":
            get_total_stock_quantity(),

        "stock_added_today":
            get_stock_added_today(),

        "stock_outward_today":
            get_stock_outward_today(),
    }


# =============================================================
# UPDATE PRODUCT DETAILS
# =============================================================

def update_product_details(
    product_id,
    category=None,
    product_name=None,
    brand=None,
    model=None,
    unit=None,
    location=None,
):
    product_id = (
        normalize_product_id(
            product_id
        )
    )

    if not product_id:

        raise ValueError(
            "Product ID is required."
        )

    existing_product = (
        get_product(
            product_id
        )
    )

    if not existing_product:

        raise ValueError(
            f"Product '{product_id}' was not found."
        )

    new_category = (
        normalize_text(
            category
        )
        if category is not None
        else existing_product.get(
            "category",
            ""
        )
    )

    new_product_name = (
        normalize_text(
            product_name
        )
        if product_name is not None
        else existing_product.get(
            "product_name",
            ""
        )
    )

    new_brand = (
        normalize_text(
            brand
        )
        if brand is not None
        else normalize_text(
            existing_product.get(
                "brand"
            )
        )
    )

    new_model = (
        normalize_text(
            model
        )
        if model is not None
        else normalize_text(
            existing_product.get(
                "model"
            )
        )
    )

    new_unit = (
        normalize_text(
            unit
        )
        if unit is not None
        else (
            normalize_text(
                existing_product.get(
                    "unit"
                )
            )
            or "Nos"
        )
    )

    new_location = (
        normalize_text(
            location
        )
        if location is not None
        else normalize_text(
            existing_product.get(
                "location"
            )
        )
    )

    if not new_category:

        raise ValueError(
            "Category cannot be blank."
        )

    if not new_product_name:

        raise ValueError(
            "Product Name cannot be blank."
        )

    if not is_product_in_storage_master(
        new_product_name,
        new_category,
    ):

        raise ValueError(
            f"'{new_product_name}' is not configured "
            f"under '{new_category}'."
        )

    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute(
            """
            UPDATE products

            SET category = ?,
                product_name = ?,
                brand = ?,
                model = ?,
                unit = ?,
                location = ?,
                updated_at = ?

            WHERE product_id = ?
            """,
            (
                new_category,
                new_product_name,
                new_brand,
                new_model,
                new_unit,
                new_location,
                get_now(),
                product_id,
            ),
        )

        conn.commit()

    except Exception:

        conn.rollback()
        raise

    finally:

        conn.close()

    return get_product(
        product_id
    )


# =============================================================
# INVENTORY SCOPE DIAGNOSTIC
#
# Optional helper.
#
# Run:
#
# python -c "from stock_service import print_inventory_scope; print_inventory_scope()"
#
# to see exactly which DB rows are counted and excluded.
# =============================================================

def print_inventory_scope():

    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute(
            """
            SELECT
                product_id,
                product_name,
                category,
                current_quantity

            FROM products

            ORDER BY category, product_name
            """
        )

        rows = [
            dict(row)
            for row
            in cursor.fetchall()
        ]

    finally:

        conn.close()

    counted = []
    excluded = []

    for row in rows:

        if is_product_in_storage_master(
            row.get(
                "product_name"
            ),
            row.get(
                "category"
            ),
        ):

            counted.append(
                row
            )

        else:

            excluded.append(
                row
            )

    print()
    print(
        "=========================================="
    )
    print(
        "ACTIVE STORAGE INVENTORY"
    )
    print(
        "=========================================="
    )

    total = 0

    for row in counted:

        quantity = clean_quantity(
            row.get(
                "current_quantity"
            )
        )

        total += float(
            quantity or 0
        )

        print(
            "[COUNTED]",
            row.get(
                "product_id"
            ),
            "-",
            row.get(
                "product_name"
            ),
            "-",
            quantity,
        )

    print()
    print(
        "ACTIVE TOTAL STOCK:",
        clean_quantity(
            total
        ),
    )

    print()
    print(
        "=========================================="
    )
    print(
        "EXCLUDED OLD / SAMPLE PRODUCTS"
    )
    print(
        "=========================================="
    )

    for row in excluded:

        print(
            "[EXCLUDED]",
            row.get(
                "product_id"
            ),
            "-",
            row.get(
                "product_name"
            ),
            "-",
            clean_quantity(
                row.get(
                    "current_quantity"
                )
            ),
        )

    print()
    print(
        "Counted products:",
        len(
            counted
        ),
    )

    print(
        "Excluded products:",
        len(
            excluded
        ),
    )

    print()