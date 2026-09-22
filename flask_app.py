from pathlib import Path
from io import BytesIO
from datetime import datetime
import json

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    redirect,
    url_for,
    send_file,
    send_from_directory,
    flash,
    session,
)

from database import (
    init_database,
    init_all_branch_databases,
    get_connection,
    get_inventory_revision,
    bump_inventory_revision,
    BRANCHES,
    DEFAULT_BRANCH_KEY,
    get_active_branch_key,
    get_branch_name,
)

from stock_service import (
    get_dashboard_summary,
    get_all_products,
    get_inventory_products,
    get_recent_stock_entries,
    get_stock_history,
    get_product,
    add_stock,
    process_stock_movement,
    archive_product,
    restore_product,
    is_product_in_storage_master,
    clean_quantity,
    get_shelf_rack_state,
    assign_product_to_shelf,
    unassign_product_from_shelf,
    set_shelf_rack_count,
)

from excel_handler import (
    read_excel_file,
    prepare_preview,
    import_excel_to_database,
    update_master_stock_excel,
    MASTER_STOCK_FILE,
    get_master_stock_file,
    get_excel_template_bytes,
)

from runtime_paths import (
    STORAGE_CATEGORIES_FILE,
    AUTO_IMAGE_DIR,
    get_flask_secret_key,
)
from version_info import APP_VERSION, BUILD_DATE

from product_image_service import (
    get_cached_product_image_url,
    get_cached_product_image_info,
    search_and_cache_product_image,
)


# =============================================================
# APPLICATION
# =============================================================

app = Flask(__name__)

app.secret_key = get_flask_secret_key()


# =============================================================
# DEVELOPMENT / CACHE SETTINGS
# =============================================================

app.config[
    "TEMPLATES_AUTO_RELOAD"
] = True

app.config[
    "SEND_FILE_MAX_AGE_DEFAULT"
] = 0


# =============================================================
# PROJECT PATHS
# =============================================================

BASE_DIR = (
    Path(__file__)
    .resolve()
    .parent
)

# =============================================================
# DATABASE
# =============================================================

init_all_branch_databases()


@app.context_processor
def inject_system_metadata():
    branch_key = get_active_branch_key()
    return {
        "app_version": APP_VERSION,
        "build_date": BUILD_DATE,
        "inventory_revision": get_inventory_revision(branch_key),
    }


@app.route("/api/system/health")
def system_health():
    branch_key = get_active_branch_key()
    return jsonify(
        {
            "success": True,
            "status": "online",
            "version": APP_VERSION,
            "build_date": BUILD_DATE,
            "active_branch": branch_key,
            "inventory_revision": get_inventory_revision(branch_key),
        }
    )


@app.route("/api/system/state")
def system_state():
    """Lightweight endpoint used by all browsers for live stock refresh."""
    branch_key = get_active_branch_key()
    return jsonify(
        {
            "success": True,
            "version": APP_VERSION,
            "branch": branch_key,
            "inventory_revision": get_inventory_revision(branch_key),
        }
    )


@app.route("/data-product-images/<path:filename>")
def data_product_image(filename):
    return send_from_directory(AUTO_IMAGE_DIR, filename)


# =============================================================
# BASIC HELPERS
# =============================================================

def normalize_text(value):
    if value is None:
        return ""

    return str(value).strip()


def normalize_name(value):
    return " ".join(
        normalize_text(value)
        .upper()
        .split()
    )


