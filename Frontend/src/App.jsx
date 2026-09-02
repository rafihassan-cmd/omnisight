import React, { useCallback, useState } from 'react';
import './App.css';

import HeroHeader    from './components/HeroHeader';
import TaskSelector  from './components/TaskSelector';
import FileUploader  from './components/FileUploader';
import CurvedDivider from './components/CurvedDivider';
import MarqueeSection from './components/MarqueeSection';

/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║                  OmniSight — Home Page                   ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * State managed here (lift-up pattern) so it is trivial to
 * extract into a Context or Zustand store later.
 *
 * ── FastAPI integration surface ──
 *  • selectedTasks  → POST /api/tasks/select  { tasks: string[] }
 *  • file           → multipart POST /api/upload  (FormData)
 *  • handleAnalyze  → the single function you will flesh out
 *                     once your backend endpoints are ready.
 */
export default function App() {
  /* ── State ── */
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [file, setFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  /* ── Task toggle handler ── */
  const handleToggleTask = useCallback((taskId) => {
    setSelectedTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    );
  }, []);

  /* ── File change handler ── */
  const handleFileChange = useCallback((newFile) => {
    setFile(newFile);
    setErrorMsg('');
  }, []);

  /* ── Analyze handler ──────────────────────────────────────
   *
   *  WIRE YOUR FASTAPI ENDPOINTS HERE.
   *
   *  Suggested flow:
   *   1. Validate that at least one task is selected AND a file is staged.
   *   2. Build FormData with the file.
   *   3. POST to /api/upload  → get back a dataset_id.
   *   4. POST to /api/analyze { dataset_id, tasks: selectedTasks }.
   *   5. Navigate to a results page / show a progress toast.
   *
   *  Example skeleton (uncomment and adapt):
   *
   *  const formData = new FormData();
   *  formData.append('file', file);
   *  formData.append('tasks', JSON.stringify(selectedTasks));
   *
   *  const res = await fetch('/api/analyze', {
   *    method: 'POST',
   *    body: formData,
   *  });
   *  const data = await res.json();
   *  // navigate('/results', { state: data });
   *
   * ────────────────────────────────────────────────────────── */
  const handleAnalyze = async () => {
    if (!file) {
      setErrorMsg('Please upload a dataset first.');
      return;
    }
    if (selectedTasks.length === 0) {
      setErrorMsg('Please select at least one analysis task.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg('');

    try {
      /* ── TODO: replace this stub with your real API call ── */
      console.log('[OmniSight] Sending to backend:', {
        file: file.name,
        tasks: selectedTasks,
      });

      /* Simulate a brief network delay for demo purposes */
      await new Promise((r) => setTimeout(r, 1500));

      alert(`✅ Submitted!\nFile: ${file.name}\nTasks: ${selectedTasks.join(', ')}`);
    } catch (err) {
      setErrorMsg(`Analysis failed: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  /* ── Render ── */
  return (
    <div className="omnisight-root">

      {/* ████████  TOP SECTION  ████████ */}
      <section className="hero-section" aria-label="OmniSight hero">
        {/* Ambient background orbs */}
        <div className="hero-section__orb hero-section__orb--a" aria-hidden="true" />
        <div className="hero-section__orb hero-section__orb--b" aria-hidden="true" />

        <div className="hero-section__content">
          <HeroHeader />

          <TaskSelector
            selectedTasks={selectedTasks}
            onToggleTask={handleToggleTask}
          />

          <FileUploader
            file={file}
            onFileChange={handleFileChange}
          />

          {/* ── Error feedback ── */}
          {errorMsg && (
            <p className="hero-section__error" role="alert">{errorMsg}</p>
          )}

          {/* ── Analyze CTA ── */}
          <div className="hero-section__cta">
            <button
              id="analyze-btn"
              className={`analyze-btn ${isAnalyzing ? 'analyze-btn--loading' : ''}`}
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              aria-busy={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <span className="analyze-btn__spinner" aria-hidden="true" />
                  Analyzing…
                </>
              ) : (
                <>
                  <span className="analyze-btn__icon" aria-hidden="true">⚡</span>
                  Analyze
                </>
              )}
            </button>

            {selectedTasks.length > 0 && (
              <p className="hero-section__task-count">
                {selectedTasks.length} task{selectedTasks.length > 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ████████  CURVED DIVIDER  ████████ */}
      <CurvedDivider fillColor="#f5f2eb" />

      {/* ████████  BOTTOM SECTION  ████████ */}
      <MarqueeSection />

    </div>
  );
}
