import { useEffect, useRef, useState } from "react";
import {
  getDatasetHistory,
  undoCleaning,
  resetCleaning,
} from "../../api/cleaning";

export default function HistoryDrawer({
  dataset,
  disabled,
  onDatasetChanged,
  onRefreshDataset,
}) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const hoverTimeoutRef = useRef(null);
  const drawerRef = useRef(null);

  const datasetId = dataset?.dataset_id;
  const datasetVersion = dataset?.version;

  useEffect(() => {
    if (!datasetId) {
      setHistory(null);
      return;
    }

    let active = true;

    async function fetchHistory() {
      setLoading(true);
      setError("");

      try {
        const result = await getDatasetHistory();
        if (!active) return;
        setHistory(result);
      } catch (err) {
        if (!active) return;
        setError(err.message || "Failed to load audit history.");
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchHistory();

    return () => {
      active = false;
    };
  }, [datasetId, datasetVersion, isOpen]);

  function handleMouseEnter() {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsOpen(true);
  }

  function handleMouseLeave() {
    if (isPinned) return;
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 350);
  }

  async function handleUndo() {
    if (!history?.can_undo || actionBusy || !datasetVersion) return;

    setActionBusy(true);
    setError("");

    try {
      const result = await undoCleaning(datasetVersion);
      setHistory(result.history);
      if (onDatasetChanged) {
        onDatasetChanged(result.dataset);
      } else if (onRefreshDataset) {
        await onRefreshDataset();
      }
    } catch (err) {
      setError(err.message || "Could not undo latest operation.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReset() {
    if (!history?.can_reset || actionBusy || !datasetVersion) return;

    const confirmed = window.confirm(
      "Reset to original CSV?\n\nThis will undo all cleanings, column renames, and column drops."
    );
    if (!confirmed) return;

    setActionBusy(true);
    setError("");

    try {
      const result = await resetCleaning(datasetVersion);
      setHistory(result.history);
      if (onDatasetChanged) {
        onDatasetChanged(result.dataset);
      } else if (onRefreshDataset) {
        await onRefreshDataset();
      }
    } catch (err) {
      setError(err.message || "Could not reset dataset.");
    } finally {
      setActionBusy(false);
    }
  }

  const opCount = history?.history_count ?? 0;
  const blocked = disabled || actionBusy || loading;

  return (
    <>
      {/* Invisible screen-edge sensor on the far left */}
      <div
        className="history-edge-sensor"
        onMouseEnter={handleMouseEnter}
        aria-hidden="true"
      />

      {/* Floating Vertical Telemetry Tab on the left edge */}
      <button
        type="button"
        className={`telemetry-tab ${isOpen ? "tab-active" : ""}`}
        onMouseEnter={handleMouseEnter}
        onClick={() => {
          setIsPinned(!isPinned);
          setIsOpen(!isOpen);
        }}
        title="Hover to inspect Reversible Audit Stream (Click to pin)"
        aria-expanded={isOpen}
      >
        <span className="telemetry-tab-dot" />
        <span className="telemetry-tab-text">AUDIT TRAIL</span>
        {opCount > 0 && <span className="telemetry-tab-badge">{opCount}</span>}
      </button>

      {/* Slide-out Drawer from the left */}
      <aside
        ref={drawerRef}
        className={`telemetry-drawer ${isOpen ? "drawer-open" : ""}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-label="Unified Change History & Audit Drawer"
      >
        <div className="drawer-header">
          <div>
            <span className="eyebrow">OMNISIGHT / REVERSIBLE AUDIT</span>
            <h3 className="drawer-title">Execution History</h3>
            <p className="drawer-subtitle">
              Chronological log of committed transformations and column operations.
            </p>
          </div>

          <div className="drawer-controls">
            <button
              type="button"
              className={`icon-button ${isPinned ? "active" : ""}`}
              onClick={() => setIsPinned(!isPinned)}
              title={isPinned ? "Unpin drawer" : "Pin drawer open"}
            >
              📌
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setIsPinned(false);
                setIsOpen(false);
              }}
              title="Close drawer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="drawer-content">
          {!dataset && (
            <div className="empty-state">
              <h3>No Active Dataset</h3>
              <p>Upload a CSV file in Stage 01 to initialize the telemetry stream.</p>
            </div>
          )}

          {dataset && (
            <>
              <div className="drawer-stats-row">
                <span className="workspace-pill">
                  <span className="mono">REVISION:</span> v{dataset.version}
                </span>
                <span className="workspace-pill">
                  <span className="mono">COMMITTED:</span> {opCount}
                </span>
                {loading && <span className="live-label">SYNCING...</span>}
              </div>

              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="drawer-actions">
                <button
                  type="button"
                  className="outline-button"
                  onClick={handleUndo}
                  disabled={blocked || !history?.can_undo}
                  title="Undo the most recent change"
                >
                  {actionBusy ? "PROCESSING..." : "UNDO LATEST CHANGE"}
                </button>

                <button
                  type="button"
                  className="danger-button"
                  onClick={handleReset}
                  disabled={blocked || !history?.can_reset}
                  title="Revert back to the original CSV"
                >
                  RESET TO ORIGINAL CSV
                </button>
              </div>

              <div className="drawer-log-list">
                {!history || history.operations.length === 0 ? (
                  <p className="muted" style={{ padding: "12px 0" }}>
                    No operations committed to history yet.
                  </p>
                ) : (
                  <div className="log-list">
                    {history.operations.map((record, index) => (
                      <div key={record.id || index} className="log-item">
                        <div className="log-item-header">
                          <span className="mono" style={{ color: "var(--accent-primary)" }}>
                            #{history.operations.length - index}
                          </span>
                          <strong className="log-kind">{record.kind}</strong>
                          <time>
                            {new Date(record.created_at).toLocaleTimeString()}
                          </time>
                        </div>

                        <details className="log-details">
                          <summary>Inspect details</summary>
                          <pre className="log-json">
                            {JSON.stringify(record.details, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
