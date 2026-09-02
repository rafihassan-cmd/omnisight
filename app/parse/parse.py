import io
import json
import xml.etree.ElementTree as ET
import pandas as pd


def convert_to_csv_bytes(uploaded_file) -> bytes:
    file_name = uploaded_file.name.lower()

    if file_name.endswith(".json"):
        data = json.load(uploaded_file)
        df = pd.DataFrame(data)
    elif file_name.endswith(".xml"):
        df = pd.read_xml(uploaded_file)
    elif file_name.endswith((".xlsx", ".xls")):
        df = pd.read_excel(uploaded_file)
    elif file_name.endswith(".csv"):
        df = pd.read_csv(uploaded_file)
    else:
        raise ValueError("Unsupported file format.")

    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False)
    return csv_buffer.getvalue().encode("utf-8")