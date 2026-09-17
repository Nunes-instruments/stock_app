import streamlit as st
import pandas as pd

from database import init_database
from stock_service import (
    get_all_products,
    search_products,
)


st.set_page_config(
    page_title="Current Stock",
    page_icon="📦",
    layout="wide",
)

init_database()

st.title("Current Stock")

search_text = st.text_input(
    "Search Product ID, Product Name, Model, Brand or Category"
)

if search_text:
    products = search_products(
        search_text
    )
else:
    products = get_all_products()

if products:

    dataframe = pd.DataFrame(
        products
    )

    display_columns = [
        "product_id",
        "category",
        "product_name",
        "brand",
        "model",
        "current_quantity",
        "unit",
        "location",
        "updated_at",
    ]

    dataframe = dataframe[
        display_columns
    ]

    dataframe.columns = [
        "Product ID",
        "Category",
        "Product Name",
        "Brand",
        "Model",
        "Current Stock",
        "Unit",
        "Location",
        "Last Updated",
    ]

    st.dataframe(
        dataframe,
        use_container_width=True,
        hide_index=True,
    )

else:

    st.info(
        "No products found."
    )