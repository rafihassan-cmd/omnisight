import React, { useCallback, useState } from 'react';
import './FileUploader.css';

/**
 * FileUploader — Slim button design
 *
 * Supports drag-and-drop or click-to-browse.
 * Accepts an isAnalyzing prop to show a loading spinner,
 * since it now acts as the primary action trigger for the page.
 */
export default function FileUploader({ file, onFileChange, isAnalyzing, isVisible = true }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      if (isAnalyzing || !isVisible) return; // Prevent new drops while loading or hidden

      const dropped = e.dataTransfer.files?.[0];
      if (dropped) onFileChange(dropped);
    },
    [onFileChange, isAnalyzing, isVisible]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isAnalyzing && isVisible) setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleBrowse = (e) => {
    if (!isVisible) return;
    const picked = e.target.files?.[0];
    if (picked) onFileChange(picked);
    e.target.value = '';
  };

  const handleRemove = () => onFileChange(null);

  // Compute CSS classes based on state
  let classes = 'dropzone';
  if (isDragging) classes += ' dropzone--dragging';
  if (isAnalyzing) classes += ' dropzone--analyzing';

  return (
    <div className={`file-uploader ${!isVisible ? 'file-uploader--hidden' : ''}`}>
      {/* We use a label so clicking anywhere on the "button" triggers the file input */}
      <label
        id="file-dropzone"
        className={classes}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        htmlFor="file-input"
        aria-busy={isAnalyzing}
      >
        <input
          id="file-input"
          type="file"
          className="dropzone__input"
          onChange={handleBrowse}
          accept=".csv,.xlsx,.xls,.json,.parquet,.tsv"
          disabled={isAnalyzing}
        />

        {isAnalyzing ? (
          <div className="dropzone__empty">
            <span className="dropzone__spinner" aria-hidden="true" />
            <span className="dropzone__title">Analyzing dataset...</span>
          </div>
        ) : file ? (
          <div className="dropzone__file-info">
            <span className="dropzone__file-icon">📄</span>
            <div className="dropzone__file-meta">
              <span className="dropzone__file-name">{file.name}</span>
              <span className="dropzone__file-size">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
            <button
              type="button"
              className="dropzone__remove"
              onClick={(e) => { 
                e.preventDefault(); // Stop label from opening file dialog again
                handleRemove(); 
              }}
              title="Remove file"
              aria-label="Remove file"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="dropzone__empty">
            <span className="dropzone__upload-icon">↑</span>
            <span className="dropzone__title">Upload Dataset</span>
            <span className="dropzone__formats">(CSV, JSON, XLSX...)</span>
          </div>
        )}
      </label>
    </div>
  );
}
