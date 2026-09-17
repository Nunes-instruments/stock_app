import streamlit as st

from database import init_database
from stock_service import add_stock
from excel_handler import update_master_stock_excel


st.set_page_config(
    page_title="Add Product",
    page_icon="➕",
    layout="wide",
)

init_database()

st.title("Add New Stock")
st.caption(
    "Enter product details manually. "
    "The stock will be saved in the database and Excel."
)


with st.form("add_product_form"):

    col1, col2 = st.columns(2)

    with col1:

        product_id = st.text_input(
            "Product ID *",
            placeholder="LAB0026",
        )

        category = st.selectbox(
            "Category *",
            [
                "Laboratory Instruments",
                "Civil Construction Instruments",
                "Other",
            ],
        )

        product_name = st.text_input(
            "Product Name *",
            placeholder="Digital pH Meter",
        )

        brand = st.text_input(
            "Brand",
            placeholder="Eutech",
        )

        model = st.text_input(
            "Model",
            placeholder="PH700",
        )

    with col2:

        quantity = st.number_input(
            "Quantity *",
            min_value=1.0,
            step=1.0,
        )

        unit = st.selectbox(
            "Unit",
            [
                "Nos",
                "Sets",
                "Pieces",
                "Units",
            ],
        )

        location = st.text_input(
            "Location",
            placeholder="Rack A1",
        )

        remarks = st.text_area(
            "Remarks",
            placeholder="New stock",
        )

    submitted = st.form_submit_button(
        "Save Product",
        type="primary",
        use_container_width=True,
    )


if submitted:

    try:

        if not product_id.strip():
            st.error("Product ID is required.")

        elif not product_name.strip():
            st.error("Product Name is required.")

        else:

            result = add_stock(
                product_id=product_id,
                category=category,
                product_name=product_name,
                brand=brand,
                model=model,
                quantity_added=quantity,
                unit=unit,
                location=location,
                source="Manual Entry",
                remarks=remarks,
            )

            excel_path = update_master_stock_excel()

            st.success(
                "Stock saved successfully."
            )

            col1, col2, col3 = st.columns(3)

            with col1:
                st.metric(
                    "Previous Stock",
                    result["previous_quantity"],
                )

            with col2:
                st.metric(
                    "Quantity Added",
                    result["quantity_added"],
                )

            with col3:
                st.metric(
                    "Current Stock",
                    result["new_quantity"],
                )

            if result["product_created"]:

                st.info(
                    "New product created."
                )

            else:

                st.info(
                    "Existing product found. "
                    "New quantity was added to current stock."
                )

            st.write(
                f"**Product ID:** {result['product_id']}"
            )

            st.write(
                f"**Entry Number:** {result['entry_number']}"
            )

            st.write(
                f"**Excel Updated:** {excel_path.name}"
            )

            with open(excel_path, "rb") as file:

                st.download_button(
                    "Download Master Stock Excel",
                    data=file.read(),
                    file_name="Master_Stock.xlsx",
                    mime=(
                        "application/vnd.openxmlformats-"
                        "officedocument.spreadsheetml.sheet"
                    ),
                    use_container_width=True,
                )

    except Exception as error:

        st.error(
            f"Unable to save stock: {error}"
        )