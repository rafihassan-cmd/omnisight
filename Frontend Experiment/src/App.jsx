import React, { useCallback, useState } from 'react';
import './App.css';

import HeroHeader from './components/HeroHeader';
import TaskSelector from './components/TaskSelector';
import FileUploader from './components/FileUploader';
import MarqueeSection from './components/MarqueeSection';


export default function App() {
  /* ── State ── */
  const [selectedTask, setSelectedTask] = useState(null);
  const [file, setFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
        const formData = new FormData();
        formData.append('file', newFile);
        formData.append('task', selectedTask);

        const response = await fetch('http://127.0.0.1:8000/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Server error: ${response.status}`);
        }

        const data = await response.json();
        console.log('[OmniSight] Backend response:', data);
        setSuccessMsg('File uploaded successfully')

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
          {successMsg && <div className="hero-section__success">{successMsg}</div>}
        </div>
      </section>

      {/* ████████  BOTTOM SECTION  ████████ */}
      <MarqueeSection />

    </div>
  );
}