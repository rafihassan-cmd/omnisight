import { useEffect, useRef, useState } from "react";

import {
  getCleaningOperations,
  getDatasetHistory,
  previewCleaning,
  applyCleaning,
  undoCleaning,
  resetCleaning,
} from "../../api/cleaning";

import {
  getCurrentDatasetProfile,
} from "../../api/datasets";


const SUPPORTED_KINDS = new Set([
  "rows.drop_duplicates",
  "rows.drop_missing",
  "missing.fill_mean",
  "missing.fill_constant",
  "text.trim",
  "text.strip_affixes",
  "text.remove_separators",
  "column.to_numeric",
  "column.to_datetime",
]);


const TEXT_TYPES = new Set([
  "text",
  "categorical",
  "datetime_candidate",
]);


function eligibleColumns(columns, kind) {
  if (kind === "missing.fill_mean") {
    return columns.filter(
      (column) => column.semantic_type === "numeric"
    );
  }

  if (
    kind.startsWith("text.") ||
    kind === "column.to_numeric" ||
    kind === "column.to_datetime"
  ) {
    return columns.filter(
      (column) => TEXT_TYPES.has(column.semantic_type)
    );
  }

  if (kind === "missing.fill_constant") {
    return columns.filter(
      (column) => column.semantic_type !== "datetime"
    );
  }

  return columns;
}