def clean_quantity(value):
    """
    JSON-friendly quantity formatting.

    10.0 -> 10
    5.0  -> 5
    2.5  -> 2.5
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


def json_error(
    message,
    status=400,
):
    return (
        jsonify(
            {
                "success": False,
                "message": str(
                    message
                ),
            }
        ),
        status,
    )


# =============================================================
# STORAGE CATEGORY HELPERS
# =============================================================

def read_storage_categories():
    """
    Read storage_categories.json.

    Supported formats:

    {
        "categories": [...]
    }

    or:

    [...]
    """

    if (
        not STORAGE_CATEGORIES_FILE
        .exists()
    ):
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
            "Unable to read storage categories:",
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

    cleaned = []

    for index, record in enumerate(
        records
    ):

        if isinstance(
            record,
            str,
        ):

            category_name = (
                normalize_name(
                    record
                )
            )

            if not category_name:
                continue

            cleaned.append(
                {
                    "id":
                        index + 1,

                    "category":
                        category_name,

                    "productTypes":
                        [],

                    "isDefault":
                        True,
                }
            )

            continue

        if not isinstance(
            record,
            dict,
        ):
            continue

        category_name = (
            normalize_name(
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
        )

        if not category_name:
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

        cleaned_product_types = []

        seen_products = set()

        for product in product_types:

            product_name = (
                normalize_text(
                    product
                )
            )

            if not product_name:
                continue

            product_key = (
                normalize_name(
                    product_name
                )
            )

            if (
                product_key
                in seen_products
            ):
                continue

            seen_products.add(
                product_key
            )

            cleaned_product_types.append(
                product_name
            )

        cleaned.append(
            {
                "id":
                    record.get(
                        "id",
                        index + 1,
                    ),

                "category":
                    category_name,

                "productTypes":
                    cleaned_product_types,

                "isDefault":
                    bool(
                        record.get(
                            "isDefault",
                            record.get(
                                "is_default",
                                True,
                            ),
                        )
                    ),
            }
        )

    return cleaned


def write_storage_categories(
    categories,
):
    """
    Save category master atomically enough for the
    current local/NAS workflow.
    """

    STORAGE_CATEGORIES_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    temporary_file = (
        STORAGE_CATEGORIES_FILE
        .with_suffix(
            ".json.tmp"
        )
    )

    payload = {
        "categories":
            categories
    }

    with temporary_file.open(
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            payload,
            file,
            indent=4,
            ensure_ascii=False,
        )

    temporary_file.replace(
        STORAGE_CATEGORIES_FILE
    )


def category_index_by_name(
    categories,
    category_name,
):
    target = normalize_name(
        category_name
    )

    for index, record in enumerate(
        categories
    ):

        if (
            normalize_name(
                record.get(
                    "category"
                )
            )
            == target
        ):
            return index

    return -1


def clean_product_types(
    values,
):
    if not isinstance(
        values,
        list,
    ):
        return []

    result = []
    seen = set()

    for value in values:

        product_name = (
            normalize_text(
                value
            )
        )

        if not product_name:
            continue

        key = normalize_name(
            product_name
        )

        if key in seen:
            continue

        seen.add(
            key
        )

        result.append(
            product_name
        )

    return result


def next_category_id(
    categories,
):
    highest = 0

    for record in categories:

        try:
            value = int(
                record.get(
                    "id",
                    0,
                )
            )

        except (
            TypeError,
            ValueError,
        ):
            value = 0

        highest = max(
            highest,
            value,
        )

    return highest + 1


# =============================================================
# COMPANY / BRANCH SWITCHER
# =============================================================

@app.context_processor
def inject_branch_context():
    active_key = get_active_branch_key()
    return {
        "branch_options": BRANCHES,
        "active_branch_key": active_key,
        "active_branch_name": get_branch_name(active_key),
    }


@app.route("/switch-branch", methods=["POST"])
def switch_branch():
    branch_key = normalize_text(
        request.form.get("branch", "")
    ).lower()

    if branch_key not in BRANCHES:
        branch_key = DEFAULT_BRANCH_KEY

    session["active_branch"] = branch_key

    return_to = normalize_text(
        request.form.get("return_to", "")
    )

    # Only allow local redirects back inside this application.
    if not return_to.startswith("/") or return_to.startswith("//"):
        return_to = url_for("dashboard")

    return redirect(return_to)


# =============================================================
# PRODUCT IMAGE LOOKUP API
# =============================================================

@app.route("/api/product-image", methods=["GET"])
def api_product_image():
    product_name = normalize_text(
        request.args.get("product_name")
        or request.args.get("name")
    )
    brand = normalize_text(request.args.get("brand"))
    model = normalize_text(request.args.get("model"))

    if not product_name:
        return json_error("Product name is required.", 400)

    cached_info = get_cached_product_image_info(
        product_name, brand, model
    )

    # V3 cached images did not store the originating product webpage.
    # Keep local/manual images as-is, but transparently refresh an old web
    # cache entry once so the UI can show a real source link + match status.
    if cached_info.get("success"):
        has_product_link = bool(cached_info.get("product_url"))

        if has_product_link:
            return jsonify(cached_info)

        search_and_cache_product_image(
            product_name=product_name,
            brand=brand,
            model=model,
            force=True,
        )

        # Read again after enrichment so a manually supplied/local image stays
        # in place while gaining the online product-page metadata.
        refreshed_info = get_cached_product_image_info(
            product_name, brand, model
        )

        if refreshed_info.get("success"):
            return jsonify(refreshed_info)

        return jsonify(cached_info)

    result = search_and_cache_product_image(
        product_name=product_name,
        brand=brand,
        model=model,
    )

    # Image search is optional enrichment. A failed lookup is still
    # a normal 200 response so stock/rack screens never break.
    return jsonify(result)


@app.route("/api/product-preview-image", methods=["GET"])
def api_product_preview_image():
    """Strict product image lookup used only by the Shelf Rack preview.

    Unlike the general enrichment endpoint, this refuses image-only or weak
    matches so the preview cannot silently show a misleading product picture.
    """
    product_name = normalize_text(
        request.args.get("product_name")
        or request.args.get("name")
    )
    brand = normalize_text(request.args.get("brand"))
    model = normalize_text(request.args.get("model"))

    if not product_name:
        return json_error("Product name is required.", 400)

    force_search = str(request.args.get("force") or "").strip().lower() in {"1", "true", "yes"}

    result = search_and_cache_product_image(
        product_name=product_name,
        brand=brand,
        model=model,
        force=force_search,
        strict=True,
    )

    return jsonify(result)


# =============================================================
# DASHBOARD
# =============================================================

@app.route("/")
def dashboard():

    summary = (
        get_dashboard_summary()
    )

    recent_entries = (
        get_recent_stock_entries(
            limit=10
        )
    )

    conn = get_connection()
    cursor = conn.cursor()

    try:

        cursor.execute(
            """
            SELECT COUNT(*) AS total
            FROM import_history
            """
        )

        row = cursor.fetchone()

        total_imports = (
            row["total"]
            if row
            else 0
        )

    finally:

        conn.close()

    branch_overview = []
    for branch_key, branch in BRANCHES.items():
        branch_conn = get_connection(branch_key)
        try:
            product_row = branch_conn.execute(
                """
                SELECT COUNT(*) AS products,
                       COALESCE(SUM(current_quantity), 0) AS quantity
                FROM products
                WHERE COALESCE(is_active, 1) = 1
                """
            ).fetchone()
            today = datetime.now().strftime("%Y-%m-%d")
            movement_row = branch_conn.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN new_quantity > previous_quantity
                        THEN quantity_added ELSE 0 END), 0) AS inward,
                    COALESCE(SUM(CASE WHEN new_quantity < previous_quantity
                        THEN quantity_added ELSE 0 END), 0) AS outward
                FROM stock_entries
                WHERE stock_date = ?
                """,
                (today,),
            ).fetchone()
            branch_overview.append(
                {
                    "key": branch_key,
                    "name": branch["name"],
                    "products": int(product_row["products"] or 0),
                    "quantity": clean_quantity(product_row["quantity"]),
                    "inward": clean_quantity(movement_row["inward"]),
                    "outward": clean_quantity(movement_row["outward"]),
                    "active": branch_key == get_active_branch_key(),
                }
            )
        finally:
            branch_conn.close()

    return render_template(
        "dashboard.html",
        summary=summary,
        recent_entries=recent_entries,
        total_imports=total_imports,
        branch_overview=branch_overview,
        inventory_revision=get_inventory_revision(),
    )


