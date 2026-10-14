import { useRef, useState } from "react";

export default function IngestionWorkspace({
  session,
  dataset,
  loading,
  uploading,
  busy,
  error,
  onStartSession,
  onEndSession,
  onRefreshSession,
  onUploadDataset,
  onDeleteDataset,
  onProceedToNext,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    if (!selectedFile || !session) return;
    await onUploadDataset(selectedFile);
    clearSelectedFile();
  }

  return (
    <div className="ingestion-stage">
      {/* Session Header Card */}
      <section className="telemetry-card">
        <div className="telemetry-card-head">
          <div>
            <span className="eyebrow">OMNISIGHT / SESSION RUNTIME</span>
            <h2 className="telemetry-card-title">Session Runtime Environment</h2>
            <p className="telemetry-card-subtitle">
              Isolated in-memory analytical session with secure HTTP-only cookies.
            </p>
          </div>

          {session && (
            <span className="live-label">
              <span className="pulse-dot" /> SESSION VERIFIED
            </span>
          )}
        </div>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {session ? (
          <div className="session-metrics-grid">
            <div className="metric-box">
              <span className="mono">STATUS</span>
              <strong>ACTIVE</strong>
            </div>

            <div className="metric-box">
              <span className="mono">IDLE TIMEOUT</span>
              <strong>{Math.round(session.idle_timeout_seconds / 60)} <small>min</small></strong>
            </div>

            <div className="metric-box">
              <span className="mono">DATASET BUFFER</span>
              <strong>{dataset ? "LOADED (1)" : "EMPTY"}</strong>
            </div>

            <div className="session-controls-row">
              <button
                type="button"
                className="outline-button"
                onClick={onRefreshSession}
                disabled={busy}
              >
                REFRESH SESSION
              </button>

              <button
                type="button"
                className="danger-button"
                onClick={onEndSession}
                disabled={busy}
              >
                TERMINATE SESSION
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <p>No active analytics session found. Initialize runtime to connect.</p>
            <button
              type="button"
              className="execute-button"
              style={{ marginTop: "14px" }}
              onClick={onStartSession}
              disabled={busy}
            >
              {loading ? "INITIALIZING..." : "CONNECT ANALYTICS SESSION"}
            </button>
          </div>
        )}
      </section>

      {/* CSV Ingestion Dock */}
      {session && (
        <section className="telemetry-card" style={{ marginTop: "24px" }}>
          <div className="telemetry-card-head">
            <div>
              <span className="eyebrow">STAGE 01 / DATASET INGESTION</span>
              <h2 className="telemetry-card-title">Source Data Ingestion</h2>
              <p className="telemetry-card-subtitle">
                Select or drop a CSV dataset (up to 50 MB). Analysis is executed locally in memory.
              </p>
            </div>
          </div>

          <form onSubmit={handleFormSubmit} className="upload-dock-form">
            <div className="upload-dock-zone">
              <input
                ref={fileInputRef}
                type="file"
                id="csv-file-input"
                className="file-hidden-input"
                accept=".csv,text/csv"
                disabled={busy}
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] || null);
                }}
              />

              <label htmlFor="csv-file-input" className="upload-dock-label">
                <div className="upload-icon">⚡</div>
                <div>
                  <strong className="upload-title">
                    {selectedFile
                      ? selectedFile.name
                      : "Drop CSV file here or click to browse"}
                  </strong>
                  <p className="upload-desc">
                    {selectedFile
                      ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB — Ready for ingestion`
                      : "Supports standard delimiter UTF-8 CSV datasets"}
                  </p>
                </div>
                <span className="outline-button" style={{ marginTop: "8px" }}>
                  SELECT FILE
                </span>
              </label>
            </div>

            <div className="actions" style={{ marginTop: "18px" }}>
              <button
                type="submit"
                className="execute-button"
                disabled={busy || !selectedFile}
              >
                {uploading
                  ? "INGESTING DATASET..."
                  : dataset
                  ? "REPLACE CURRENT DATASET"
                  : "INGEST CSV DATASET"}
              </button>

              {dataset && (
                <button
                  type="button"
                  className="danger-button"
                  onClick={onDeleteDataset}
                  disabled={busy}
                >
                  PURGE DATASET
                </button>
              )}
            </div>
          </form>

          {/* Active Dataset Telemetry Box */}
          {dataset && (
            <div className="dataset-telemetry-box">
              <div className="telemetry-head-mini">
                <span className="workspace-pill">
                  <span className="mono">INGESTED:</span> {dataset.filename || "Uploaded CSV"}
                </span>
                <span className="live-label">READY</span>
              </div>

              <div className="telemetry-footer-grid">
                <div className="metric">
                  <span>DATA POINTS</span>
                  <strong>{dataset.row_count?.toLocaleString()} <small>rows</small></strong>
                </div>
                <div className="metric">
                  <span>DIMENSIONS</span>
                  <strong>{dataset.column_count} <small>columns</small></strong>
                </div>
                <div className="metric">
                  <span>REVISION</span>
                  <strong>v{dataset.version} <small>history #</small></strong>
                </div>
                <div className="metric">
                  <span>MEMORY FOOTPRINT</span>
                  <strong>
                    {dataset.memory_bytes
                      ? `${(dataset.memory_bytes / 1024).toFixed(1)}`
                      : "—"}
                    <small>KB</small>
                  </strong>
                </div>
              </div>

              <div className="stage-advance-strip">
                <div>
                  <strong>Dataset Verified in Runtime</strong>
                  <p className="muted" style={{ margin: "2px 0 0 0" }}>
                    Advance to Stage 02 to inspect schema types, distributions, and null profiling.
                  </p>
                </div>
                <button
                  type="button"
                  className="execute-button"
                  onClick={onProceedToNext}
                >
                  PROCEED TO STAGE 02: PROFILE →
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
