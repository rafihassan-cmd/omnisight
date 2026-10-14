import { useEffect, useState } from "react";

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
  deleteDatasetColumn,
} from "./api/datasets";

import { StepperNav, StepFooter } from "./components/StepperNav";
import HistoryDrawer from "./features/history/HistoryDrawer";
import IngestionWorkspace from "./features/ingest/IngestionWorkspace";
import DatasetOverview from "./features/overview/DatasetOverview";
import CleaningWorkspace from "./features/cleaning/CleaningWorkspace";
import QuestionPlanner from "./features/planner/QuestionPlanner";
import VisualizationWorkspace from "./features/analysis/VisualizationWorkspace";

function App() {
  const [session, setSession] = useState(null);
  const [dataset, setDataset] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [activeExecution, setActiveExecution] = useState(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const busy = loading || uploading;

  // Initialize session on mount
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

        if (currentDataset) {
          setCurrentStep(2);
        }
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
      setActiveExecution(null);
      setCurrentStep(1);
      clearSessionInitialization();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadDataset(file) {
    if (!file || !session) return;

    setUploading(true);
    setError("");

    try {
      const result = await uploadDataset(file);
      setDataset(result);
      setActiveExecution(null);

      setSession((previous) => ({
        ...previous,
        has_dataset: true,
      }));

      // Advance to Step 2 upon successful upload
      setCurrentStep(2);
    } catch (err) {
      setError(err.message);
      throw err;
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
      setActiveExecution(null);
      setCurrentStep(1);

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

  async function handleDeleteColumn(columnId, columnName) {
    if (!dataset || busy) return;

    const confirmed = window.confirm(
      `Delete column "${columnName}"?\n\n` +
        "This removes the column from the working dataset and records the deletion in the audit trail.\n\n" +
        "You can restore it using Undo or Reset in the left Audit Drawer."
    );

    if (!confirmed) return;

    setUploading(true);
    setError("");

    try {
      const updated = await deleteDatasetColumn(columnId, dataset.version);
      setDataset(updated);
      setActiveExecution(null);
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
      setActiveExecution(null);
      return result;
    } finally {
      setLoading(false);
    }
  }

  function handleDatasetChanged(updatedDataset) {
    setDataset(updatedDataset);
    setActiveExecution(null);
  }

  function handleSelectStep(stepId) {
    if (stepId > 1 && !dataset) return;
    if (stepId === 5 && !activeExecution) return;
    setCurrentStep(stepId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNextStep() {
    if (currentStep < 5) {
      handleSelectStep(currentStep + 1);
    }
  }

  function handlePrevStep() {
    if (currentStep > 1) {
      handleSelectStep(currentStep - 1);
    }
  }

  return (
    <div className="telemetry-workbench-root">
      {/* Global Slide-out History Drawer (Hover left edge on EVERY page) */}
      <HistoryDrawer
        dataset={dataset}
        disabled={busy}
        onDatasetChanged={handleDatasetChanged}
        onRefreshDataset={handleRefreshSession}
      />

      {/* Topbar Navigation from Sami design */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-group">
            <div className="brand-symbol" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </div>
            <div className="brand-titles">
              <span className="brand-name">OMNISIGHT</span>
              <span className="brand-version">v2.4</span>
            </div>
          </div>

          <div className="topbar-right">
            {dataset && (
              <span className="workspace-pill" title={dataset.filename}>
                <span className="mono">DATASET:</span> {dataset.filename} <span className="sample-badge">v{dataset.version}</span>
              </span>
            )}

            {session ? (
              <span className="live-label">
                <span className="pulse-dot" /> SESSION CONNECTED
              </span>
            ) : (
              <span className="live-label idle">NO SESSION</span>
            )}
          </div>
        </div>
      </header>

      {/* Hero Eyebrow Header */}
      <div className="workbench-hero-bar">
        <div className="hero-bar-inner">
          <span className="eyebrow">AUTONOMOUS TELEMETRY & STATISTICAL WORKBENCH</span>
          <h1 className="hero-title">High-dimensional CSV Intelligence.</h1>
          <p className="hero-subtitle">
            Ingest, inspect, clean, plan deterministic inquiries, and render interactive telemetry.
          </p>
        </div>
      </div>

      {/* Stepper Workflow Header Rail */}
      <StepperNav
        currentStep={currentStep}
        onSelectStep={handleSelectStep}
        dataset={dataset}
        execution={activeExecution}
      />

      {/* Main Page Content Body */}
      <main className="telemetry-main-body">
        {loading && !dataset && !session && (
          <div className="loading-state-box">
            <div className="spin-indicator" />
            <p>Initializing OmniSight telemetry runtime...</p>
          </div>
        )}

        {error && (
          <div className="error-message" role="alert">
            <span>⚠️ {error}</span>
            <button
              type="button"
              className="bmw-btn-link"
              onClick={() => setError("")}
            >
              DISMISS
            </button>
          </div>
        )}

        {/* STEP 1: Ingestion & Session */}
        {currentStep === 1 && (
          <IngestionWorkspace
            session={session}
            dataset={dataset}
            loading={loading}
            uploading={uploading}
            busy={busy}
            error={error}
            onStartSession={handleStartSession}
            onEndSession={handleEndSession}
            onRefreshSession={handleRefreshSession}
            onUploadDataset={handleUploadDataset}
            onDeleteDataset={handleDeleteDataset}
            onProceedToNext={() => setCurrentStep(2)}
          />
        )}

        {/* STEP 2: Dataset Overview & Schema Profile */}
        {currentStep === 2 && dataset && (
          <div className="stage-page-container">
            <div className="stage-page-header">
              <span className="eyebrow">STAGE 02 / DATASET SCHEMA & PROFILING</span>
              <h2>Dataset Schema & Anomaly Screening</h2>
              <p className="muted">
                Inspect summary statistics, null distributions, detected types, and manage columns.
              </p>
            </div>

            <DatasetOverview
              key={`overview-${dataset.dataset_id}-${dataset.version}`}
              dataset={dataset}
              onRename={handleRenameColumn}
              onDelete={handleDeleteColumn}
              disabled={busy}
            />
          </div>
        )}

        {/* STEP 3: Data Cleaning & Transformations */}
        {currentStep === 3 && dataset && (
          <div className="stage-page-container">
            <div className="stage-page-header">
              <span className="eyebrow">STAGE 03 / DATA CLEANING & REVERSIBLE TRANSFORMS</span>
              <h2>Data Cleaning & Transformation Engine</h2>
              <p className="muted">
                Configure reproducible transformations with live before/after previews before committing.
              </p>
            </div>

            <CleaningWorkspace
              key={`cleaning-${dataset.dataset_id}-${dataset.version}`}
              dataset={dataset}
              disabled={busy}
              onDatasetChanged={handleDatasetChanged}
              onRefreshDataset={handleRefreshSession}
            />
          </div>
        )}

        {/* STEP 4: Analytical Question Planner */}
        {currentStep === 4 && dataset && (
          <div className="stage-page-container">
            <div className="stage-page-header">
              <span className="eyebrow">STAGE 04 / ANALYTICAL PLANNER & STATISTICAL EXECUTOR</span>
              <h2>Deterministic Analytical Planner</h2>
              <p className="muted">
                Select eligible analytical questions tailored to your schema, configure parameters, and execute.
              </p>
            </div>

            <QuestionPlanner
              key={`planner-${dataset.dataset_id}-${dataset.version}`}
              dataset={dataset}
              disabled={busy}
              onRefreshDataset={handleRefreshSession}
              onAnalysisExecuted={(res) => {
                setActiveExecution(res);
              }}
            />
          </div>
        )}

        {/* STEP 5: Visualization & AI Synthesis */}
        {currentStep === 5 && (
          <VisualizationWorkspace
            execution={activeExecution}
            onGoToPlanner={() => setCurrentStep(4)}
          />
        )}

        {/* Step Navigation Footer */}
        <StepFooter
          currentStep={currentStep}
          onPrevious={handlePrevStep}
          onNext={handleNextStep}
          dataset={dataset}
          execution={activeExecution}
        />
      </main>

      {/* Signature Statusbar from Sami design */}
      <footer className="statusbar">
        <span>🛡️ CONNECTED ANALYSIS API · VERIFIED IN-MEMORY WORKBENCH</span>
        <span>OMNISIGHT <b>/</b> INTELLIGENCE, IN FOCUS.</span>
      </footer>
    </div>
  );
}

export default App;