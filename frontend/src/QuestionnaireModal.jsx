import React, { useState, useEffect } from 'react';
import { X, Sparkles, SlidersHorizontal, ArrowRight, Database, HelpCircle, Layers, Check } from 'lucide-react';

export const GOAL_MAP = {
  trends: ['trend_over_time'],
  compare_groups: ['group_comparison', 'top_n'],
  relationships: ['correlation'],
  unusual_values: ['outliers'],
  predict: ['feature_importance'],
};

export const GOAL_META = {
  trends: {
    title: 'Trends',
    sub: 'Trend over time',
    bestChart: 'Line chart (monthly or weekly)',
    why: 'Lines show change over time',
    badge: 'trend_over_time',
  },
  compare_groups: {
    title: 'Compare Groups',
    sub: 'Group comparison & Top/Bottom N',
    bestChart: 'Box plot, or bar of the mean & Horizontal bar (sorted)',
    why: 'Box shows spread, bar is simpler; long labels stay readable',
    badge: 'group_comparison, top_n',
  },
  relationships: {
    title: 'Relationships',
    sub: 'Correlation & Heatmap',
    bestChart: 'Scatter plot with trendline & Heatmap',
    why: 'Shows the relationship shape; one picture for all pairs',
    badge: 'correlation, many correlations',
  },
  unusual_values: {
    title: 'Unusual Values',
    sub: 'Outliers & Anomaly detection',
    bestChart: 'Box plot & Histogram (with box plot on top)',
    why: 'Dots mark outliers; shows shape, spread, and outlier boundaries',
    badge: 'outliers',
  },
  predict: {
    title: 'Predict',
    sub: 'Feature importance',
    bestChart: 'Horizontal bar (ranking)',
    why: 'Model output ranking shows strongest predictive drivers',
    badge: 'feature_importance',
  },
};

