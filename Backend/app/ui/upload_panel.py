import streamlit as st

from app.parse.parse import convert_to_csv_bytes


def render_upload_panel():
    st.title("OmniSight Data Ingestion")

    uploaded_file = st.file_uploader(
        "Upload a dataset", type=["csv", "json", "xml", "xlsx"]
    )

    if uploaded_file is not None:
        try:
            csv_bytes = convert_to_csv_bytes(uploaded_file)
            st.success("File successfully converted!")

            st.download_button(
                label="Download CSV",
                data=csv_bytes,
                file_name="converted_dataset.csv",
                mime="text/csv",
            )
        except Exception as e:
            st.error(f"Error processing file: {e}")