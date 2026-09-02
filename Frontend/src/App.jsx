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

  /* ── File change & Auto-Analyze handler ── */
  const handleFileChange = useCallback(async (newFile) => {
    setFile(newFile);
    setErrorMsg('');

    // Auto-trigger analysis if a file is provided and tasks are selected.
    if (newFile && selectedTasks.length > 0) {
      setIsAnalyzing(true);
      
      try {
        /* ── TODO: replace this stub with your real API call ── */
        console.log('[OmniSight] Sending to backend:', {
          file: newFile.name,
          tasks: selectedTasks,
        });

        /* Simulate a brief network delay for demo purposes */
        await new Promise((r) => setTimeout(r, 1500));

        alert(`✅ Submitted!\nFile: ${newFile.name}\nTasks: ${selectedTasks.join(', ')}`);
      } catch (err) {
        setErrorMsg(`Analysis failed: ${err.message}`);
      } finally {
        setIsAnalyzing(false);
      }
    }
  }, [selectedTasks]);

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

          {selectedTasks.length > 0 && (
            <FileUploader
              file={file}
              onFileChange={handleFileChange}
              isAnalyzing={isAnalyzing}
            />
          )}

          {/* ── Error feedback ── */}
          {errorMsg && (
            <p className="hero-section__error" role="alert">{errorMsg}</p>
          )}
        </div>
      </section>

      {/* ████████  CURVED DIVIDER  ████████ */}
      <CurvedDivider fillColor="#f5f2eb" />

      {/* ████████  BOTTOM SECTION  ████████ */}
      <MarqueeSection />

    </div>
  );
}
