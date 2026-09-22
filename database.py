import sqlite3
from pathlib import Path
from datetime import datetime

from runtime_paths import DB_DIR

BASE_DIR = Path(__file__).resolve().parent

# =============================================================
# COMPANY / BRANCH DATASETS
#
# The original main branch keeps using stock.db so all existing
# stock remains exactly where it is. The two additional branches
# use their own SQLite files, which allows the same Product ID to
# exist independently in every branch without changing the stock
# workflow or table structure.
# =============================================================

BRANCHES = {
    "main": {
        "name": "Rathinapuri – Nunes Instrumentation",
        "slug": "main",
        "database": "stock.db",
    },
    "gobalapuram": {
        "name": "Gopalapuram – Nunes Instrumentation",
        "slug": "gobalapuram",
        "database": "stock_gobalapuram.db",
    },
    "gandhipuram": {
        "name": "Gandhipuram – Nunes Instrumentation",
        "slug": "gandhipuram",
        "database": "stock_gandhipuram.db",
    },
}

DEFAULT_BRANCH_KEY = "main"
DB_PATH = DB_DIR / BRANCHES[DEFAULT_BRANCH_KEY]["database"]


def get_active_branch_key():
    """
    Return the branch selected in the current browser session.
    Outside a Flask request (startup/tests/scripts), the existing
    main branch remains the safe default.
    """
    try:
        from flask import has_request_context, session

        if has_request_context():
            branch_key = str(
                session.get("active_branch", DEFAULT_BRANCH_KEY)
            ).strip().lower()

            if branch_key in BRANCHES:
                return branch_key
    except Exception:
        pass

    return DEFAULT_BRANCH_KEY


def normalize_branch_key(branch_key=None):
    key = str(branch_key or get_active_branch_key()).strip().lower()
    return key if key in BRANCHES else DEFAULT_BRANCH_KEY


def get_branch_info(branch_key=None):
    key = normalize_branch_key(branch_key)
    return dict(BRANCHES[key])


def get_branch_name(branch_key=None):
    return get_branch_info(branch_key)["name"]


def get_branch_slug(branch_key=None):
    return get_branch_info(branch_key)["slug"]


def get_database_path(branch_key=None):
    key = normalize_branch_key(branch_key)
    return str(DB_DIR / BRANCHES[key]["database"])


