import streamlit as st

from database import init_database
from stock_service import get_dashboard_summary, get_recent_stock_entries


st.set_page_config(
    page_title="Instrument Stock Management",
    page_icon="📦",
    layout="wide",
)

init_database()

st.title("Instrument Stock Management")
st.caption("Simple stock storage and Excel import system")

summary = get_dashboard_summary()

col1, col2, col3 = st.columns(3)

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

st.divider()

st.subheader("Quick Actions")

col1, col2 = st.columns(2)

with col1:
    st.page_link(
        "pages/upload_stock.py",
        label="Upload New Stock Excel",
        icon="📤",
        use_container_width=True,
    )

with col2:
    st.page_link(
        "pages/current_stock.py",
        label="View Current Stock",
        icon="📦",
        use_container_width=True,
    )

st.divider()

st.subheader("Recent Stock Entries")

recent_entries = get_recent_stock_entries(limit=10)

if recent_entries:

    table_data = []

    for row in recent_entries:
        table_data.append(
            {
                "Entry": row["entry_number"],
                "Product ID": row["product_id"],
                "Product Name": row["product_name"],
                "Qty Added": row["quantity_added"],
                "Previous Stock": row["previous_quantity"],
                "New Stock": row["new_quantity"],
                "Date": row["stock_date"],
            }
        )

    st.dataframe(
        table_data,
        use_container_width=True,
        hide_index=True,
    )

else:
    st.info("No stock entries available yet.")