# =============================================================
# ADD STOCK / STOCK MOVEMENT PAGE
# =============================================================

@app.route(
    "/add-stock",
    methods=[
        "GET",
        "POST",
    ],
)
def add_stock_page():

    # ---------------------------------------------------------
    # GET
    #
    # The page is now the Stock Movement screen.
    # ---------------------------------------------------------

    if request.method == "GET":

        return render_template(
            "add_stock.html"
        )

    # ---------------------------------------------------------
    # LEGACY POST
    #
    # Kept temporarily so older forms/import code do not break.
    # New app.js uses /stock-movement.
    # ---------------------------------------------------------

    try:

        result = add_stock(
            product_id=
                request.form.get(
                    "product_id",
                    "",
                ),

            category=
                request.form.get(
                    "category",
                    "",
                ),

            product_name=
                request.form.get(
                    "product_name",
                    "",
                ),

            brand=
                request.form.get(
                    "brand",
                    "",
                ),

            model=
                request.form.get(
                    "model",
                    "",
                ),

            quantity_added=
                request.form.get(
                    "quantity",
                    "",
                ),

            unit=
                request.form.get(
                    "unit",
                    "Nos",
                ),

            location=
                request.form.get(
                    "location",
                    "",
                ),

            source=
                request.form.get(
                    "source",
                    "Manual Entry",
                )
                or "Manual Entry",

            remarks=
                request.form.get(
                    "remarks",
                    "",
                ),
        )

        update_master_stock_excel()

        return jsonify(
            {
                "success": True,
                "message":
                    "Stock added successfully.",
                "result":
                    result,
            }
        )

    except Exception as error:

        return json_error(
            error,
            400,
        )


# =============================================================
# PRODUCT LOOKUP API
#
# NEW:
# app.js calls:
#
# /api/product/GAS-001
#
# before allowing OUTWARD.
# =============================================================

@app.route(
    "/api/product/<product_id>",
    methods=["GET"],
)
def api_get_product(
    product_id,
):

    try:

        product = get_product(
            product_id
        )

        if not product:

            return json_error(
                "Product not found.",
                404,
            )

        if not int(product.get("is_active", 1) or 0):
            return json_error("Product is archived.", 404)

        product = dict(
            product
        )

        product[
            "current_quantity"
        ] = clean_quantity(
            product.get(
                "current_quantity"
            )
        )

        return jsonify(
            {
                "success":
                    True,

                "product":
                    product,
            }
        )

    except Exception as error:

        return json_error(
            error,
            400,
        )


# =============================================================
# SHELF RACK DIRECT PRODUCT EDIT
#
# Scoped to the selected product panel. Existing stock movement
# logic is reused when the user types a new stock quantity.
# =============================================================

