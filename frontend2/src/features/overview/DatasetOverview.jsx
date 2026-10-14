import { useEffect, useState } from "react";

import {
  getCurrentDatasetProfile,
} from "../../api/datasets";


const integerFormatter = new Intl.NumberFormat();

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumSignificantDigits: 8,
});


function formatNumber(value) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return numberFormatter.format(value);
}


function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) {
    return "N/A";
  }

  if (bytes < 1_000_000) {
    return `${(bytes / 1_000).toFixed(2)} KB`;
  }

  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}


function formatCell(value) {
  if (value === null || value === undefined) {
    return "(null)";
  }

  if (typeof value === "string") {
    return value === "" ? "(empty string)" : value;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}


function NumericStatistics({ statistics }) {
  const items = [
    ["Valid values", statistics.valid_count],
    ["Mean", statistics.mean],
    ["Median", statistics.median],
    ["Standard deviation", statistics.std],
    ["Minimum", statistics.min],
    ["Maximum", statistics.max],
    ["First quartile (Q1)", statistics.q1],
    ["Third quartile (Q3)", statistics.q3],
  ];

  return (
    <section>
      <h4>Numeric Statistics</h4>

      <dl className="details-grid">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatNumber(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}


export default function DatasetOverview({
  dataset,
  onRename,
  onDelete,
  disabled = false,
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [refreshCount, setRefreshCount] = useState(0);

  const [selectedColumnId, setSelectedColumnId] =
    useState(null);

  const [draftName, setDraftName] = useState("");
  const [renameError, setRenameError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const datasetId = dataset.dataset_id;
  const datasetVersion = dataset.version;


  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError("");
    setProfile(null);

    async function loadProfile() {
      try {
        const result = await getCurrentDatasetProfile({
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        // Reject a profile belonging to an older revision.
        if (
          result.dataset_id !== datasetId ||
          result.dataset_version !== datasetVersion
        ) {
          throw new Error(
            "Dataset changed. Refresh its information."
          );
        }

        setProfile(result);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => controller.abort();
  }, [datasetId, datasetVersion, refreshCount]);


  const currentProfile =
    profile?.dataset_id === datasetId &&
      profile?.dataset_version === datasetVersion
      ? profile
      : null;

  const selectedColumn =
    currentProfile?.columns.find(
      (column) => column.id === selectedColumnId
    ) ??
    currentProfile?.columns[0] ??
    null;


  useEffect(() => {
    setDraftName(selectedColumn?.name ?? "");
    setRenameError("");
  }, [selectedColumn?.id, selectedColumn?.name]);

  async function handleDelete() {
    if (
      !selectedColumn ||
      disabled ||
      deleting ||
      renaming
    ) {
      return;
    }

    setDeleting(true);
    setDeleteError("");

    try {
      await onDelete(
        selectedColumn.id,
        selectedColumn.name
      );

    } catch (err) {
      setDeleteError(
        err.message || "Could not delete the column."
      );

    } finally {
      setDeleting(false);
    }
  }

  async function handleRename(event) {
    event.preventDefault();

    if (!selectedColumn || disabled || renaming) {
      return;
    }

    const newName = draftName.trim();

    if (!newName) {
      setRenameError("Column name cannot be empty.");
      return;
    }

    if (newName === selectedColumn.name) {
      return;
    }

    setRenameError("");
    setRenaming(true);

    try {
      await onRename(selectedColumn.id, newName);
    } catch (err) {
      setRenameError(err.message);
    } finally {
      setRenaming(false);
    }
  }


  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2>Dataset Overview</h2>
          <p className="muted">
            {dataset.filename} · Revision {dataset.version}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshCount((n) => n + 1)}
          disabled={disabled || loading || renaming}
        >
          Refresh Profile
        </button>
      </div>

      {loading && <p>Loading dataset profile...</p>}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {currentProfile && (
        <>
          <div className="metrics">
            <div className="metric">
              <span>Rows</span>
              <strong>
                {integerFormatter.format(
                  currentProfile.row_count
                )}
              </strong>
            </div>

            <div className="metric">
              <span>Columns</span>
              <strong>
                {integerFormatter.format(
                  currentProfile.column_count
                )}
              </strong>
            </div>

            <div className="metric">
              <span>Missing Cells</span>
              <strong>
                {integerFormatter.format(
                  currentProfile.missing_cells
                )}
              </strong>
            </div>

            <div className="metric">
              <span>Missing Percentage</span>
              <strong>
                {currentProfile.missing_percent.toFixed(2)}%
              </strong>
            </div>
          </div>

          <p className="muted">
            Source file: {formatBytes(dataset.source_size_bytes)}
            {" · "}
            Estimated DataFrame memory:{" "}
            {formatBytes(dataset.estimated_memory_bytes)}
          </p>

          <hr />

          <h3>Column Schema</h3>
          <p className="muted">
            Select a column to inspect its statistics and
            change its name.
          </p>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Column</th>
                  <th scope="col">Data Type</th>
                  <th scope="col">Semantic Type</th>
                  <th scope="col">Missing</th>
                  <th scope="col">Unique</th>
                </tr>
              </thead>

              <tbody>
                {currentProfile.columns.map((column) => (
                  <tr key={column.id}>
                    <td>
                      <button
                        type="button"
                        className={
                          selectedColumn?.id === column.id
                            ? "column-button selected"
                            : "column-button"
                        }
                        onClick={() =>
                          setSelectedColumnId(column.id)
                        }
                      >
                        {column.name}
                      </button>
                    </td>

                    <td>{column.dtype}</td>

                    <td>{column.semantic_type}</td>

                    <td>
                      {column.missing_count}
                      {" ("}
                      {column.missing_percent.toFixed(2)}
                      {"%)"}
                    </td>

                    <td>
                      {integerFormatter.format(
                        column.unique_count
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedColumn && (
            <section className="column-details">
              <h3>Column Details</h3>

              <dl className="details-grid">
                <div>
                  <dt>Column name</dt>
                  <dd>{selectedColumn.name}</dd>
                </div>

                <div>
                  <dt>Data type</dt>
                  <dd>{selectedColumn.dtype}</dd>
                </div>

                <div>
                  <dt>Semantic type</dt>
                  <dd>{selectedColumn.semantic_type}</dd>
                </div>

                <div>
                  <dt>Non-null values</dt>
                  <dd>
                    {integerFormatter.format(
                      selectedColumn.non_null_count
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Unique values</dt>
                  <dd>
                    {integerFormatter.format(
                      selectedColumn.unique_count
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Estimated memory</dt>
                  <dd>
                    {formatBytes(selectedColumn.memory_bytes)}
                  </dd>
                </div>
              </dl>

              {selectedColumn.numeric_stats && (
                <NumericStatistics
                  statistics={selectedColumn.numeric_stats}
                />
              )}
              <div className="column-delete-section">
                <h4>Delete Column</h4>

                <p className="muted">
                  Remove the selected column from your working
                  dataset. The deletion is recorded in history
                  and can be undone.
                </p>

                <button
                  type="button"
                  className="danger-button"
                  onClick={handleDelete}
                  disabled={
                    disabled ||
                    deleting ||
                    renaming ||
                    !selectedColumn ||
                    profile.columns.length <= 1
                  }
                >
                  {deleting
                    ? "Deleting..."
                    : `Delete "${selectedColumn?.name ?? "Column"}"`}
                </button>

                {profile.columns.length <= 1 && (
                  <p className="muted">
                    At least one column must remain in the dataset.
                  </p>
                )}

                {deleteError && (
                  <p className="error" role="alert">
                    {deleteError}
                  </p>
                )}
              </div>
              <h4>Rename Column</h4>

              <form
                className="rename-form"
                onSubmit={handleRename}
              >
                <input
                  type="text"
                  value={draftName}
                  maxLength={128}
                  disabled={disabled || renaming}
                  aria-label="New column name"
                  onChange={(event) =>
                    setDraftName(event.target.value)
                  }
                />

                <button
                  type="submit"
                  disabled={
                    disabled ||
                    renaming ||
                    !draftName.trim() ||
                    draftName.trim() === selectedColumn.name
                  }
                >
                  {renaming ? "Renaming..." : "Rename"}
                </button>
              </form>

              {renameError && (
                <p className="error" role="alert">
                  {renameError}
                </p>
              )}
            </section>
          )}

          <hr />

          <h3>Dataset Preview</h3>

          <p className="muted">
            Showing the first{" "}
            {currentProfile.preview_rows.length} rows.
          </p>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>

                  {currentProfile.columns.map((column) => (
                    <th key={column.id} scope="col">
                      {column.name}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {currentProfile.preview_rows.map(
                  (row, rowIndex) => (
                    <tr key={rowIndex}>
                      <td>{rowIndex + 1}</td>

                      {currentProfile.columns.map(
                        (column, colIndex) => (
                          <td key={column.id}>
                            {formatCell(row[colIndex])}
                          </td>
                        )
                      )}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <p className="muted">
            Preview is read-only. Data transformations will
            be available in the cleaning phase.
          </p>
        </>
      )}
    </section>
  );
}