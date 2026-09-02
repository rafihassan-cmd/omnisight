import React, { useCallback, useState } from 'react';
import './App.css';

import HeroHeader from './components/HeroHeader';
import TaskSelector from './components/TaskSelector';
import FileUploader from './components/FileUploader';
import MarqueeSection from './components/MarqueeSection';

/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║                  OmniSight — Home Page                   ║
 * ╚══════════════════════════════════════════════════════════╝
 */
export default function App() {
  /* ── State ── */
  const [selectedTask, setSelectedTask] = useState(null);
  const [file, setFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  /* ── Task toggle handler ── */
const handleToggleTask = useCallback((taskId) => {
  setSelectedTask((prev) => (prev === taskId ? null : taskId));
}, []);

  /* ── File change & Auto-Analyze handler ── */
  const handleFileChange = useCallback(async (newFile) => {
    setFile(newFile);
    setErrorMsg('');

    if (newFile && selectedTask.length > 0) {
      setIsAnalyzing(true);

      try {
        console.log('[OmniSight] Sending to backend:', {
          file: newFile.name,
          tasks: selectedTask,
        });

        await new Promise((r) => setTimeout(r, 1500));

        alert(`✅ Submitted!\nFile: ${newFile.name}\nTasks: ${selectedTask.join(', ')}`);
      } catch (err) {
        setErrorMsg(`Analysis failed: ${err.message}`);
      } finally {
        setIsAnalyzing(false);
      }
    }
  }, [selectedTask]);

  /* ── Render ── */
  return (
    <div className="omnisight-root">

      {/* ████████  TOP SECTION  ████████ */}
      <section className="hero-section" aria-label="OmniSight hero">
        {/* Elliptical Background Blob */}
        <div className="hero-section__blob" aria-hidden="true" />

        <div className="hero-section__content">
          <HeroHeader />

          <TaskSelector
  selectedTask={selectedTask}
  onToggleTask={handleToggleTask}
/>

          <FileUploader
  isVisible={Boolean(selectedTask)}
  file={file}
  onFileChange={handleFileChange}
  isAnalyzing={isAnalyzing}
/>

          {/* ── Error feedback ── */}
          {errorMsg && <div className="hero-section__error">{errorMsg}</div>}
        </div>
      </section>

      {/* ████████  BOTTOM SECTION  ████████ */}
      <MarqueeSection />

    </div>
  );
}