import React, { useCallback, useState } from 'react';
import './FileUploader.css';

/**
 * FileUploader
 *
 * A drag-and-drop + click-to-browse file dropzone.
 *
 * ── HOW TO WIRE TO FASTAPI ──
 * When the user clicks "Analyze" (or you trigger submission),
 * build a FormData object and POST to your upload endpoint:
 *
 *   const formData = new FormData();
 *   formData.append('file', file);
 *   // Optionally attach selected tasks:
 *   formData.append('tasks', JSON.stringify(selectedTasks));
 *
 *   const response = await fetch('/api/upload', {
 *     method: 'POST',
 *     body: formData,
 *   });
 *   const result = await response.json();
 *
 * Props:
 *   file        {File | null}   — currently staged file
 *   onFileChange {(file: File | null) => void}  — setter callback
 */
export default function FileUploader({ file, onFileChange }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) onFileChange(dropped);
    },
    [onFileChange]
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleBrowse = (e) => {
    const picked = e.target.files?.[0];
    if (picked) onFileChange(picked);
    /* Reset input so the same file can be re-selected */
    e.target.value = '';
  };

  const handleRemove = () => onFileChange(null);

  return (
    <div className="file-uploader">
      <label
        id="file-dropzone"
        className={`dropzone ${isDragging ? 'dropzone--dragging' : ''} ${file ? 'dropzone--has-file' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        htmlFor="file-input"
      >
        {/* Hidden native file input */}
        <input
          id="file-input"
          type="file"
          className="dropzone__input"
          onChange={handleBrowse}
          /* Accept common data formats — adjust to match your backend */
          accept=".csv,.xlsx,.xls,.json,.parquet,.tsv"
        />

        {file ? (
          <div className="dropzone__file-info">
            <span className="dropzone__file-icon">📄</span>
            <div className="dropzone__file-meta">
              <span className="dropzone__file-name">{file.name}</span>
              <span className="dropzone__file-size">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
            <button
              className="dropzone__remove"
              onClick={(e) => { e.preventDefault(); handleRemove(); }}
              title="Remove file"
              aria-label="Remove file"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="dropzone__empty">
            <div className="dropzone__icon-wrap">
              <span className="dropzone__upload-icon">⬆</span>
            </div>
            <div className="dropzone__text-group">
              <p className="dropzone__title">Drop your dataset here</p>
              <p className="dropzone__subtitle">
                or <span className="dropzone__browse-link">click to browse</span>
              </p>
              <p className="dropzone__formats">CSV · XLSX · JSON · Parquet · TSV</p>
            </div>
          </div>
        )}
      </label>
    </div>
  );
}
