import { useEffect, useRef, useState } from "react";

import {
  initializeSession,
  createSession,
  getCurrentSession,
  deleteSession,
  clearSessionInitialization,
} from "./api/sessions";

import {
  uploadDataset,
  getCurrentDataset,
  deleteCurrentDataset,
  renameDatasetColumn,
} from "./api/datasets";

import { getDatasetHistory } from "./api/cleaning";

import ChangeHistoryModal from "./features/cleaning/ChangeHistoryModal";

import DatasetOverview from "./features/overview/DatasetOverview";
import CleaningWorkspace from "./features/cleaning/CleaningWorkspace";
import QuestionPlanner from "./features/planner/QuestionPlanner";
import AnalysisResults from "./features/analysis/AnalysisResults";

function App() {
  const [session, setSession] = useState(null);
  const [dataset, setDataset] = useState(null);

  const [selectedFile, setSelectedFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [page, setPage] = useState("cleaning");
  const [history, setHistory] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [analysisResult, setAnalysisResult] =
    useState(null);

  const fileInputRef = useRef(null);

  const busy = loading || uploading;


  function clearSelectedFile() {
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }


  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const currentSession = await initializeSession();

        const currentDataset = currentSession.has_dataset
          ? await getCurrentDataset()
          : null;

        if (!active) return;

        setSession({
          ...currentSession,
          has_dataset: Boolean(currentDataset),
        });

        setDataset(currentDataset);
        setError("");
      } catch (err) {
        if (!active) return;

        setError(err.message);
        setSession(null);
        setDataset(null);

        clearSessionInitialization();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);


  const datasetId = dataset?.dataset_id ?? null;
  const datasetVersion = dataset?.version ?? null;

  // A stored analysis is only valid for the exact
  // dataset revision that produced it.
  const activeAnalysis =
    analysisResult &&
    analysisResult.plan?.dataset_id === datasetId &&
    analysisResult.plan?.dataset_version === datasetVersion
      ? analysisResult
      : null;


  function handleAnalysisExecuted(result) {
    setAnalysisResult(result);
    setPage("analysis");
  }


  useEffect(() => {
    if (!datasetId) {
      return;
    }

    const controller = new AbortController();

    getDatasetHistory({ signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;

        if (
          result.dataset_id !== datasetId ||
          result.dataset_version !== datasetVersion
        ) {
          return;
        }

        setHistory(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistory(null);
        }
      });

    return () => controller.abort();
  }, [datasetId, datasetVersion]);


  async function handleRefreshSession() {
    setLoading(true);
    setError("");

    try {
      const currentSession = await getCurrentSession();

      const currentDataset = currentSession.has_dataset
        ? await getCurrentDataset()
        : null;

      setSession({
        ...currentSession,
        has_dataset: Boolean(currentDataset),
      });

      setDataset(currentDataset);
    } catch (err) {
      setError(err.message);
      setSession(null);
      setDataset(null);

      clearSessionInitialization();
    } finally {
      setLoading(false);
    }
  }


  async function handleStartSession() {
    setLoading(true);
    setError("");

    try {
      clearSessionInitialization();

      const currentSession = await createSession();

      const currentDataset = currentSession.has_dataset
        ? await getCurrentDataset()
        : null;

      setSession({
        ...currentSession,
        has_dataset: Boolean(currentDataset),
      });

      setDataset(currentDataset);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  async function handleEndSession() {
    setLoading(true);
    setError("");

    try {
      await deleteSession();

      setSession(null);
      setDataset(null);

      setPage("cleaning");
      setHistory(null);
      setHistoryOpen(false);
      setAnalysisResult(null);

      clearSelectedFile();

      clearSessionInitialization();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  async function handleUpload(event) {
    event.preventDefault();

    if (!selectedFile || !session) {
      setError("Select a CSV file first.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const result = await uploadDataset(selectedFile);

      setDataset(result);
      setAnalysisResult(null);

      setSession((previous) => ({
        ...previous,
        has_dataset: true,
      }));

      clearSelectedFile();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }


  async function handleDeleteDataset() {
    setLoading(true);
    setError("");

    try {
      await deleteCurrentDataset();

      setDataset(null);

      setPage("cleaning");
      setHistory(null);
      setHistoryOpen(false);
      setAnalysisResult(null);

      clearSelectedFile();

      setSession((previous) => ({
        ...previous,
        has_dataset: false,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }


  async function handleRenameColumn(columnId, newName) {
    if (!dataset) {
      throw new Error("No dataset is currently loaded.");
    }

    setLoading(true);

    try {
      const result = await renameDatasetColumn(
        columnId,
        newName,
        dataset.version
      );

      setDataset(result);

      return result;
    } finally {
      setLoading(false);
    }
  }


  return (
    <>
      <header className="app-navbar">
        <div className="app-navbar-inner">
          <div className="app-brand">
            <svg
              className="app-logo"
              viewBox="0 0 32 32"
              role="img"
              aria-label="OmniSight logo"
            >
              <circle
                className="logo-o"
                cx="16"
                cy="16"
                r="13"
                fill="none"
                strokeWidth="2.5"
              />

              <path
                className="logo-diamond"
                d="M16 7.5 L24.5 16 L16 24.5 L7.5 16 Z"
                fill="none"
                strokeWidth="2"
                strokeLinejoin="round"
              />

              <circle
                className="logo-dot"
                cx="16"
                cy="16"
                r="2.6"
              />
            </svg>

            <h1>OmniSight</h1>
            <p className="app-tagline">
              Interactive Data Analytics Platform
            </p>
          </div>
        </div>
      </header>

      <main className="app-shell">
        {session && dataset && (
          <div className="history-bar">
            <button
              type="button"
              className="nav-history-button"
              onClick={() => setHistoryOpen(true)}
            >
              Change History
              {history?.operations?.length > 0 && (
                <span className="nav-history-count">
                  {history.history_count}
                </span>
              )}
            </button>
          </div>
        )}

        {page === "cleaning" && (
          <>
            <section className="panel">
              <h2>Session Management</h2>

              {loading && <p>Processing...</p>}

              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}

              {session ? (
                <>
                  <p>
                    <strong>Status:</strong> Active
                  </p>

                  <p>
                    <strong>Inactivity timeout:</strong>{" "}
                    {session.idle_timeout_seconds / 60}{" "}
                    minutes
                  </p>

                  <div className="actions">
                    <button
                      onClick={handleRefreshSession}
                      disabled={busy}
                    >
                      Refresh Session
                    </button>

                    <button
                      onClick={handleEndSession}
                      disabled={busy}
                    >
                      End Session
                    </button>
                  </div>
                </>
              ) : (
                !loading && (
                  <button
                    onClick={handleStartSession}
                    disabled={busy}
                  >
                    Start Session
                  </button>
                )
              )}
            </section>

            {session && (
              <section className="panel">
                <h2>CSV Upload</h2>

                <p className="muted">
                  Supported format: UTF-8 CSV.
                  Maximum file size: 50 MB.
                </p>

                <form onSubmit={handleUpload}>
                  <div className="file-picker">
                    <label className="file-button">
                      {selectedFile
                        ? "Change File"
                        : "Choose File"}

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="visually-hidden-input"
                        disabled={busy}
                        onChange={(event) => {
                          setSelectedFile(
                            event.target.files?.[0] || null
                          );
                        }}
                      />
                    </label>

                    <span className="file-name muted">
                      {selectedFile
                        ? selectedFile.name
                        : "No file selected"}
                    </span>
                  </div>

                  <div className="actions">
                    <button
                      type="submit"
                      disabled={busy || !selectedFile}
                    >
                      {uploading
                        ? "Uploading..."
                        : dataset
                          ? "Replace Dataset"
                          : "Upload CSV"}
                    </button>

                    {dataset && (
                      <button
                        type="button"
                        onClick={handleDeleteDataset}
                        disabled={busy}
                      >
                        Remove Dataset
                      </button>
                    )}
                  </div>
                </form>
              </section>
            )}

            {session && dataset && (
              <>
                <DatasetOverview
                  key={`overview-${dataset.dataset_id}`}
                  dataset={dataset}
                  onRename={handleRenameColumn}
                  disabled={busy}
                />

                <CleaningWorkspace
                  key={`cleaning-${dataset.dataset_id}`}
                  dataset={dataset}
                  history={history}
                  disabled={busy}
                  onDatasetChanged={(updatedDataset) => {
                    setDataset(updatedDataset);
                  }}
                  onRefreshDataset={handleRefreshSession}
                />

                <div className="page-nav">
                  <button
                    type="button"
                    className="nav-step-button"
                    disabled={busy}
                    onClick={() => setPage("planner")}
                  >
                    Next
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M6 3l5 5-5 5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </>
            )}

            {session && !dataset && !loading && (
              <section className="panel">
                <h2>No Dataset Loaded</h2>

                <p className="muted">
                  Upload a CSV file to inspect its structure,
                  statistics, and data preview.
                </p>
              </section>
            )}
          </>
        )}

        {page === "planner" && session && dataset && (
          <>
            <div className="page-nav page-nav-back">
              <button
                type="button"
                className="nav-step-button"
                disabled={busy}
                onClick={() => setPage("cleaning")}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M10 3L5 8l5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Previous
              </button>
            </div>

            <QuestionPlanner
              key={`planner-${dataset.dataset_id}`}
              dataset={dataset}
              disabled={busy}
              onRefreshDataset={handleRefreshSession}
              onAnalysisExecuted={handleAnalysisExecuted}
            />
          </>
        )}

        {page === "analysis" && session && dataset && (
          <>
            <div className="page-nav page-nav-back">
              <button
                type="button"
                className="nav-step-button"
                disabled={busy}
                onClick={() => setPage("planner")}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M10 3L5 8l5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Previous
              </button>

              <button
                type="button"
                className="nav-step-button nav-step-home"
                disabled={busy}
                onClick={() => setPage("cleaning")}
              >
                Home
              </button>
            </div>

            {activeAnalysis ? (
              <section className="panel">
                <AnalysisResults
                  key={activeAnalysis.execution_id}
                  execution={activeAnalysis}
                />
              </section>
            ) : (
              <section className="panel">
                <h2>Analysis No Longer Available</h2>

                <p className="muted">
                  The dataset changed after this analysis
                  was executed. Return to the planner and
                  run the analysis again.
                </p>
              </section>
            )}
          </>
        )}

        {historyOpen && session && dataset && (
          <ChangeHistoryModal
            history={history}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </main>
    </>
  );
}


export default App;
