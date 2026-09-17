import streamlit as st
import pandas as pd

from database import init_database, get_connection

st.set_page_config(
    page_title="Import History",
    page_icon="📁",
    layout="wide",
)

init_database()

st.title("Import History")
st.caption("View all Excel stock imports and failed rows")

conn = get_connection()

imports_df = pd.read_sql_query(
    """
    SELECT
        id,
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
    """,
    conn,
)

conn.close()

if imports_df.empty:
    st.info("No Excel files have been imported yet.")
    st.stop()

display_df = imports_df.drop(columns=["id"])

display_df = display_df.rename(
    columns={
        "import_number": "Import No",
        "file_name": "File Name",
        "total_rows": "Total Rows",
        "success_rows": "Success Rows",
        "failed_rows": "Failed Rows",
        "total_quantity_added": "Quantity Added",
        "status": "Status",
        "imported_at": "Imported At",
    }
)

st.subheader("All Imports")

st.dataframe(
    display_df,
    use_container_width=True,
    hide_index=True,
)

st.divider()

st.subheader("View Import Details")

import_numbers = imports_df["import_number"].tolist()

selected_import = st.selectbox(
    "Select Import",
    import_numbers,
)

selected_row = imports_df[
    imports_df["import_number"] == selected_import
].iloc[0]

import_id = int(selected_row["id"])

col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric(
        "Total Rows",
        int(selected_row["total_rows"]),
    )

with col2:
    st.metric(
        "Success",
        int(selected_row["success_rows"]),
    )

with col3:
    st.metric(
        "Failed",
        int(selected_row["failed_rows"]),
    )

with col4:
    st.metric(
        "Quantity Added",
        selected_row["total_quantity_added"],
    )

st.write(
    f"**File:** {selected_row['file_name']}"
)

st.write(
    f"**Status:** {selected_row['status']}"
)

st.write(
    f"**Imported At:** {selected_row['imported_at']}"
)

st.divider()

st.subheader("Imported Stock Rows")

conn = get_connection()

stock_df = pd.read_sql_query(
    """
    SELECT
        entry_number,
        product_id,
        previous_quantity,
        quantity_added,
        new_quantity,
        stock_date,
        excel_row,
        remarks,
        created_at
    FROM stock_entries
    WHERE import_id = ?
    ORDER BY excel_row ASC
    """,
    conn,
    params=(import_id,),
)

conn.close()

if not stock_df.empty:
    stock_df = stock_df.rename(
        columns={
            "entry_number": "Entry",
            "product_id": "Product ID",
            "previous_quantity": "Previous Stock",
            "quantity_added": "Qty Added",
            "new_quantity": "New Stock",
            "stock_date": "Stock Date",
            "excel_row": "Excel Row",
            "remarks": "Remarks",
            "created_at": "Created At",
        }
    )

    st.dataframe(
        stock_df,
        use_container_width=True,
        hide_index=True,
    )

else:
    st.info("No successful stock rows found for this import.")

st.divider()

st.subheader("Failed Rows")

conn = get_connection()

errors_df = pd.read_sql_query(
    """
    SELECT
        excel_row,
        product_id,
        product_name,
        error_message,
        created_at
    FROM import_errors
    WHERE import_id = ?
    ORDER BY excel_row ASC
    """,
    conn,
    params=(import_id,),
)

conn.close()

if not errors_df.empty:
    errors_df = errors_df.rename(
        columns={
            "excel_row": "Excel Row",
            "product_id": "Product ID",
            "product_name": "Product Name",
            "error_message": "Error",
            "created_at": "Created At",
        }
    )

    st.dataframe(
        errors_df,
        use_container_width=True,
        hide_index=True,
    )

else:
    st.success("No failed rows for this import.")