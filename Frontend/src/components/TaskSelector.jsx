import React from 'react';
import './TaskSelector.css';

/**
 * Task data — this is the source-of-truth for task options.
 * Each card holds one or more "tasks" (pill buttons).
 *
 * ── HOW TO WIRE TO FASTAPI ──
 * After the user selects tasks and clicks "Analyze", POST the
 * `selectedTasks` array to your endpoint, e.g.:
 *
 *   POST /api/tasks/select
 *   Body: { "tasks": ["clean_data", "visualize"] }
 *
 * You can also GET /api/tasks to load available tasks dynamically
 * from the backend and replace the TASK_CARDS constant below.
 */
export const TASK_CARDS = [
  {
    id: 'card-1',
    heading: 'Data Preparation',
    tasks: [
      { id: 'clean_data', label: 'Clean data' },
    ],
  },
  {
    id: 'card-2',
    heading: 'Exploration & Visuals',
    tasks: [
      { id: 'visualize', label: 'Visualize your data' },
      { id: 'plot_results', label: 'Plot results' },
    ],
  },
  {
    id: 'card-3',
    heading: 'Insights & Summary',
    tasks: [
      { id: 'statistics', label: 'Check statistics' },
      { id: 'intelligence_summary', label: 'See intelligence summary' },
    ],
  },
];

/**
 * TaskSelector
 *
 * Props:
 *   selectedTasks  {string[]}  — array of selected task IDs
 *   onToggleTask   {(id: string) => void}  — toggle callback
 */
export default function TaskSelector({ selectedTasks, onToggleTask }) {
  return (
    <section className="task-selector">
      <h2 className="task-selector__question">How should we analyze?</h2>
      <div className="task-selector__grid">
        {TASK_CARDS.map((card) => (
          <div key={card.id} className="task-card" id={card.id}>
            <h3 className="task-card__heading">{card.heading}</h3>
            <div className="task-card__pills">
              {card.tasks.map((task) => {
                const isSelected = selectedTasks.includes(task.id);
                return (
                  <button
                    key={task.id}
                    id={`task-pill-${task.id}`}
                    className={`task-pill ${isSelected ? 'task-pill--selected' : ''}`}
                    onClick={() => onToggleTask(task.id)}
                    aria-pressed={isSelected}
                    title={`Toggle: ${task.label}`}
                  >
                    {isSelected && <span className="task-pill__check">✓</span>}
                    {task.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