@app.route("/api/product/<product_id>/edit", methods=["PUT"])
def api_edit_product(product_id):
    try:
        data = request.get_json(silent=True) or {}
        existing = get_product(product_id)
        if not existing:
            return json_error("Product not found.", 404)

        old_id = normalize_text(existing.get("product_id")).upper()
        new_id = normalize_text(data.get("product_id") or old_id).upper()
        category = normalize_text(data.get("category") if "category" in data else existing.get("category"))
        product_name = normalize_text(data.get("product_name") if "product_name" in data else existing.get("product_name"))
        brand = normalize_text(data.get("brand") if "brand" in data else existing.get("brand"))
        model = normalize_text(data.get("model") if "model" in data else existing.get("model"))
        unit = normalize_text(data.get("unit") if "unit" in data else existing.get("unit")) or "Nos"
        location = normalize_text(data.get("location") if "location" in data else existing.get("location"))

        if not new_id:
            return json_error("Product ID is required.", 400)
        if not category:
            return json_error("Category is required.", 400)
        if not product_name:
            return json_error("Product Name is required.", 400)

        current_quantity = float(existing.get("current_quantity") or 0)
        target_quantity = data.get("current_quantity", current_quantity)
        try:
            target_quantity = float(target_quantity)
        except (TypeError, ValueError):
            return json_error("Stock quantity must be a number.", 400)
        if target_quantity < 0:
            return json_error("Stock quantity cannot be negative.", 400)

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn = get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("BEGIN")
            if new_id != old_id:
                cursor.execute("SELECT 1 FROM products WHERE product_id = ?", (new_id,))
                if cursor.fetchone():
                    raise ValueError(f"Product ID '{new_id}' already exists.")

            cursor.execute(
                """
                UPDATE products
                SET product_id = ?, category = ?, product_name = ?, brand = ?,
                    model = ?, unit = ?, location = ?, updated_at = ?
                WHERE product_id = ?
                """,
                (new_id, category, product_name, brand, model, unit, location, now, old_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("Product could not be updated.")
            if abs(target_quantity - current_quantity) <= 0.0000001:
                bump_inventory_revision(conn=conn)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

        difference = target_quantity - current_quantity
        if abs(difference) > 0.0000001:
            process_stock_movement(
                product_id=new_id,
                movement_type="inward" if difference > 0 else "outward",
                quantity=abs(difference),
                category=category,
                product_name=product_name,
                brand=brand,
                model=model,
                unit=unit,
                location=location,
                reason="rack_direct_edit",
                reason_label="Shelf Rack Direct Edit",
                remarks="Quantity changed directly from Shelf Rack product details.",
                source="Shelf Rack Direct Edit",
            )

        product = get_product(new_id)
        if not product:
            return json_error("Updated product could not be reloaded.", 500)
        product = dict(product)
        product["current_quantity"] = clean_quantity(product.get("current_quantity"))
        return jsonify({"success": True, "product": product})

    except Exception as error:
        return json_error(error, 400)


# =============================================================
# STOCK MOVEMENT
#
# One endpoint for:
#
# ↓ INWARD
# ↑ OUTWARD
# =============================================================

@app.route(
    "/stock-movement",
    methods=["POST"],
)
def stock_movement_api():

    try:

        data = (
            request.get_json(
                silent=True
            )
            or {}
        )

        movement_type = (
            normalize_text(
                data.get(
                    "movement_type"
                )
            )
            .lower()
        )

        if movement_type not in {
            "inward",
            "outward",
        }:

            return json_error(
                (
                    "Movement type must be "
                    "'inward' or 'outward'."
                ),
                400,
            )

        result = (
            process_stock_movement(
                product_id=
                    data.get(
                        "product_id",
                        "",
                    ),

                movement_type=
                    movement_type,

                quantity=
                    data.get(
                        "quantity",
                        0,
                    ),

                category=
                    data.get(
                        "category",
                        "",
                    ),

                product_name=
                    data.get(
                        "product_name",
                        "",
                    ),

                brand=
                    data.get(
                        "brand",
                        "",
                    ),

                model=
                    data.get(
                        "model",
                        "",
                    ),

                unit=
                    data.get(
                        "unit",
                        "Nos",
                    ),

                location=
                    data.get(
                        "location",
                        "",
                    ),

                reason=
                    data.get(
                        "reason",
                        "",
                    ),

                reason_label=
                    data.get(
                        "reason_label",
                        "",
                    ),

                reference=
                    data.get(
                        "reference",
                        "",
                    ),

                remarks=
                    data.get(
                        "remarks",
                        "",
                    ),

                stock_date=
                    data.get(
                        "stock_date"
                    ),

                source=
                    "Add Stock Movement",
            )
        )

        # -----------------------------------------------------
        # Keep exported Master Excel synchronized.
        # -----------------------------------------------------

        try:

            update_master_stock_excel()

        except Exception as excel_error:

            # Database movement has already succeeded.
            # Do not roll it back only because Excel refresh
            # failed.

            print(
                "WARNING: Master Excel refresh failed:",
                excel_error,
            )

        return jsonify(
            {
                "success":
                    True,

                "message":
                    (
                        "Stock inward completed."
                        if movement_type
                        == "inward"
                        else
                        "Stock outward completed."
                    ),

                "result":
                    result,
            }
        )

    except ValueError as error:

        return json_error(
            error,
            400,
        )

    except Exception as error:

        print(
            "STOCK MOVEMENT ERROR:",
            error,
        )

        return json_error(
            error,
            500,
        )


# =============================================================
# SAFE PRODUCT ARCHIVE / RESTORE
# =============================================================

@app.route("/api/product/<product_id>/archive", methods=["POST"])
def api_archive_product(product_id):
    try:
        data = request.get_json(silent=True) or {}
        result = archive_product(product_id, reason=data.get("reason", ""))
        try:
            update_master_stock_excel()
        except Exception as excel_error:
            print("MASTER EXCEL UPDATE WARNING AFTER ARCHIVE:", excel_error)
        return jsonify(
            {
                "success": True,
                "message": "Product removed from active stock. History was preserved.",
                "result": result,
            }
        )
    except Exception as error:
        return json_error(error, 400)


@app.route("/api/product/<product_id>/restore", methods=["POST"])
def api_restore_product(product_id):
    try:
        result = restore_product(product_id)
        try:
            update_master_stock_excel()
        except Exception as excel_error:
            print("MASTER EXCEL UPDATE WARNING AFTER RESTORE:", excel_error)
        return jsonify(
            {
                "success": True,
                "message": "Product restored to active stock.",
                "result": result,
            }
        )
    except Exception as error:
        return json_error(error, 400)


# =============================================================
# CURRENT STOCK
# =============================================================

@app.route(
    "/current-stock"
)
def current_stock():

    show_archived = (
        normalize_text(request.args.get("show", "")).lower()
        == "archived"
    )

    active_branch_key = get_active_branch_key()
    active_branch_name = get_branch_name(active_branch_key)
    active_branch_short = active_branch_name.split(" – ", 1)[0]

    if show_archived:
        products = [
            product
            for product in get_inventory_products(include_archived=True)
            if not int(product.get("is_active", 1) or 0)
        ]
    else:
        products = get_inventory_products()

    # Stock status is derived only from real current quantity.  This app
    # does not yet have a per-product reorder-level field, so the low-stock
    # threshold is deliberately explicit instead of pretending there is one.
    low_stock_threshold = 5.0

    total_products = 0
    in_stock_products = 0
    low_stock_products = 0
    out_of_stock_products = 0

    for product in products:
        product["image_info"] = get_cached_product_image_info(
            product.get("product_name"),
            product.get("brand"),
            product.get("model"),
        )
        product["image_url"] = product["image_info"].get("image_url", "")
        product["rack_mapped"] = is_product_in_storage_master(
            product.get("product_name"),
            product.get("category"),
        )
        product["branch_key"] = active_branch_key
        product["branch_name"] = active_branch_name
        product["branch_short"] = active_branch_short

        try:
            quantity = float(product.get("current_quantity") or 0)
        except (TypeError, ValueError):
            quantity = 0.0

        if quantity <= 0:
            status_key = "out"
            status_label = "Out of Stock"
            out_of_stock_products += 1
        elif quantity <= low_stock_threshold:
            status_key = "low"
            status_label = "Low Stock"
            low_stock_products += 1
        else:
            status_key = "in"
            status_label = "In Stock"
            in_stock_products += 1

        product["stock_status_key"] = status_key
        product["stock_status_label"] = status_label

        updated_raw = normalize_text(product.get("updated_at"))
        product["updated_display"] = updated_raw or "—"
        if updated_raw:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                try:
                    updated_dt = datetime.strptime(updated_raw[:19], fmt)
                    product["updated_display"] = updated_dt.strftime("%d %b %Y · %I:%M %p")
                    break
                except ValueError:
                    continue

        total_products += 1

    dashboard_summary = get_dashboard_summary()

    branch_overview = []
    for branch_key, branch in BRANCHES.items():
        branch_conn = get_connection(branch_key)
        try:
            row = branch_conn.execute(
                """
                SELECT COUNT(*) AS products,
                       COALESCE(SUM(current_quantity), 0) AS quantity
                FROM products
                WHERE COALESCE(is_active, 1) = 1
                """
            ).fetchone()
            branch_overview.append(
                {
                    "key": branch_key,
                    "name": branch["name"],
                    "short_name": branch["name"].split(" – ", 1)[0],
                    "products": int(row["products"] or 0),
                    "quantity": clean_quantity(row["quantity"]),
                    "active": branch_key == active_branch_key,
                }
            )
        finally:
            branch_conn.close()

    return render_template(
        "current_stock.html",
        products=products,
        show_archived=show_archived,
        active_branch_short=active_branch_short,
        branch_overview=branch_overview,
        low_stock_threshold=clean_quantity(low_stock_threshold),
        stock_metrics={
            "total_products": total_products,
            "in_stock_products": in_stock_products,
            "low_stock_products": low_stock_products,
            "out_of_stock_products": out_of_stock_products,
            "inward_today": dashboard_summary.get("stock_added_today", 0),
            "outward_today": dashboard_summary.get("stock_outward_today", 0),
            "available_quantity": dashboard_summary.get("total_stock_quantity", 0),
        },
    )


# =============================================================
# 3D STORAGE VIEW
#
# IMPORTANT:
# get_all_products() now returns only active
# storage-master products.
# =============================================================

@app.route(
    "/storage-view"
)
def storage_view():

    # Keep the existing Open Rack/category experience on its original
    # filtered product set, but give the Shelf Rack access to every active
    # product in the selected branch. This fixes the old problem where a
    # newly-added inventory product could not be attached to a shelf.
    products = get_all_products()
    shelf_inventory = get_inventory_products()

    for product in shelf_inventory:
        product["image_info"] = get_cached_product_image_info(
            product.get("product_name"),
            product.get("brand"),
            product.get("model"),
        )
        product["image_url"] = product["image_info"].get("image_url", "")

    return render_template(
        "storage_view.html",
        products=products,
        shelf_inventory=shelf_inventory,
        shelf_rack_state=get_shelf_rack_state(),
    )


# =============================================================
# SHARED SHELF / RACK POSITION API
#
# These endpoints change only physical shelf placement. They never alter
# stock quantity. All data is branch-scoped through get_connection().
# =============================================================

@app.route("/api/shelf-rack/state", methods=["GET"])
def api_shelf_rack_state():
    return jsonify({"success": True, "state": get_shelf_rack_state()})


@app.route("/api/shelf-rack/assign", methods=["POST"])
def api_shelf_rack_assign():
    try:
        data = request.get_json(silent=True) or {}
        result = assign_product_to_shelf(
            data.get("product_id", ""),
            data.get("rack_number"),
            data.get("shelf_number"),
        )
        return jsonify({"success": True, "assignment": result})
    except ValueError as error:
        return json_error(error, 400)
    except Exception as error:
        return json_error(error, 500)


@app.route("/api/shelf-rack/unassign", methods=["POST"])
def api_shelf_rack_unassign():
    try:
        data = request.get_json(silent=True) or {}
        result = unassign_product_from_shelf(data.get("product_id", ""))
        return jsonify({"success": True, "result": result})
    except ValueError as error:
        return json_error(error, 400)
    except Exception as error:
        return json_error(error, 500)


@app.route("/api/shelf-rack/layout", methods=["POST"])
def api_shelf_rack_layout():
    try:
        data = request.get_json(silent=True) or {}
        result = set_shelf_rack_count(data.get("rack_count"))
        return jsonify({"success": True, "layout": result})
    except ValueError as error:
        return json_error(error, 400)
    except Exception as error:
        return json_error(error, 500)


# =============================================================
# STORAGE CATEGORIES API
# =============================================================

@app.route(
    "/api/storage-categories",
    methods=["GET"],
)
def storage_categories_list():

    categories = (
        read_storage_categories()
    )

    return jsonify(
        {
            "success":
                True,

            "categories":
                categories,
        }
    )


# =============================================================
# CREATE CATEGORY
# =============================================================

@app.route(
    "/api/storage-categories",
    methods=["POST"],
)
def storage_category_create():

    try:

        data = (
            request.get_json(
                silent=True
            )
            or {}
        )

        category_name = (
            normalize_name(
                data.get(
                    "category"
                )
                or data.get(
                    "category_name"
                )
            )
        )

        product_types = (
            clean_product_types(
                data.get(
                    "productTypes"
                )
                or data.get(
                    "product_types"
                )
                or []
            )
        )

        if not category_name:

            return json_error(
                "Category name is required."
            )

        if not product_types:

            return json_error(
                (
                    "Add at least one product type "
                    "to the category."
                )
            )

        categories = (
            read_storage_categories()
        )

        if (
            category_index_by_name(
                categories,
                category_name,
            )
            >= 0
        ):

            return json_error(
                "That category already exists."
            )

        record = {
            "id":
                next_category_id(
                    categories
                ),

            "category":
                category_name,

            "productTypes":
                product_types,

            "isDefault":
                False,
        }

        categories.append(
            record
        )

        write_storage_categories(
            categories
        )

        return (
            jsonify(
                {
                    "success":
                        True,

                    "message":
                        "Category created successfully.",

                    "category":
                        record,
                }
            ),
            201,
        )

    except Exception as error:

        return json_error(
            error,
            400,
        )


# =============================================================
# UPDATE CATEGORY
# =============================================================

@app.route(
    "/api/storage-categories/<path:category_name>",
    methods=["PUT"],
)
def storage_category_update(
    category_name,
):

    try:

        data = (
            request.get_json(
                silent=True
            )
            or {}
        )

        categories = (
            read_storage_categories()
        )

        index = (
            category_index_by_name(
                categories,
                category_name,
            )
        )

        if index < 0:

            return json_error(
                "Storage category not found.",
                404,
            )

        old_record = (
            categories[
                index
            ]
        )

        old_name = (
            normalize_name(
                old_record.get(
                    "category"
                )
            )
        )

        new_name = (
            normalize_name(
                data.get(
                    "category"
                )
                or data.get(
                    "category_name"
                )
                or old_name
            )
        )

        product_types = (
            clean_product_types(
                data.get(
                    "productTypes"
                )
                or data.get(
                    "product_types"
                )
                or old_record.get(
                    "productTypes"
                )
                or []
            )
        )

        if not new_name:

            return json_error(
                "Category name is required."
            )

        if not product_types:

            return json_error(
                (
                    "Add at least one product type "
                    "to the category."
                )
            )

        duplicate_index = (
            category_index_by_name(
                categories,
                new_name,
            )
        )

        if (
            duplicate_index >= 0
            and
            duplicate_index != index
        ):

            return json_error(
                "Another category already uses that name."
            )

        updated_record = {
            "id":
                old_record.get(
                    "id",
                    index + 1,
                ),

            "category":
                new_name,

            "productTypes":
                product_types,

            "isDefault":
                bool(
                    old_record.get(
                        "isDefault",
                        False,
                    )
                ),
        }

        # -----------------------------------------------------
        # If category was renamed, update registered products
        # too so they do not disappear from active inventory.
        # -----------------------------------------------------

        conn = get_connection()

        try:

            cursor = conn.cursor()

            if new_name != old_name:

                cursor.execute(
                    """
                    UPDATE products

                    SET category = ?,
                        updated_at =
                            datetime('now', 'localtime')

                    WHERE UPPER(TRIM(category))
                        = UPPER(TRIM(?))
                    """,
                    (
                        new_name,
                        old_name,
                    ),
                )

            conn.commit()

        except Exception:

            conn.rollback()
            raise

        finally:

            conn.close()

        categories[
            index
        ] = updated_record

        write_storage_categories(
            categories
        )

        return jsonify(
            {
                "success":
                    True,

                "message":
                    "Category updated successfully.",

                "category":
                    updated_record,
            }
        )

    except Exception as error:

        return json_error(
            error,
            400,
        )


# =============================================================
# DELETE CATEGORY
#
# Default categories remain protected.
# Custom categories with registered stock/products are also
# protected so records cannot accidentally become orphaned.
# =============================================================

@app.route(
    "/api/storage-categories/<path:category_name>",
    methods=["DELETE"],
)
def storage_category_delete(
    category_name,
):

    try:

        categories = (
            read_storage_categories()
        )

        index = (
            category_index_by_name(
                categories,
                category_name,
            )
        )

        if index < 0:

            return json_error(
                "Storage category not found.",
                404,
            )

        record = (
            categories[
                index
            ]
        )

        if bool(
            record.get(
                "isDefault",
                False,
            )
        ):

            return json_error(
                (
                    "Default categories cannot "
                    "be deleted."
                ),
                400,
            )

        actual_category_name = (
            normalize_name(
                record.get(
                    "category"
                )
            )
        )

        # -----------------------------------------------------
        # Do not delete a category containing registered DB
        # products.
        # -----------------------------------------------------

        conn = get_connection()
        cursor = conn.cursor()

        try:

            cursor.execute(
                """
                SELECT COUNT(*) AS total
                FROM products
                WHERE UPPER(TRIM(category))
                    = UPPER(TRIM(?))
                """,
                (
                    actual_category_name,
                ),
            )

            row = cursor.fetchone()

            registered_count = (
                row["total"]
                if row
                else 0
            )

        finally:

            conn.close()

        if registered_count > 0:

            return json_error(
                (
                    "This category contains "
                    f"{registered_count} registered "
                    "product(s). Move or remove those "
                    "products before deleting the category."
                ),
                400,
            )

        removed = categories.pop(
            index
        )

        write_storage_categories(
            categories
        )

        return jsonify(
            {
                "success":
                    True,

                "message":
                    "Category deleted successfully.",

                "category":
                    removed,
            }
        )

    except Exception as error:

        return json_error(
            error,
            400,
        )


# =============================================================
# EXCEL IMPORT TEMPLATE
# =============================================================

@app.route("/download-import-template")
def download_import_template():
    return send_file(
        BytesIO(get_excel_template_bytes()),
        as_attachment=True,
        download_name="NUNES_Stock_Import_Template.xlsx",
        mimetype=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
    )


# =============================================================
# EXCEL IMPORT
# =============================================================

@app.route(
    "/import-excel",
    methods=[
        "GET",
        "POST",
    ],
)
def import_excel():

    if request.method == "POST":

        uploaded_file = (
            request.files.get(
                "excel_file"
            )
        )

        if not uploaded_file:

            flash(
                "Please select an Excel file.",
                "error",
            )

            return redirect(
                url_for(
                    "import_excel"
                )
            )

        if not (
            uploaded_file
            .filename
            .lower()
            .endswith(
                ".xlsx"
            )
        ):

            flash(
                "Please upload an .xlsx file.",
                "error",
            )

            return redirect(
                url_for(
                    "import_excel"
                )
            )

        try:

            upload_path = (
                BASE_DIR
                / "uploads"
                / Path(
                    uploaded_file.filename
                ).name
            )

            upload_path.parent.mkdir(
                parents=True,
                exist_ok=True,
            )

            uploaded_file.save(
                upload_path
            )

            dataframe = (
                read_excel_file(
                    upload_path
                )
            )

            preview = (
                prepare_preview(
                    dataframe
                )
            )

            result = (
                import_excel_to_database(
                    upload_path
                )
            )

            # Refresh exported master.
            update_master_stock_excel()

            flash(
                (
                    "Import completed. "
                    f"{result['success_rows']} "
                    "rows saved."
                ),
                "success",
            )

            return render_template(
                "import_excel.html",

                preview=
                    preview.to_dict(
                        orient="records"
                    ),

                result=
                    result,
            )

        except Exception as error:

            flash(
                str(error),
                "error",
            )

    return render_template(
        "import_excel.html",
        preview=None,
        result=None,
    )


# =============================================================
# IMPORT / STOCK HISTORY PAGE
# =============================================================

@app.route(
    "/import-history"
)
def import_history():
    """Branch-aware stock movement ledger plus Excel import history.

    The navigation label has always said Stock History, so this page now
    surfaces the real stock_entries ledger first instead of showing only
    Excel uploads.  Excel import history remains available as a second tab.
    """

    active_branch_key = get_active_branch_key()
    active_branch_name = get_branch_name(active_branch_key)
    active_branch_short = active_branch_name.split(" – ", 1)[0]

    movements = get_stock_history(limit=5000)

    total_inward_qty = 0.0
    total_outward_qty = 0.0
    products_touched = set()

    for row in movements:
        movement_type = normalize_text(row.get("movement_type")).lower()
        quantity = float(row.get("quantity_added") or 0)

        if movement_type == "outward":
            total_outward_qty += quantity
            row["movement_label"] = "Outward"
            row["movement_sign"] = "-"
        else:
            total_inward_qty += quantity
            row["movement_label"] = "Inward"
            row["movement_sign"] = "+"
            row["movement_type"] = "inward"

        product_id = normalize_text(row.get("product_id"))
        if product_id:
            products_touched.add(product_id)

        source = normalize_text(row.get("source"))
        if row.get("import_id"):
            row["source_key"] = "excel"
            row["source_label"] = "Excel Import"
        else:
            row["source_key"] = "manual"
            row["source_label"] = source or "Stock Movement"

        remarks = normalize_text(row.get("remarks"))
        reference = ""
        detail_parts = []
        if remarks:
            for raw_part in remarks.split("|"):
                part = raw_part.strip()
                if not part or part.upper() in {"INWARD", "OUTWARD"}:
                    continue
                if part.lower().startswith("reference:"):
                    reference = part.split(":", 1)[1].strip()
                    continue
                detail_parts.append(part)

        row["reference"] = reference or normalize_text(row.get("entry_number"))
        row["details_display"] = " · ".join(detail_parts) or "—"

        timestamp = normalize_text(row.get("created_at"))
        date_key = normalize_text(row.get("stock_date"))
        row["date_key"] = (timestamp[:10] if len(timestamp) >= 10 else date_key[:10])
        row["date_display"] = timestamp or date_key or "—"
        if timestamp:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
                try:
                    parsed = datetime.strptime(timestamp[:19], fmt)
                    row["date_display"] = parsed.strftime("%d %b %Y · %I:%M %p")
                    break
                except ValueError:
                    continue

    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT *
            FROM import_history
            ORDER BY id DESC
            """
        )
        imports = [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

    return render_template(
        "import_history.html",
        movements=movements,
        imports=imports,
        active_branch_short=active_branch_short,
        history_metrics={
            "total_movements": len(movements),
            "inward_quantity": clean_quantity(total_inward_qty),
            "outward_quantity": clean_quantity(total_outward_qty),
            "products_touched": len(products_touched),
            "excel_imports": len(imports),
        },
    )


# =============================================================
# DOWNLOAD MASTER EXCEL
# =============================================================

@app.route(
    "/download-master-stock"
)
def download_master_stock():

    update_master_stock_excel()

    master_file = get_master_stock_file()

    return send_file(
        master_file,
        as_attachment=True,
        download_name=
            "Master_Stock.xlsx",
    )


# =============================================================
# NO-CACHE HEADERS
#
# Useful while we are actively changing JS / HTML.
# =============================================================

@app.after_request
def add_no_cache_headers(
    response,
):

    response.headers[
        "Cache-Control"
    ] = (
        "no-store, no-cache, "
        "must-revalidate, max-age=0"
    )

    response.headers[
        "Pragma"
    ] = "no-cache"

    response.headers[
        "Expires"
    ] = "0"

    return response


# =============================================================
# RUN
# =============================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5055,
        debug=False,
    )