export default function QuestionnaireModal({
  columns = [],
  initialValues = {},
  datasetName = 'Loaded Dataset',
  onClose,
  onSubmit,
  onLoadPreset,
}) {
  const [topic, setTopic] = useState(initialValues.topic || 'Sales & Revenue');
  const [userContext, setUserContext] = useState(initialValues.userContext || 'Business Executive');
  const [goal, setGoal] = useState(initialValues.goal || 'trends');
  const [targetCol, setTargetCol] = useState(initialValues.targetCol || '');
  const [dateCol, setDateCol] = useState(initialValues.dateCol || '');
  const [groupCol, setGroupCol] = useState(initialValues.groupCol || '');

  // Select smart defaults when columns change
  useEffect(() => {
    if (columns.length > 0) {
      if (!targetCol) {
        const num = columns.find((c) => c.type === 'numeric') || columns[0];
        if (num) setTargetCol(num.name);
      }
      if (!dateCol) {
        const d = columns.find((c) => c.name.toLowerCase().match(/(date|time|month|year|timestamp)/));
        if (d) setDateCol(d.name);
      }
      if (!groupCol) {
        const cat = columns.find((c) => c.type === 'text' || c.type === 'categorical');
        if (cat) setGroupCol(cat.name);
      }
    }
  }, [columns]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!targetCol) {
      alert('Please select a Target column (the y-axis and main character).');
      return;
    }
    onSubmit({
      topic,
      userContext,
      goal,
      targetCol,
      dateCol: dateCol || null,
      groupCol: groupCol || null,
      subActions: GOAL_MAP[goal] || [],
    });
  };

  const selectedGoalMeta = GOAL_META[goal] || GOAL_META.trends;

  return (
    <div className="qmodal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qmodal-dialog" role="dialog" aria-modal="true">
        <header className="qmodal-header">
          <div className="qmodal-badge">
            <Sparkles size={13} /> OMNISIGHT AI TELEMETRY · INTAKE SETUP
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close setup">
            <X size={18} />
          </button>
        </header>

        <div className="qmodal-head-titles">
          <h2>Analysis Questionnaire &amp; Routing</h2>
          <p>
            Answer these 5 questions to frame your AI context and be routed directly to your tailored action page.
          </p>
        </div>

        {/* Dataset source / presets bar */}
        <div className="qmodal-preset-bar">
          <span className="mono">
            SOURCE: <strong>{datasetName}</strong> ({columns.length} columns)
          </span>
          {onLoadPreset && (
            <div className="qmodal-preset-actions">
              <button
                type="button"
                className="qmodal-preset-btn"
                onClick={() => onLoadPreset('revenue')}
              >
                Load Revenue Sample
              </button>
              <button
                type="button"
                className="qmodal-preset-btn"
                onClick={() => onLoadPreset('pareto')}
              >
                Load Pareto Sample
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="qmodal-form">
          {/* ── QUESTION 1: Topic & User Context ── */}
          <div className="qmodal-card">
            <div className="qmodal-qnum">QUESTION 01</div>
            <label className="qmodal-label">
              Topic &amp; Target Persona
              <small>Type of data for user to give context to AI</small>
            </label>
            <div className="qmodal-row-2">
              <div>
                <span className="qmodal-sublabel">Type of Data</span>
                <input
                  type="text"
                  className="qmodal-input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Sales, Revenue, Expense, Grade..."
                  required
                />
                <div className="qmodal-pills">
                  {['Sales / Revenue', 'Operating Expense', 'Academic Grades', 'Customer Retention'].map((t) => (
                    <button
                      type="button"
                      key={t}
                      className={`qmodal-pill ${topic === t ? 'qmodal-pill--active' : ''}`}
                      onClick={() => setTopic(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="qmodal-sublabel">User / Audience Persona</span>
                <input
                  type="text"
                  className="qmodal-input"
                  value={userContext}
                  onChange={(e) => setUserContext(e.target.value)}
                  placeholder="e.g. Business Executive, Customer, Student..."
                  required
                />
                <div className="qmodal-pills">
                  {['Business Executive', 'Department Head', 'Student / Researcher', 'Customer'].map((p) => (
                    <button
                      type="button"
                      key={p}
                      className={`qmodal-pill ${userContext === p ? 'qmodal-pill--active' : ''}`}
                      onClick={() => setUserContext(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── QUESTION 2: Goals Dropdown ── */}
          <div className="qmodal-card">
            <div className="qmodal-qnum">QUESTION 02</div>
            <label className="qmodal-label">
              Goals Dropdown
              <small>Maps directly to your action page via GOAL_MAP</small>
            </label>

            <select
              id="goal-select"
              className="qmodal-select qmodal-select--lg"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            >
              <option value="trends">trends &rarr; ["trend_over_time"]</option>
              <option value="compare_groups">compare_groups &rarr; ["group_comparison", "top_n"]</option>
              <option value="relationships">relationships &rarr; ["correlation"]</option>
              <option value="unusual_values">unusual_values &rarr; ["outliers"]</option>
              <option value="predict">predict &rarr; ["feature_importance"]</option>
            </select>

            <div className="qmodal-goal-spec">
              <div className="qmodal-goal-spec-top">
                <span className="qmodal-goal-badge">{selectedGoalMeta.badge}</span>
                <strong>{selectedGoalMeta.title} Action Page</strong>
              </div>
              <div className="qmodal-goal-spec-chart">
                <span>Best chart:</span> <strong>{selectedGoalMeta.bestChart}</strong>
              </div>
              <div className="qmodal-goal-spec-why">
                <span>Why:</span> <em>{selectedGoalMeta.why}</em>
              </div>
            </div>
          </div>

          {/* ── QUESTION 3, 4, 5: Column Mapping ── */}
          <div className="qmodal-grid-cols">
            {/* Question 3: Target Column */}
            <div className="qmodal-card">
              <div className="qmodal-qnum">QUESTION 03</div>
              <label className="qmodal-label">
                Target Column <span className="req">*</span>
                <small>The y-axis and the "main character" of every chart</small>
              </label>
              <select
                id="target-col-select"
                className="qmodal-select"
                value={targetCol}
                onChange={(e) => setTargetCol(e.target.value)}
                required
              >
                <option value="" disabled>-- Select Target Column --</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Question 4: Date Column */}
            <div className="qmodal-card">
              <div className="qmodal-qnum">QUESTION 04</div>
              <label className="qmodal-label">
                Date Column
                <small>Unlocks trend analysis; if none, trend is skipped</small>
              </label>
              <select
                id="date-col-select"
                className="qmodal-select"
                value={dateCol}
                onChange={(e) => setDateCol(e.target.value)}
              >
                <option value="">[None] - Skip trend analysis</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Question 5: Group Column <ANOVA> */}
            <div className="qmodal-card">
              <div className="qmodal-qnum">QUESTION 05</div>
              <label className="qmodal-label">
                Group Column &lt;ANOVA&gt;
                <small>Unlocks group comparison &amp; breakdown charts</small>
              </label>
              <select
                id="group-col-select"
                className="qmodal-select"
                value={groupCol}
                onChange={(e) => setGroupCol(e.target.value)}
              >
                <option value="">[None] - No group breakdown</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Modal Footer */}
          <footer className="qmodal-footer">
            <div className="qmodal-footer-summary mono">
              Target: <span className="highlight">{targetCol || 'None'}</span> • Goal: <span className="highlight">{selectedGoalMeta.title}</span> • Persona: {userContext}
            </div>
            <div className="qmodal-footer-btns">
              <button type="button" className="outline-button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="execute-button" id="submit-questionnaire-btn">
                Launch {selectedGoalMeta.title} Action Page <ArrowRight size={14} />
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
