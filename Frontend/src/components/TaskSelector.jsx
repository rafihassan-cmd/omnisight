import React from 'react';
import './TaskSelector.css';

/**
 * Task data — Flat array of independent analysis functions.
 * Icons are minimal SVG paths (Lucide-inspired).
 */
export const TASKS = [
  {
    id: 'clean_data',
    title: 'Clean data',
    desc: 'Automated handling of missing values, outliers, and duplicates.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="7.5 4.21 12 6.81 16.5 4.21"/>
        <polyline points="7.5 19.79 7.5 14.6 3 12"/>
        <polyline points="21 12 16.5 14.6 16.5 19.79"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    )
  },
  {
    id: 'visualize',
    title: 'Visualize your data',
    desc: 'Interactive charts and rich exploratory dashboards.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
        <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
      </svg>
    )
  },
  {
    id: 'plot_results',
    title: 'Plot results',
    desc: 'Export publication-ready plots and standard visualizations.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
      </svg>
    )
  },
  {
    id: 'statistics',
    title: 'Check statistics',
    desc: 'Run descriptive and inferential statistical tests easily.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
      </svg>
    )
  },
  {
    id: 'intelligence_summary',
    title: 'Intelligence summary',
    desc: 'Get AI-generated narratives and core insights from your data.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    )
  }
];

export default function TaskSelector({ selectedTasks, onToggleTask }) {
  return (
    <section className="task-selector">
      <h2 className="task-selector__question">How should we analyze?</h2>
      
      <div className="task-selector__grid">
        {TASKS.map((task) => {
          const isSelected = selectedTasks.includes(task.id);
          return (
            <button
              key={task.id}
              id={`task-card-${task.id}`}
              className={`task-card ${isSelected ? 'task-card--selected' : ''}`}
              onClick={() => onToggleTask(task.id)}
              aria-pressed={isSelected}
            >
              <div className="task-card__icon">{task.icon}</div>
              <h3 className="task-card__title">{task.title}</h3>
            </button>
          );
        })}
      </div>
    </section>
  );
}
