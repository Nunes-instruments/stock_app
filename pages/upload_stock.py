from io import BytesIO
from pathlib import Path

import pandas as pd
import streamlit as st

from database import init_database
from excel_handler import (
    save_uploaded_file,
    read_excel_file,
    prepare_preview,
    import_excel_to_database,
    get_excel_template_dataframe,
)


st.set_page_config(
    page_title="Upload Stock",
    page_icon="📤",
    layout="wide",
)

init_database()


# ---------------------------------------------------------
# PAGE HEADER
# ---------------------------------------------------------

st.title("Upload New Stock")
st.caption(
    "Upload an Excel file containing new instrument stock. "
    "The system will validate the data before storing it."
)

st.info(
    "Required Excel columns: "
    "Product ID, Category, Product Name, Quantity"
)


# ---------------------------------------------------------
# EXCEL TEMPLATE DOWNLOAD
# ---------------------------------------------------------

st.subheader("1. Download Excel Template")

template_df = get_excel_template_dataframe()

template_buffer = BytesIO()

template_df.to_excel(
    template_buffer,
    index=False,
    engine="openpyxl",
)

template_buffer.seek(0)

st.download_button(
    label="Download Stock Excel Template",
    data=template_buffer.getvalue(),
    file_name="Stock_Import_Template.xlsx",
    mime=(
        "application/vnd.openxmlformats-officedocument."
        "spreadsheetml.sheet"
    ),
)

st.divider()


# ---------------------------------------------------------
# FILE UPLOAD
# ---------------------------------------------------------

st.subheader("2. Upload New Stock Excel")

uploaded_file = st.file_uploader(
    "Select Excel File",
    type=["xlsx", "xls"],
    help="Upload the Excel file containing new stock details.",
)


if uploaded_file is not None:

    st.success(
        f"Selected file: {uploaded_file.name}"
    )

    try:
        # -------------------------------------------------
        # SAVE UPLOADED FILE
        # -------------------------------------------------

        saved_file_path = save_uploaded_file(
            uploaded_file
        )

        # -------------------------------------------------
        # READ EXCEL
        # -------------------------------------------------

        dataframe = read_excel_file(
            saved_file_path
        )

        if dataframe.empty:
            st.error(
                "The uploaded Excel file does not contain any stock rows."
            )

            st.stop()

        # -------------------------------------------------
        # PREVIEW + VALIDATION
        # -------------------------------------------------

        preview_df = prepare_preview(
            dataframe
        )

        st.subheader("3. Excel Preview")

        st.dataframe(
            preview_df,
            use_container_width=True,
            hide_index=True,
        )

        total_rows = len(preview_df)

        valid_rows = len(
            preview_df[
                preview_df["Validation Status"] == "Ready"
            ]
        )

        failed_rows = len(
            preview_df[
                preview_df["Validation Status"] == "Failed"
            ]
        )

        # -------------------------------------------------
        # SUMMARY CARDS
        # -------------------------------------------------

        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric(
                "Total Rows",
                total_rows,
            )

        with col2:
            st.metric(
                "Ready to Import",
                valid_rows,
            )

        with col3:
            st.metric(
                "Failed Rows",
                failed_rows,
            )

        # -------------------------------------------------
        # SHOW FAILED ROWS
        # -------------------------------------------------

        if failed_rows > 0:

            st.warning(
                f"{failed_rows} row(s) contain errors. "
                "Please review them below."
            )

            failed_df = preview_df[
                preview_df["Validation Status"] == "Failed"
            ]

            st.dataframe(
                failed_df,
                use_container_width=True,
                hide_index=True,
            )

        else:
            st.success(
                "All rows passed validation."
            )

        st.divider()

        # -------------------------------------------------
        # IMPORT CONFIRMATION
        # -------------------------------------------------

        st.subheader("4. Import Stock")

        if valid_rows == 0:

            st.error(
                "There are no valid rows available for import."
            )

        else:

            confirm_import = st.checkbox(
                "I confirm that the stock information is correct."
            )

            import_button = st.button(
                "Import Stock to Database",
                type="primary",
                disabled=not confirm_import,
                use_container_width=True,
            )

            if import_button:

                with st.spinner(
                    "Importing stock into database..."
                ):

                    result = import_excel_to_database(
                        saved_file_path
                    )

                # -----------------------------------------
                # IMPORT SUCCESS
                # -----------------------------------------

                if result["status"] == "Completed":

                    st.success(
                        "Stock imported successfully."
                    )

                elif result["status"] == "Completed With Errors":

                    st.warning(
                        "Stock import completed, but some rows failed."
                    )

                else:

                    st.error(
                        "The stock import failed."
                    )

                # -----------------------------------------
                # RESULT SUMMARY
                # -----------------------------------------

                st.subheader("Import Result")

                col1, col2, col3, col4 = st.columns(4)

                with col1:
                    st.metric(
                        "Import Number",
                        result["import_number"],
                    )

                with col2:
                    st.metric(
                        "Successful Rows",
                        result["success_rows"],
                    )

                with col3:
                    st.metric(
                        "Failed Rows",
                        result["failed_rows"],
                    )

                with col4:
                    st.metric(
                        "Quantity Added",
                        result["total_quantity_added"],
                    )

                st.write(
                    f"**Import Status:** {result['status']}"
                )

                # -----------------------------------------
                # ROW RESULTS
                # -----------------------------------------

                if result.get("results"):

                    result_df = pd.DataFrame(
                        result["results"]
                    )

                    display_columns = [
                        "excel_row",
                        "status",
                        "entry_number",
                        "previous_quantity",
                        "quantity_added",
                        "new_quantity",
                        "error",
                    ]

                    available_columns = [
                        column
                        for column in display_columns
                        if column in result_df.columns
                    ]

                    result_df = result_df[
                        available_columns
                    ]

                    result_df = result_df.rename(
                        columns={
                            "excel_row": "Excel Row",
                            "status": "Status",
                            "entry_number": "Entry Number",
                            "previous_quantity": "Previous Stock",
                            "quantity_added": "Quantity Added",
                            "new_quantity": "New Stock",
                            "error": "Error",
                        }
                    )

                    st.dataframe(
                        result_df,
                        use_container_width=True,
                        hide_index=True,
                    )

                # -----------------------------------------
                # PROCESSED EXCEL DOWNLOAD
                # -----------------------------------------

                processed_path = Path(
                    result["processed_file"]
                )

                if processed_path.exists():

                    with open(
                        processed_path,
                        "rb",
                    ) as file:

                        processed_bytes = file.read()

                    st.download_button(
                        label="Download Processed Excel",
                        data=processed_bytes,
                        file_name=processed_path.name,
                        mime=(
                            "application/vnd.openxmlformats-"
                            "officedocument.spreadsheetml.sheet"
                        ),
                        use_container_width=True,
                    )

                    st.caption(
                        "The processed Excel contains database status, "
                        "entry number, previous stock, quantity added, "
                        "new stock and any row errors."
                    )

    except ValueError as error:

        st.error(
            str(error)
        )

    except Exception as error:

        st.error(
            f"Unexpected error: {error}"
        )