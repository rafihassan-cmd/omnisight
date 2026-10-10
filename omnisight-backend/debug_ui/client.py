"""Frontend HTTP boundary; imports no backend code. React can use the same API."""
import os

import requests

API_URL = os.getenv("OMNISIGHT_API_URL", "http://127.0.0.1:8000").rstrip("/")
_V1 = f"{API_URL}/api/v1"


class ApiError(Exception):
    def __init__(self, message: str, status: int | None = None, payload: dict | None = None):
        super().__init__(message)
        self.status = status
        self.payload = payload or {}


def _call(method: str, path: str, **kwargs) -> requests.Response:
    try:
        resp = requests.request(method, f"{_V1}{path}", timeout=300, **kwargs)
    except requests.RequestException as exc:
        raise ApiError(f"Cannot reach the API at {API_URL}. Is uvicorn running?") from exc
    if resp.status_code >= 400:
        try:
            payload = resp.json()
        except ValueError:
            payload = {"detail": resp.text}
        raise ApiError(str(payload.get("detail", resp.text)), resp.status_code, payload)
    return resp


def meta() -> dict:
    return _call("GET", "/meta").json()


def upload(filename: str, data: bytes) -> dict:
    return _call("POST", "/datasets", files={"file": (filename, data, "text/csv")}).json()


def info(dataset_id: str) -> dict:
    return _call("GET", f"/datasets/{dataset_id}").json()


def preview(dataset_id: str, offset: int = 0, limit: int = 20,
            column_ids: list[str] | None = None) -> dict:
    return _call("GET", f"/datasets/{dataset_id}/preview",
                 params={"offset": offset, "limit": limit, "column_ids": column_ids}).json()


def apply_operation(dataset_id: str, name: str, params: dict, version: int,
                    selection: dict) -> dict:
    return _call("POST", f"/datasets/{dataset_id}/operations",
                 json={"name": name, "params": params, "expected_version": version,
                       "preview": selection}).json()


def preview_operation(dataset_id: str, name: str, params: dict, version: int) -> dict:
    return _call("POST", f"/datasets/{dataset_id}/operations/preview",
                 json={"name": name, "params": params, "expected_version": version}).json()


def history(dataset_id: str) -> list[dict]:
    return _call("GET", f"/datasets/{dataset_id}/history").json()


def undo(dataset_id: str, version: int, selection: dict) -> dict:
    return _call("POST", f"/datasets/{dataset_id}/undo",
                 json={"expected_version": version, "preview": selection}).json()


def reset(dataset_id: str, version: int, selection: dict) -> dict:
    return _call("POST", f"/datasets/{dataset_id}/reset",
                 json={"expected_version": version, "preview": selection}).json()


def export_csv(dataset_id: str) -> bytes:
    return _call("GET", f"/datasets/{dataset_id}/export").content
