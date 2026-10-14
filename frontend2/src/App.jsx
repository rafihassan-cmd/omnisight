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
  deleteDatasetColumn
} from "./api/datasets";

import DatasetOverview from "./features/overview/DatasetOverview";
import CleaningWorkspace from "./features/cleaning/CleaningWorkspace";
import QuestionPlanner from "./features/planner/QuestionPlanner";

function App() {
  const [session, setSession] = useState(null);
  const [dataset, setDataset] = useState(null);

  const [selectedFile, setSelectedFile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

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

  async function handleDeleteColumn(
  columnId,
  columnName
) {
  if (!dataset || busy) {
    return;
  }

  const confirmed = window.confirm(
    `Delete column "${columnName}"?\n\n` +
    "This removes the column from the working dataset " +
    "and records the deletion in history.\n\n" +
    "You can restore it using Undo or Reset."
  );

  if (!confirmed) {
    return;
  }

  setUploading(true);
  setError("");

  try {
    const updated = await deleteDatasetColumn(
      columnId,
      dataset.version
    );

    setDataset(updated);

  } catch (err) {
    setError(err.message);
    throw err;

  } finally {
    setUploading(false);
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
    <main className="app-shell">
      <header className="app-header">
        <h1>OmniSight</h1>

        <p className="muted">
          Interactive Data Analytics Platform
        </p>
      </header>

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
              {session.idle_timeout_seconds / 60} minutes
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(event) => {
                setSelectedFile(
                  event.target.files?.[0] || null
                );
              }}
            />

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
          onDelete={handleDeleteColumn}
          disabled={busy}
        />

        <CleaningWorkspace
          key={`cleaning-${dataset.dataset_id}`}
          dataset={dataset}
          disabled={busy}
          onDatasetChanged={(updatedDataset) => {
            setDataset(updatedDataset);
          }}
          onRefreshDataset={handleRefreshSession}
        />
        <QuestionPlanner
          key={`planner-${dataset.dataset_id}`}
          dataset={dataset}
          disabled={busy}
          onRefreshDataset={handleRefreshSession}
        />
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
    </main>
  );
}


export default App;