function formatValue(value) {
  if (value === null || value === undefined) {
    return "(null)";
  }

  if (value === "") {
    return "(empty)";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}


function SampleTable({ snapshot, title }) {
  if (!snapshot) return null;

  return (
    <div className="cleaning-snapshot">
      <h4>{title}</h4>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>

              {snapshot.columns.map((name, index) => (
                <th
                  key={snapshot.column_ids[index]}
                  scope="col"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {snapshot.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td>{rowIndex + 1}</td>

                {snapshot.column_ids.map(
                  (columnId, columnIndex) => (
                    <td key={columnId}>
                      {formatValue(row[columnIndex])}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {snapshot.truncated_columns > 0 && (
        <p className="muted">
          {snapshot.truncated_columns} additional columns
          are not shown.
        </p>
      )}
    </div>
  );
}


function PreviewReport({ preview }) {
  const impact = preview.impact;

  const metrics = [
    ["Rows before", impact.rows_before],
    ["Rows after", impact.rows_after],
    ["Affected rows", impact.affected_rows],
    ["Removed rows", impact.removed_rows],
    ["Missing before", impact.missing_before],
    ["Missing after", impact.missing_after],
    ["New nulls", impact.introduced_nulls],
  ];

  return (
    <section className="cleaning-report">
      <h3>Cleaning Preview</h3>

      <p>
        <strong>Operation:</strong> {preview.label}
      </p>

      {preview.can_apply ? (
        <p className="cleaning-success">
          Preview completed. This operation is eligible
          for confirmation.
        </p>
      ) : (
        <p className="muted">
          This preview cannot be applied.
        </p>
      )}

      {preview.validation_error && (
        <p className="cleaning-error" role="alert">
          {preview.validation_error}
        </p>
      )}

      {preview.warnings.length > 0 && (
        <div className="cleaning-warning">
          <strong>Warnings</strong>

          <ul>
            {preview.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="cleaning-impact">
        {metrics.map(([label, value]) => (
          <div key={label} className="metric">
            <span>{label}</span>
            <strong>{value.toLocaleString()}</strong>
          </div>
        ))}
      </div>

      {impact.conversion_success_percent !== null && (
        <p>
          <strong>Conversion success:</strong>{" "}
          {impact.conversion_success_percent}%
        </p>
      )}

      <p className="muted">
        Estimated result memory:{" "}
        {(
          impact.estimated_result_memory_bytes /
          1_000_000
        ).toFixed(2)} MB
      </p>

      {preview.simulated_policy && (
        <p className="muted">
          Diagnostic simulation used the{" "}
          <code>{preview.simulated_policy}</code> policy.
          Your requested conversion policy was not changed.
        </p>
      )}

      {preview.invalid_examples.length > 0 && (
        <>
          <h4>Invalid Conversion Examples</h4>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Original Value</th>
                </tr>
              </thead>

              <tbody>
                {preview.invalid_examples.map(
                  (example, index) => (
                    <tr key={index}>
                      <td>{example.row}</td>
                      <td>
                        {formatValue(
                          example.original_value
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4>Before / After</h4>

      {preview.comparison_mode === "snapshots" && (
        <p className="muted">
          These are independent dataset snapshots.
          Row positions may differ after removal.
        </p>
      )}

      <div className="cleaning-comparison">
        <SampleTable
          snapshot={preview.before}
          title="Before"
        />

        <SampleTable
          snapshot={preview.after}
          title="After"
        />
      </div>

      <p className="muted">
        The tables show limited samples, not every
        affected record. Use the impact summary above
        to assess the complete operation.
      </p>

      <details>
        <summary>Technical operation details</summary>
        <pre className="cleaning-json">
          {JSON.stringify(preview.details, null, 2)}
        </pre>
      </details>
    </section>
  );
}


export default function CleaningWorkspace({
  dataset,
  onDatasetChanged,
  onRefreshDataset,
  disabled = false,
}) {
  const [operations, setOperations] = useState([]);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState(null);

  const [kind, setKind] = useState("");
  const [columnId, setColumnId] = useState("");
  const [rowColumnIds, setRowColumnIds] = useState([]);

  const [keep, setKeep] = useState("first");
  const [how, setHow] = useState("any");
  const [fillValue, setFillValue] = useState("");
  const [trimMode, setTrimMode] = useState("both");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [characters, setCharacters] = useState(",");
  const [invalid, setInvalid] = useState("reject");
  const [dateFormat, setDateFormat] = useState("mixed");
  const [dayfirst, setDayfirst] = useState(false);
  const [utc, setUtc] = useState(false);

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const inFlight = useRef(false);

  const datasetId = dataset.dataset_id;
  const datasetVersion = dataset.version;


  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setProfile(null);
    setPreview(null);
    setError("");

    async function load() {
      try {
        const [available, currentProfile, currentHistory] =
          await Promise.all([
            getCleaningOperations({
              signal: controller.signal,
            }),
            getCurrentDatasetProfile({
              signal: controller.signal,
            }),
            getDatasetHistory({
              signal: controller.signal,
            }),
          ]);

        if (controller.signal.aborted) return;

        if (
          currentProfile.dataset_id !== datasetId ||
          currentProfile.dataset_version !== datasetVersion ||
          currentHistory.dataset_id !== datasetId ||
          currentHistory.dataset_version !== datasetVersion
        ) {
          throw new Error(
            "Dataset changed. Refresh the dataset."
          );
        }

        setOperations(
          available.filter((operation) =>
            SUPPORTED_KINDS.has(operation.kind)
          )
        );

        setProfile(currentProfile);
        setHistory(currentHistory);
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

    load();

    return () => controller.abort();
  }, [datasetId, datasetVersion, refreshCount]);


  const currentProfile =
    profile?.dataset_id === datasetId &&
    profile?.dataset_version === datasetVersion
      ? profile
      : null;

  const currentHistory =
    history?.dataset_id === datasetId &&
    history?.dataset_version === datasetVersion
      ? history
      : null;

  const selectedKind = operations.some(
    (operation) => operation.kind === kind
  )
    ? kind
    : operations[0]?.kind || "";

  const availableColumns = currentProfile?.columns || [];

  const compatibleColumns = eligibleColumns(
    availableColumns,
    selectedKind
  );

  const activeColumnId = compatibleColumns.some(
    (column) => column.id === columnId
  )
    ? columnId
    : compatibleColumns[0]?.id || "";

  const activeColumn = compatibleColumns.find(
    (column) => column.id === activeColumnId
  );

  const isRowOperation = selectedKind.startsWith("rows.");
  const isColumnOperation = !isRowOperation;

  const blocked =
    disabled || busy || loading || !currentProfile;

  const activePreview =
    preview?.dataset_id === datasetId &&
    preview?.dataset_version === datasetVersion &&
    preview?.kind === selectedKind
      ? preview
      : null;


  function invalidatePreview() {
    setPreview(null);
    setError("");
    setNotice("");
  }


  function changeValue(setter, value) {
    setter(value);
    invalidatePreview();
  }


  function toggleRowColumn(id, checked) {
    setRowColumnIds((previous) =>
      checked
        ? [...new Set([...previous, id])]
        : previous.filter((item) => item !== id)
    );

    invalidatePreview();
  }


  function buildParameters() {
    if (isColumnOperation && !activeColumnId) {
      throw new Error(
        "No compatible column is available for this operation."
      );
    }

    switch (selectedKind) {
      case "rows.drop_duplicates":
        return {
          column_ids: rowColumnIds,
          keep,
        };

      case "rows.drop_missing":
        return {
          column_ids: rowColumnIds,
          how,
        };

      case "missing.fill_mean":
        return {
          column_id: activeColumnId,
        };

      case "missing.fill_constant": {
        let value = fillValue;

        if (activeColumn.semantic_type === "numeric") {
          if (fillValue.trim() === "") {
            throw new Error("Enter a numeric fill value.");
          }

          value = Number(fillValue);

          if (!Number.isFinite(value)) {
            throw new Error(
              "The numeric fill value must be finite."
            );
          }
        } else if (
          activeColumn.semantic_type === "boolean"
        ) {
          value = fillValue === "true";
        }

        return {
          column_id: activeColumnId,
          value,
        };
      }

      case "text.trim":
        return {
          column_id: activeColumnId,
          mode: trimMode,
        };

      case "text.strip_affixes":
        if (!prefix && !suffix) {
          throw new Error(
            "Enter a prefix, suffix, or both."
          );
        }

        return {
          column_id: activeColumnId,
          prefix,
          suffix,
        };

      case "text.remove_separators":
        if (
          characters.length < 1 ||
          characters.length > 16
        ) {
          throw new Error(
            "Enter between 1 and 16 separator characters."
          );
        }

        return {
          column_id: activeColumnId,
          characters,
        };

      case "column.to_numeric":
        return {
          column_id: activeColumnId,
          invalid,
        };

      case "column.to_datetime":
        return {
          column_id: activeColumnId,
          format: dateFormat.trim() || "mixed",
          dayfirst,
          utc,
          invalid,
        };

      default:
        throw new Error(
          "Select a supported cleaning operation."
        );
    }
  }


  function beginRequest() {
    if (inFlight.current || disabled || loading) {
      return false;
    }

    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");

    return true;
  }


  function endRequest() {
    inFlight.current = false;
    setBusy(false);
  }


  async function handlePreview(event) {
    event.preventDefault();

    if (!beginRequest()) return;

    setPreview(null);

    try {
      const parameters = buildParameters();

      const result = await previewCleaning(
        selectedKind,
        parameters,
        datasetVersion
      );

      setPreview(result);
    } catch (err) {
      setError(err.message);
    } finally {
      endRequest();
    }
  }


  async function performMutation(action, message) {
    if (!beginRequest()) return;

    try {
      const result = await action();

      setPreview(null);
      setHistory(result.history);

      onDatasetChanged(result.dataset);

      setNotice(message);
    } catch (err) {
      setPreview(null);
      setError(err.message);
    } finally {
      endRequest();
    }
  }


  async function handleApply() {
    if (
      !activePreview?.can_apply ||
      !activePreview.preview_token ||
      blocked
    ) {
      return;
    }

    await performMutation(
      () =>
        applyCleaning(
          activePreview.preview_token,
          datasetVersion
        ),
      "Cleaning operation applied successfully."
    );
  }


  async function handleUndo() {
    if (!currentHistory?.can_undo || blocked) return;

    await performMutation(
      () => undoCleaning(datasetVersion),
      "Latest change undone successfully."
    );
  }


  async function handleReset() {
    if (!currentHistory?.can_reset || blocked) return;

    const confirmed = window.confirm(
      "Reset this dataset to its original uploaded state? " +
      "All cleaning operations and column renames will be lost."
    );

    if (!confirmed) return;

    await performMutation(
      () => resetCleaning(datasetVersion),
      "Dataset restored to its original state."
    );
  }


  async function handleRefresh() {
    if (disabled || busy || loading) return;

    setPreview(null);
    setError("");

    try {
      await onRefreshDataset();
      setRefreshCount((count) => count + 1);
    } catch (err) {
      setError(err.message);
    }
  }


  return (
    <section className="panel cleaning-workspace">
      <div className="section-header">
        <div>
          <h2>Data Cleaning</h2>
          <p className="muted">
            Configure, preview and confirm data transformations.
          </p>
          <p className="muted">
            Dataset revision: {datasetVersion}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={disabled || busy || loading}
        >
          Refresh Cleaning Data
        </button>
      </div>

      {loading && <p>Loading cleaning options...</p>}

      {error && (
        <p className="cleaning-error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="cleaning-success" role="status">
          {notice}
        </p>
      )}

      {currentProfile && (
        <>
          <form
            className="cleaning-form"
            onSubmit={handlePreview}
          >
            <div className="cleaning-field">
              <label htmlFor="cleaning-kind">
                <strong>Cleaning Operation</strong>
              </label>

              <select
                id="cleaning-kind"
                value={selectedKind}
                disabled={blocked}
                onChange={(event) =>
                  changeValue(setKind, event.target.value)
                }
              >
                {operations.map((operation) => (
                  <option
                    key={operation.kind}
                    value={operation.kind}
                  >
                    {operation.label}
                  </option>
                ))}
              </select>
            </div>

            {isRowOperation ? (
              <div className="cleaning-field">
                <strong>Target Columns</strong>

                <p className="muted">
                  Leave every checkbox unselected to use
                  all columns.
                </p>

                <div className="cleaning-column-list">
                  {availableColumns.map((column) => (
                    <label key={column.id}>
                      <input
                        type="checkbox"
                        checked={rowColumnIds.includes(
                          column.id
                        )}
                        disabled={blocked}
                        onChange={(event) =>
                          toggleRowColumn(
                            column.id,
                            event.target.checked
                          )
                        }
                      />
                      {column.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="cleaning-field">
                <label htmlFor="cleaning-column">
                  <strong>Target Column</strong>
                </label>

                <select
                  id="cleaning-column"
                  value={activeColumnId}
                  disabled={
                    blocked || compatibleColumns.length === 0
                  }
                  onChange={(event) =>
                    changeValue(
                      setColumnId,
                      event.target.value
                    )
                  }
                >
                  {compatibleColumns.length === 0 && (
                    <option value="">
                      No compatible columns
                    </option>
                  )}

                  {compatibleColumns.map((column) => (
                    <option
                      key={column.id}
                      value={column.id}
                    >
                      {column.name} ({column.dtype})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedKind === "rows.drop_duplicates" && (
              <div className="cleaning-field">
                <label htmlFor="duplicates-keep">
                  Keep duplicates policy
                </label>

                <select
                  id="duplicates-keep"
                  value={keep}
                  disabled={blocked}
                  onChange={(event) =>
                    changeValue(setKeep, event.target.value)
                  }
                >
                  <option value="first">
                    Keep first occurrence
                  </option>
                  <option value="last">
                    Keep last occurrence
                  </option>
                  <option value="none">
                    Remove all duplicate occurrences
                  </option>
                </select>
              </div>
            )}

            {selectedKind === "rows.drop_missing" && (
              <div className="cleaning-field">
                <label htmlFor="missing-how">
                  Removal condition
                </label>

                <select
                  id="missing-how"
                  value={how}
                  disabled={blocked}
                  onChange={(event) =>
                    changeValue(setHow, event.target.value)
                  }
                >
                  <option value="any">
                    Remove if any selected column is missing
                  </option>
                  <option value="all">
                    Remove if all selected columns are missing
                  </option>
                </select>
              </div>
            )}

            {selectedKind === "missing.fill_constant" && (
              <div className="cleaning-field">
                <label htmlFor="fill-value">
                  Replacement value
                </label>

                {activeColumn?.semantic_type === "boolean" ? (
                  <select
                    id="fill-value"
                    value={
                      fillValue === "true" ? "true" : "false"
                    }
                    disabled={blocked}
                    onChange={(event) =>
                      changeValue(
                        setFillValue,
                        event.target.value
                      )
                    }
                  >
                    <option value="false">False</option>
                    <option value="true">True</option>
                  </select>
                ) : (
                  <input
                    id="fill-value"
                    type="text"
                    value={fillValue}
                    disabled={blocked}
                    placeholder={
                      activeColumn?.semantic_type === "numeric"
                        ? "e.g. 0 or 45.5"
                        : "e.g. Unknown"
                    }
                    onChange={(event) =>
                      changeValue(
                        setFillValue,
                        event.target.value
                      )
                    }
                  />
                )}

                <p className="muted">
                  Numeric columns require numeric values.
                  Text columns accept text values.
                </p>
              </div>
            )}

            {selectedKind === "text.trim" && (
              <div className="cleaning-field">
                <label htmlFor="trim-mode">
                  Whitespace removal
                </label>

                <select
                  id="trim-mode"
                  value={trimMode}
                  disabled={blocked}
                  onChange={(event) =>
                    changeValue(
                      setTrimMode,
                      event.target.value
                    )
                  }
                >
                  <option value="both">Both ends</option>
                  <option value="left">Leading only</option>
                  <option value="right">Trailing only</option>
                </select>
              </div>
            )}

            {selectedKind === "text.strip_affixes" && (
              <div className="cleaning-parameter-grid">
                <div className="cleaning-field">
                  <label htmlFor="cleaning-prefix">
                    Prefix to remove
                  </label>

                  <input
                    id="cleaning-prefix"
                    value={prefix}
                    disabled={blocked}
                    onChange={(event) =>
                      changeValue(
                        setPrefix,
                        event.target.value
                      )
                    }
                  />
                </div>

                <div className="cleaning-field">
                  <label htmlFor="cleaning-suffix">
                    Suffix to remove
                  </label>

                  <input
                    id="cleaning-suffix"
                    value={suffix}
                    disabled={blocked}
                    onChange={(event) =>
                      changeValue(
                        setSuffix,
                        event.target.value
                      )
                    }
                  />
                </div>
              </div>
            )}

            {selectedKind === "text.remove_separators" && (
              <div className="cleaning-field">
                <label htmlFor="separator-characters">
                  Characters to remove
                </label>

                <input
                  id="separator-characters"
                  value={characters}
                  maxLength={16}
                  disabled={blocked}
                  onChange={(event) =>
                    changeValue(
                      setCharacters,
                      event.target.value
                    )
                  }
                />

                <p className="muted">
                  Every occurrence of each supplied character
                  will be removed.
                </p>
              </div>
            )}

            {selectedKind === "column.to_datetime" && (
              <>
                <div className="cleaning-field">
                  <label htmlFor="date-format">
                    Datetime format
                  </label>

                  <input
                    id="date-format"
                    value={dateFormat}
                    disabled={blocked}
                    placeholder="mixed or %d/%m/%Y"
                    onChange={(event) =>
                      changeValue(
                        setDateFormat,
                        event.target.value
                      )
                    }
                  />

                  <p className="muted">
                    Use an explicit format for ambiguous dates.
                    Example: %d/%m/%Y.
                  </p>
                </div>

                <label className="cleaning-inline-check">
                  <input
                    type="checkbox"
                    checked={dayfirst}
                    disabled={blocked}
                    onChange={(event) =>
                      changeValue(
                        setDayfirst,
                        event.target.checked
                      )
                    }
                  />
                  Prefer day-first interpretation
                </label>

                <label className="cleaning-inline-check">
                  <input
                    type="checkbox"
                    checked={utc}
                    disabled={blocked}
                    onChange={(event) =>
                      changeValue(
                        setUtc,
                        event.target.checked
                      )
                    }
                  />
                  Normalize datetime values to UTC
                </label>
              </>
            )}

            {(
              selectedKind === "column.to_numeric" ||
              selectedKind === "column.to_datetime"
            ) && (
              <div className="cleaning-field">
                <label htmlFor="invalid-policy">
                  Invalid value policy
                </label>

                <select
                  id="invalid-policy"
                  value={invalid}
                  disabled={blocked}
                  onChange={(event) =>
                    changeValue(
                      setInvalid,
                      event.target.value
                    )
                  }
                >
                  <option value="reject">
                    Reject invalid values (recommended)
                  </option>
                  <option value="null">
                    Convert invalid values to null
                  </option>
                </select>
              </div>
            )}

            <div className="actions">
              <button
                type="submit"
                disabled={
                  blocked ||
                  !selectedKind ||
                  (isColumnOperation && !activeColumnId)
                }
              >
                {busy ? "Processing..." : "Preview Cleaning"}
              </button>
            </div>
          </form>

          {activePreview && (
            <>
              <PreviewReport preview={activePreview} />

              <div className="actions">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={
                    blocked ||
                    !activePreview.can_apply ||
                    !activePreview.preview_token
                  }
                >
                  Confirm and Apply
                </button>

                <button
                  type="button"
                  onClick={invalidatePreview}
                  disabled={blocked}
                >
                  Discard Preview
                </button>
              </div>
            </>
          )}

          <hr />

          <div className="section-header">
            <div>
              <h3>Unified Change History</h3>
              <p className="muted">
                Includes cleaning operations and column renames.
              </p>
            </div>
          </div>

          <div className="actions">
            <button
              type="button"
              onClick={handleUndo}
              disabled={
                blocked || !currentHistory?.can_undo
              }
            >
              Undo Latest Change
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={
                blocked || !currentHistory?.can_reset
              }
            >
              Reset to Original CSV
            </button>
          </div>

          {currentHistory && (
            <>
              <p className="muted">
                Committed operations:{" "}
                {currentHistory.history_count}
              </p>

              {currentHistory.operations.length === 0 ? (
                <p>No changes have been committed.</p>
              ) : (
                <ol className="cleaning-history">
                  {currentHistory.operations.map((record) => {
                    const operation = operations.find(
                      (item) => item.kind === record.kind
                    );

                    const label =
                      operation?.label || record.kind;

                    return (
                      <li key={record.id}>
                        <strong>{label}</strong>

                        <span className="muted">
                          {new Date(
                            record.created_at
                          ).toLocaleString()}
                        </span>

                        <details>
                          <summary>Operation details</summary>
                          <pre className="cleaning-json">
                            {JSON.stringify(
                              record.details,
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}