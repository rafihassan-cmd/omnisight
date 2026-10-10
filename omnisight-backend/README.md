# OmniSight

The existing FastAPI backend and Streamlit frontend now implement the agreed Part 1.

```text
omnisight/core/       CSV parsing, profiles and pure pandas transformations
omnisight/services/   Temporary dataset state, versioning, history, undo/reset
omnisight/api/        FastAPI schemas and HTTP routes
debug_ui/           Separate Streamlit frontend; HTTP calls only
debug_ui/pages/     Existing Part 2 missing-value page
tests/              Core and API regression tests
```

`debug_ui` keeps its existing name. It imports no `omnisight` modules. A future
React frontend can call the same HTTP endpoints and have separate cleaning and
missing-value routes; no backend computation needs to move to React.

## Run

From the project root, create and activate a virtual environment, then:

```bash
python -m pip install -r requirements-dev.txt -r requirements-debug.txt
python -m pip install -e .
python -m uvicorn omnisight.api.main:app --reload
```

In another terminal with the same virtual environment active:

```bash
python -m streamlit run debug_ui/Home.py
```

Frontend: http://localhost:8501. API documentation: http://127.0.0.1:8000/docs.
Tests: `python -m pytest -q`.

## Part 1

- Upload CSV and inspect rows, column names, types and missing-cell counts.
- Rename one column, using its stable internal ID (`c0`, `c1`, ...).
- Resolve identical headers by renaming or discarding the chosen occurrence.
  Matching is exact and case-sensitive. Data values are not compared.
- Remove one exact matching prefix or suffix from text values in a chosen column.
- Optionally convert that same column to numbers after removal. All nonmissing
  values must parse as finite numbers; otherwise neither step is committed.
  Existing nulls remain null. Commas are not removed automatically; newly
  produced empty strings fail numeric validation. Integers, decimals, negatives
  and scientific notation are accepted. Numeric surrounding whitespace is accepted.
- Validate/preview the transformation without modifying the dataset.
- Keep a live paginated dataset preview next to the cleaning controls. Choosing
  visible columns only changes the preview; it never deletes dataset columns.
- Undo/reset changes and download CSV with the current display headers.

Raw CSV headers and text whitespace are preserved on upload. Pandas' standard
missing-token inference remains in use. Empty/invalid-width CSVs are rejected.
Files are parsed as UTF-8 (with optional BOM) and comma-separated CSV.

Part 2 stays separate and keeps the existing missing-value strategies. Both the
UI and API block missing-value operations until every column name is unique.

## API contract for future React pages

Existing `/api/v1` endpoints are retained. Payloads now use column IDs.

| Method and path | Response/use |
| --- | --- |
| `POST /api/v1/datasets` | Multipart CSV upload; metadata plus initial preview |
| `GET /api/v1/datasets/{id}` | Overview, duplicate groups and `can_proceed` |
| `GET /api/v1/datasets/{id}/preview` | `offset`, `limit` (1–500), repeated `column_ids` parameters |
| `POST /api/v1/datasets/{id}/operations` | Apply change; metadata, summary and updated preview |
| `POST /api/v1/datasets/{id}/operations/preview` | Validate/dry-run affix removal or missing-value handling |
| `POST /api/v1/datasets/{id}/undo` | Restored metadata and preview |
| `POST /api/v1/datasets/{id}/reset` | Original metadata and preview |
| `GET /api/v1/datasets/{id}/history` | Applied operation history |
| `GET /api/v1/datasets/{id}/export` | Current CSV, with display headers |
| `GET /api/v1/meta` | Supported operations and missing-value strategies |

Mutation and dry-run bodies require the current `expected_version`. Example:

```json
{
  "name": "remove_affix",
  "params": {
    "column_id": "c3",
    "mode": "prefix",
    "text": "$",
    "convert_to_numeric": true
  },
  "expected_version": 0,
  "preview": {"limit": 20, "column_ids": ["c0", "c3"]}
}
```

Other Part 1 operations: `rename_column` with `column_id` and `new_name`, or
`discard_column` with `column_id` (only duplicate-header occurrences).
`handle_missing` uses `columns` containing IDs, `strategy`, and optional `value`.
Undo/reset bodies contain `expected_version` and optional `preview`.

Preview `columns` is a list of `{id, name}` objects. Preview row objects are
keyed by ID, so duplicate headers never overwrite data in JSON. Preview selection
is optional and defaults to all columns, 20 rows. Mutation responses start at
page 1 and preserve requested visibility for columns that still exist.

Versions increase after every successful change, including undo/reset; they
are independent of history length. Stale requests receive HTTP 409. Validation
errors receive HTTP 422; numeric failures include `invalid_count` and up to 10
`invalid_rows`, numbered from 1 below the header. Failed operations leave data,
version and history unchanged.

Storage is in-memory, single-process. Run one backend worker. Restarting loses
datasets; the oldest dataset is evicted above `OMNISIGHT_MAX_DATASETS` (default 20).
This update does not introduce authentication, timed expiration or upload-size limits.

Environment variables: `OMNISIGHT_CORS_ORIGINS` (comma-separated),
`OMNISIGHT_MAX_DATASETS`, and frontend `OMNISIGHT_API_URL`.

## Edited files

| Files | Change |
| --- | --- |
| `omnisight/core/io.py` | Preserve headers and create internal IDs |
| `omnisight/core/profiling.py` | Duplicate groups, ID-based profile and paginated preview |
| `omnisight/core/transforms.py` | Rename/discard, exact affix removal and dry-run |
| `omnisight/core/conversion.py` | Strict nullable numeric conversion |
| `omnisight/core/operations.py` | Scoped registry and Part 2 guard |
| `omnisight/core/errors.py`, `validation.py` | Conversion details, version conflicts and ID validation |
| `omnisight/core/missing.py` | Allow fractional fills after nullable integer conversion |
| `omnisight/services/datasets.py` | Monotonic versions and stale-request checks |
| `omnisight/api/schemas.py`, `main.py`, `routers/datasets.py` | Updated HTTP contracts and preview responses |
| `debug_ui/Home.py`, `client.py`, `common.py`, `pages/1_Missing_Values.py` | Separate frontend pages, live preview and controls |
| `tests/test_core.py`, `tests/test_api.py` | Regression coverage for the agreed workflow |
| `README.md` | Setup, behavior and API documentation |