def get_connection(branch_key=None):
    """
    Create and return a SQLite database connection for the currently
    selected company/branch. Existing callers do not need to change.
    """
    database_path = Path(get_database_path(branch_key))
    database_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(database_path, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 15000;")
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    return conn


def init_database(branch_key=None):
    """
    Create all required tables for one branch if they do not exist.
    """
    conn = get_connection(branch_key)
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            product_id TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            product_name TEXT NOT NULL,

            brand TEXT,
            model TEXT,

            unit TEXT NOT NULL DEFAULT 'Nos',
            location TEXT,

            current_quantity REAL NOT NULL DEFAULT 0
                CHECK (current_quantity >= 0),

            is_active INTEGER NOT NULL DEFAULT 1,
            archived_at TEXT,

            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS import_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            import_number TEXT UNIQUE,

            file_name TEXT NOT NULL,
            original_file_name TEXT,

            total_rows INTEGER NOT NULL DEFAULT 0,
            success_rows INTEGER NOT NULL DEFAULT 0,
            failed_rows INTEGER NOT NULL DEFAULT 0,

            total_quantity_added REAL NOT NULL DEFAULT 0,

            status TEXT NOT NULL DEFAULT 'Processing',

            imported_at TEXT NOT NULL
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS stock_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            entry_number TEXT UNIQUE,

            product_id TEXT NOT NULL,

            previous_quantity REAL NOT NULL DEFAULT 0,
            quantity_added REAL NOT NULL
                CHECK (quantity_added > 0),
            new_quantity REAL NOT NULL,

            stock_date TEXT NOT NULL,

            import_id INTEGER,
            excel_row INTEGER,

            source TEXT DEFAULT 'Excel Import',
            remarks TEXT,

            created_at TEXT NOT NULL,

            FOREIGN KEY (product_id)
                REFERENCES products(product_id)
                ON UPDATE CASCADE
                ON DELETE RESTRICT,

            FOREIGN KEY (import_id)
                REFERENCES import_history(id)
                ON DELETE SET NULL
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS shelf_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id TEXT NOT NULL UNIQUE,
            rack_number INTEGER NOT NULL CHECK (rack_number >= 1),
            shelf_number INTEGER NOT NULL CHECK (shelf_number >= 1),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (product_id)
                REFERENCES products(product_id)
                ON UPDATE CASCADE
                ON DELETE CASCADE
        );
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_shelf_positions_rack_shelf
        ON shelf_positions(rack_number, shelf_number);
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS import_errors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            import_id INTEGER NOT NULL,
            excel_row INTEGER,

            product_id TEXT,
            product_name TEXT,

            error_message TEXT NOT NULL,

            created_at TEXT NOT NULL,

            FOREIGN KEY (import_id)
                REFERENCES import_history(id)
                ON DELETE CASCADE
        );
        """
    )

    # ---------------------------------------------------------
    # Safe schema upgrades for databases created by older releases.
    # SQLite ALTER TABLE ADD COLUMN is non-destructive and preserves
    # every existing stock row and stock history record.
    # ---------------------------------------------------------
    product_columns = {
        row["name"]
        for row in cursor.execute("PRAGMA table_info(products);").fetchall()
    }
    if "is_active" not in product_columns:
        cursor.execute(
            "ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;"
        )
    if "archived_at" not in product_columns:
        cursor.execute(
            "ALTER TABLE products ADD COLUMN archived_at TEXT;"
        )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS app_state (
            state_key TEXT PRIMARY KEY,
            state_value INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        );
        """
    )
    cursor.execute(
        """
        INSERT OR IGNORE INTO app_state (state_key, state_value, updated_at)
        VALUES ('inventory_revision', 0, ?);
        """,
        (get_current_timestamp(),),
    )
    cursor.execute(
        """
        INSERT OR IGNORE INTO app_state (state_key, state_value, updated_at)
        VALUES ('shelf_rack_count', 3, ?);
        """,
        (get_current_timestamp(),),
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            product_id TEXT,
            details TEXT,
            created_at TEXT NOT NULL
        );
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_products_product_id
        ON products(product_id);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_products_product_name
        ON products(product_name);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_products_category
        ON products(category);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_products_is_active
        ON products(is_active);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_stock_entries_product_id
        ON stock_entries(product_id);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_stock_entries_created_at
        ON stock_entries(created_at);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_import_history_imported_at
        ON import_history(imported_at);
        """
    )

    conn.commit()
    conn.close()


def get_inventory_revision(branch_key=None):
    """Return the monotonic inventory revision used by live browser clients."""
    conn = get_connection(branch_key)
    try:
        row = conn.execute(
            "SELECT state_value FROM app_state WHERE state_key = 'inventory_revision';"
        ).fetchone()
        return int(row["state_value"] if row else 0)
    finally:
        conn.close()


def bump_inventory_revision(branch_key=None, conn=None):
    """Increment inventory revision, optionally inside an existing transaction."""
    owns_connection = conn is None
    if owns_connection:
        conn = get_connection(branch_key)
    now = get_current_timestamp()
    try:
        conn.execute(
            """
            INSERT INTO app_state (state_key, state_value, updated_at)
            VALUES ('inventory_revision', 1, ?)
            ON CONFLICT(state_key) DO UPDATE SET
                state_value = app_state.state_value + 1,
                updated_at = excluded.updated_at;
            """,
            (now,),
        )
        row = conn.execute(
            "SELECT state_value FROM app_state WHERE state_key = 'inventory_revision';"
        ).fetchone()
        if owns_connection:
            conn.commit()
        return int(row["state_value"] if row else 0)
    except Exception:
        if owns_connection:
            conn.rollback()
        raise
    finally:
        if owns_connection:
            conn.close()


def record_audit_event(action, product_id="", details="", branch_key=None, conn=None):
    """Write a compact append-only audit record without deleting business history."""
    owns_connection = conn is None
    if owns_connection:
        conn = get_connection(branch_key)
    try:
        conn.execute(
            """
            INSERT INTO audit_log (action, product_id, details, created_at)
            VALUES (?, ?, ?, ?);
            """,
            (
                str(action or "").strip(),
                str(product_id or "").strip(),
                str(details or "").strip(),
                get_current_timestamp(),
            ),
        )
        if owns_connection:
            conn.commit()
    except Exception:
        if owns_connection:
            conn.rollback()
        raise
    finally:
        if owns_connection:
            conn.close()


def init_all_branch_databases():
    """Ensure every configured branch has a ready database."""
    for branch_key in BRANCHES:
        init_database(branch_key)


def database_exists(branch_key=None):
    return Path(get_database_path(branch_key)).exists()


def get_current_timestamp():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def test_connection(branch_key=None):
    try:
        conn = get_connection(branch_key)
        cursor = conn.cursor()
        cursor.execute("SELECT 1;")
        result = cursor.fetchone()
        conn.close()
        return result[0] == 1
    except sqlite3.Error as error:
        print(f"Database connection error: {error}")
        return False


def get_table_names(branch_key=None):
    conn = get_connection(branch_key)
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name;
        """
    )

    tables = [row["name"] for row in cursor.fetchall()]
    conn.close()
    return tables


def get_database_summary(branch_key=None):
    conn = get_connection(branch_key)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) AS total FROM products WHERE COALESCE(is_active, 1) = 1;")
    total_products = cursor.fetchone()["total"]

    cursor.execute(
        """
        SELECT COALESCE(SUM(current_quantity), 0) AS total
        FROM products
        WHERE COALESCE(is_active, 1) = 1;
        """
    )
    total_quantity = cursor.fetchone()["total"]

    cursor.execute("SELECT COUNT(*) AS total FROM stock_entries;")
    total_stock_entries = cursor.fetchone()["total"]

    cursor.execute("SELECT COUNT(*) AS total FROM import_history;")
    total_imports = cursor.fetchone()["total"]

    cursor.execute("SELECT COUNT(*) AS total FROM import_errors;")
    total_errors = cursor.fetchone()["total"]

    conn.close()

    return {
        "total_products": total_products,
        "total_quantity": total_quantity,
        "total_stock_entries": total_stock_entries,
        "total_imports": total_imports,
        "total_errors": total_errors,
    }


if __name__ == "__main__":
    print("Initializing Stock Management Databases...")
    init_all_branch_databases()

    for branch_key, branch in BRANCHES.items():
        print(f"\n{branch['name']}")
        print(f"Database Path: {get_database_path(branch_key)}")
        print(
            "Database connection: SUCCESS"
            if test_connection(branch_key)
            else "Database connection: FAILED"
        )
        print("Tables:", ", ".join(get_table_names(branch_key)))
        print("Summary:", get_database_summary(branch_key))
