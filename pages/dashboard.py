import streamlit as st
import pandas as pd

from database import init_database, get_connection
from stock_service import (
    get_dashboard_summary,
    get_recent_stock_entries,
)

st.set_page_config(
    page_title="Dashboard",
    page_icon="📊",
    layout="wide",
)

init_database()

st.title("Stock Dashboard")
st.caption("Overview of instrument stock and recent activity")

summary = get_dashboard_summary()

col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric(
        "Total Products",
        summary["total_products"],
    )

with col2:
    st.metric(
        "Total Stock Quantity",
        summary["total_stock_quantity"],
    )

with col3:
    st.metric(
        "Stock Added Today",
        summary["stock_added_today"],
    )

with col4:
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT COUNT(*) AS total
        FROM import_history
        """
    )

    total_imports = cursor.fetchone()["total"]
    conn.close()

    st.metric(
        "Excel Imports",
        total_imports,
    )

st.divider()

st.subheader("Recent Stock Entries")

recent_entries = get_recent_stock_entries(limit=15)

if recent_entries:
    df = pd.DataFrame(recent_entries)

    display_columns = [
        "entry_number",
        "product_id",
        "product_name",
        "category",
        "quantity_added",
        "previous_quantity",
        "new_quantity",
        "stock_date",
        "source",
    ]

    df = df[display_columns]

    df = df.rename(
        columns={
            "entry_number": "Entry",
            "product_id": "Product ID",
            "product_name": "Product Name",
            "category": "Category",
            "quantity_added": "Qty Added",
            "previous_quantity": "Previous Stock",
            "new_quantity": "New Stock",
            "stock_date": "Date",
            "source": "Source",
        }
    )

    st.dataframe(
        df,
        use_container_width=True,
        hide_index=True,
    )

else:
    st.info("No stock entries available yet.")

st.divider()

st.subheader("Recent Excel Imports")

conn = get_connection()

imports_df = pd.read_sql_query(
    """
    SELECT
        import_number,
        file_name,
        total_rows,
        success_rows,
        failed_rows,
        total_quantity_added,
        status,
        imported_at
    FROM import_history
    ORDER BY id DESC
    LIMIT 10
    """,
    conn,
)

conn.close()

if not imports_df.empty:
    imports_df = imports_df.rename(
        columns={
            "import_number": "Import No",
            "file_name": "File Name",
            "total_rows": "Total Rows",
            "success_rows": "Success",
            "failed_rows": "Failed",
            "total_quantity_added": "Qty Added",
            "status": "Status",
            "imported_at": "Imported At",
        }
    )

    st.dataframe(
        imports_df,
        use_container_width=True,
        hide_index=True,
    )

else:
    st.info("No Excel imports found.")