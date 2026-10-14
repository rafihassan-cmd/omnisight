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
  executionsHistory = [],
  onSelectExecution,
}) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [activeTab, setActiveTab] = useState("analyses"); // "analyses" | "mutations"

  const hoverTimeoutRef = useRef(null);
  const drawerRef = useRef(null);

  const datasetId = dataset?.dataset_id;
  const datasetVersion = dataset?.version;

  // Auto-switch to mutations tab if there are dataset operations and no executions yet
  useEffect(() => {
    if (history?.history_count > 0 && executionsHistory.length === 0) {
      setActiveTab("mutations");
    } else if (executionsHistory.length > 0) {
      setActiveTab("analyses");
    }
  }, [history?.history_count, executionsHistory.length]);

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
  const execCount = executionsHistory.length;
  const totalEventCount = opCount + execCount;
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
        title="Hover to inspect Telemetry & Execution History (Click to pin)"
        aria-expanded={isOpen}
      >
        <span className="telemetry-tab-dot" />
        <span className="telemetry-tab-text">EXECUTION LOG</span>
        {totalEventCount > 0 && (
          <span className="telemetry-tab-badge">{totalEventCount}</span>
        )}
      </button>

      {/* Slide-out Drawer from the left */}
      <aside
        ref={drawerRef}
        className={`telemetry-drawer ${isOpen ? "drawer-open" : ""}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-label="Execution History & Reversible Audit Drawer"
      >
        <div className="drawer-header">
          <div>
            <span className="eyebrow">OMNISIGHT / TELEMETRY AUDIT</span>
            <h3 className="drawer-title">Execution History</h3>
            <p className="drawer-subtitle">
              Live audit of analytical inquiries, data cleanings, and reversible operations.
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
              {/* Dual Tab Switcher */}
              <div className="drawer-tab-switcher">
                <button
                  type="button"
                  className={`drawer-tab-btn ${activeTab === "analyses" ? "active" : ""}`}
                  onClick={() => setActiveTab("analyses")}
                >
                  ANALYSES RUN ({execCount})
                </button>
                <button
                  type="button"
                  className={`drawer-tab-btn ${activeTab === "mutations" ? "active" : ""}`}
                  onClick={() => setActiveTab("mutations")}
                >
                  DATA AUDIT ({opCount})
                </button>
              </div>

              {/* TAB 1: Analyses Executed */}
              {activeTab === "analyses" && (
                <div className="drawer-tab-pane">
                  {execCount === 0 ? (
                    <div className="empty-state" style={{ padding: "24px 0" }}>
                      <p className="muted">
                        No analytical inquiries executed yet.
                      </p>
                      <small style={{ color: "var(--text-tertiary)", display: "block", marginTop: "6px" }}>
                        Select and click &ldquo;Execute Analysis&rdquo; in Stage 04 (Question Planner) to track analysis runs and results here.
                      </small>
                    </div>
                  ) : (
                    <div className="log-list">
                      {executionsHistory.map((record, index) => (
                        <div key={record.id || index} className="log-item">
                          <div className="log-item-header">
                            <span className="mono" style={{ color: "var(--accent-primary)" }}>
                              #{execCount - index}
                            </span>
                            <strong className="log-kind">{record.title}</strong>
                            <time>
                              {new Date(record.timestamp).toLocaleTimeString()}
                            </time>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                            <span className="sample-badge" style={{ textTransform: "uppercase" }}>
                              {record.method}
                            </span>
                            {onSelectExecution && (
                              <button
                                type="button"
                                className="bmw-btn-link"
                                style={{ fontSize: "11px", fontWeight: "600" }}
                                onClick={() => {
                                  onSelectExecution(record.response);
                                  setIsPinned(false);
                                  setIsOpen(false);
                                }}
                              >
                                VIEW IN STAGE 05 →
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Data Mutations & Cleaning Operations */}
              {activeTab === "mutations" && (
                <div className="drawer-tab-pane">
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
                      title={history?.can_undo ? "Undo the most recent change" : "No committed changes to undo"}
                    >
                      {actionBusy ? "PROCESSING..." : "UNDO LATEST CHANGE"}
                    </button>

                    <button
                      type="button"
                      className="danger-button"
                      onClick={handleReset}
                      disabled={blocked || !history?.can_reset}
                      title={history?.can_reset ? "Revert back to original raw CSV" : "Already on initial version"}
                    >
                      RESET TO ORIGINAL CSV
                    </button>
                  </div>

                  <div className="drawer-log-list">
                    {!history || history.operations.length === 0 ? (
                      <div className="empty-state" style={{ padding: "16px 0" }}>
                        <p className="muted">
                          No operations committed to history yet.
                        </p>
                        <small style={{ color: "var(--text-tertiary)", display: "block", marginTop: "6px" }}>
                          Transformations applied in Stage 03 (Cleaning) or columns dropped in Stage 02 are recorded here and can be undone or reset.
                        </small>
                      </div>
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
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
