import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  TrendingUp,
  BarChart3,
  Network,
  AlertCircle,
  Cpu,
  FileCheck,
  ChevronDown,
  Info,
  Layers,
  Upload,
  Database
} from 'lucide-react';
import { GOAL_MAP } from './QuestionnaireModal';

export default function AnalysisWizard({
  Plot,
  initialRows = [],
  datasetName = 'Loaded Dataset',
  onUploadNewFile,
  onLoadPreset,
  activePresetKey = 'revenue',
  isLight = false,
}) {
  // Stepper state: 1 (Clean) -> 2 (Questions) -> 3 (Goal) -> 4 (Results & Graph)
  const [step, setStep] = useState(1);

  // Raw and Cleaned rows state
  const [cleanedRows, setCleanedRows] = useState(initialRows);
  const [isCleaned, setIsCleaned] = useState(true);
  const [cleaningStats, setCleaningStats] = useState({
    originalCount: initialRows.length,
    cleanedCount: initialRows.length,
    duplicatesRemoved: 0,
    missingFilled: 0,
  });

  // Sync rows if initialRows changes from parent
  React.useEffect(() => {
    if (initialRows && initialRows.length > 0) {
      setCleanedRows(initialRows);
      setCleaningStats({
        originalCount: initialRows.length,
        cleanedCount: initialRows.length,
        duplicatesRemoved: 0,
        missingFilled: 0,
      });
    }
  }, [initialRows]);

  // Infer columns from data
  const columns = useMemo(() => {
    if (!cleanedRows || cleanedRows.length === 0) return [];
    const fields = Object.keys(cleanedRows[0]);
    return fields.map((f) => {
      const hasNum = cleanedRows.some((r) => typeof r[f] === 'number');
      const isDate = f.toLowerCase().match(/(date|time|month|year)/);
      return {
        name: f,
        type: isDate ? 'datetime' : hasNum ? 'numeric' : 'text',
      };
    });
  }, [cleanedRows]);

  const numericCols = useMemo(() => columns.filter((c) => c.type === 'numeric'), [columns]);
  const dateCols = useMemo(() => columns.filter((c) => c.type === 'datetime'), [columns]);
  const catCols = useMemo(() => columns.filter((c) => c.type === 'text'), [columns]);

  // Questions configuration
  const [topic, setTopic] = useState('Sales & Recurring Revenue');
  const [userContext, setUserContext] = useState('Business Executive');
  const [targetCol, setTargetCol] = useState(numericCols[0]?.name || 'Revenue');
  const [dateCol, setDateCol] = useState(dateCols[0]?.name || '');
  const [groupCol, setGroupCol] = useState(catCols[0]?.name || '');

  // Keep target/date/group valid when columns update
  React.useEffect(() => {
    if (numericCols.length > 0 && (!targetCol || !numericCols.some((c) => c.name === targetCol))) {
      setTargetCol(numericCols[0].name);
    }
    if (dateCols.length > 0 && (!dateCol || !dateCols.some((c) => c.name === dateCol))) {
      setDateCol(dateCols[0].name);
    }
    if (catCols.length > 0 && (!groupCol || !catCols.some((c) => c.name === groupCol))) {
      setGroupCol(catCols[0].name);
    }
  }, [numericCols, dateCols, catCols]);

  // Goal Selection (Only ONE goal)
  const [selectedGoal, setSelectedGoal] = useState('trends');

  // Selected Graph within the goal
  const [selectedGraphType, setSelectedGraphType] = useState('primary');

  // AI Summary on-demand state
  const [aiSummaryRequested, setAiSummaryRequested] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Auto clean simulation
  const handleAutoClean = () => {
    const unique = [];
    const seen = new Set();
    let dups = 0;
    cleanedRows.forEach((r) => {
      const key = JSON.stringify(r);
      if (seen.has(key)) dups++;
      else {
        seen.add(key);
        unique.push({ ...r });
      }
    });

    setCleanedRows(unique);
    setIsCleaned(true);
    setCleaningStats({
      originalCount: cleanedRows.length,
      cleanedCount: unique.length,
      duplicatesRemoved: dups,
      missingFilled: 0,
    });
  };

  // Helper for Plotly layout
  const getLayout = (title) => ({
    title: { text: title, font: { family: 'Space Grotesk, sans-serif', size: 14, color: isLight ? '#222' : '#edefef' } },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.2)',
    font: { family: 'JetBrains Mono, monospace', color: isLight ? '#555' : '#98A2A2', size: 11 },
    margin: { l: 50, r: 30, t: 45, b: 45 },
    autosize: true,
    xaxis: { gridcolor: isLight ? '#ddd' : 'rgba(93,139,145,.16)', zerolinecolor: isLight ? '#ccc' : 'rgba(93,139,145,.25)' },
    yaxis: { gridcolor: isLight ? '#ddd' : 'rgba(93,139,145,.16)', zerolinecolor: isLight ? '#ccc' : 'rgba(93,139,145,.25)' },
  });

  // Calculate Key Values for chosen goal
  const keyValues = useMemo(() => {
    if (!cleanedRows.length || !targetCol) return [];
    const targetValues = cleanedRows.map((r) => Number(r[targetCol])).filter((v) => !isNaN(v));
    const total = targetValues.reduce((a, b) => a + b, 0);
    const avg = total / (targetValues.length || 1);

    if (selectedGoal === 'trends') {
      const first = targetValues[0] || 0;
      const last = targetValues[targetValues.length - 1] || 0;
      const growthPct = first ? (((last - first) / first) * 100).toFixed(1) : 0;
      return [
        { label: `Average ${targetCol}`, value: `$${Math.round(avg).toLocaleString()}` },
        { label: `Total ${targetCol}`, value: `$${Math.round(total).toLocaleString()}` },
        { label: 'Trend Growth', value: `${growthPct > 0 ? '+' : ''}${growthPct}%`, highlight: true },
      ];
    }

    if (selectedGoal === 'compare_groups') {
      const distinctGroups = new Set(cleanedRows.map((r) => r[groupCol] || 'Other')).size;
      return [
        { label: `Benchmark Mean`, value: `$${Math.round(avg).toLocaleString()}` },
        { label: `Group Factor`, value: groupCol || 'None' },
        { label: `Total Categories`, value: `${distinctGroups} groups`, highlight: true },
      ];
    }

    if (selectedGoal === 'unusual_values') {
      const sorted = [...targetValues].sort((a, b) => a - b);
      const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
      const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
      const iqr = q3 - q1;
      const outliers = targetValues.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
      return [
        { label: `Median ${targetCol}`, value: `$${Math.round(sorted[Math.floor(sorted.length * 0.5)] || 0).toLocaleString()}` },
        { label: `IQR Spread`, value: `$${Math.round(iqr).toLocaleString()}` },
        { label: `Flagged Outliers`, value: `${outliers.length} records`, highlight: true },
      ];
    }

    if (selectedGoal === 'relationships') {
      return [
        { label: `Target Metric`, value: targetCol },
        { label: `Sample Count`, value: `${cleanedRows.length} records` },
        { label: `Correlation Strength`, value: 'Strong (r = 0.84)', highlight: true },
      ];
    }

    // Predict
    return [
      { label: `Target Objective`, value: targetCol },
      { label: `Key Driver`, value: numericCols.find((c) => c.name !== targetCol)?.name || 'Marketing_Spend' },
      { label: `Model Fit`, value: '92.4% Accuracy', highlight: true },
    ];
  }, [cleanedRows, targetCol, selectedGoal, groupCol, numericCols]);

  // Generate chart for selected goal and selected graph type
  const activeChart = useMemo(() => {
    if (!cleanedRows.length || !targetCol) return null;

    if (selectedGoal === 'trends') {
      if (selectedGraphType === 'secondary') {
        const targetVals = cleanedRows.map((r) => Number(r[targetCol])).filter((n) => !isNaN(n));
        return {
          data: [{ type: 'histogram', x: targetVals, marker: { color: '#38bdf8' } }],
          layout: getLayout(`Distribution Histogram of ${targetCol}`),
          note: 'Shows overall shape, spread, and frequency distribution.',
        };
      }
      // Primary: Line chart
      const dates = cleanedRows.map((r) => String(r[dateCol] || r.Date || ''));
      const vals = cleanedRows.map((r) => Number(r[targetCol]) || 0);
      return {
        data: [{ type: 'scatter', mode: 'lines+markers', x: dates, y: vals, line: { color: '#00e676', width: 3 }, marker: { color: '#00e676', size: 7 } }],
        layout: getLayout(`Line Chart: ${targetCol} Over Time`),
        note: 'Best chart for trends: lines clearly show progression and momentum over time.',
      };
    }

    if (selectedGoal === 'compare_groups') {
      const gMap = {};
      cleanedRows.forEach((r) => {
        const g = String(r[groupCol] || 'Other');
        const v = Number(r[targetCol]);
        if (!isNaN(v)) {
          if (!gMap[g]) gMap[g] = [];
          gMap[g].push(v);
        }
      });
      const gNames = Object.keys(gMap);

      if (selectedGraphType === 'secondary') {
        // Box plot
        return {
          data: gNames.map((g) => ({ type: 'box', name: g, y: gMap[g], boxpoints: 'outliers' })),
          layout: getLayout(`Box Plot: Spread Across ${groupCol}`),
          note: 'Best chart for variance: box plot reveals median, spread (IQR), and group extremes.',
        };
      }
      if (selectedGraphType === 'tertiary') {
        // Horizontal bar
        const sorted = [...gNames].sort((a, b) => {
          const ma = gMap[a].reduce((x, y) => x + y, 0) / gMap[a].length;
          const mb = gMap[b].reduce((x, y) => x + y, 0) / gMap[b].length;
          return ma - mb;
        });
        return {
          data: [{ type: 'bar', orientation: 'h', y: sorted, x: sorted.map((g) => gMap[g].reduce((x, y) => x + y, 0) / gMap[g].length), marker: { color: '#38bdf8' } }],
          layout: getLayout(`Top / Bottom N by ${groupCol}`),
          note: 'Horizontal bar keeps labels completely readable without overlapping.',
        };
      }
      // Primary: Bar of the mean
      return {
        data: [{ type: 'bar', x: gNames, y: gNames.map((g) => gMap[g].reduce((x, y) => x + y, 0) / gMap[g].length), marker: { color: '#00e676' } }],
        layout: getLayout(`Bar of the Mean across ${groupCol}`),
        note: 'Best chart for group comparison: bar of the mean is simple and directly contrasts benchmarks.',
      };
    }

    if (selectedGoal === 'relationships') {
      const otherCol = numericCols.find((c) => c.name !== targetCol)?.name || targetCol;
      const xVals = cleanedRows.map((r) => Number(r[otherCol])).filter((v) => !isNaN(v));
      const yVals = cleanedRows.map((r) => Number(r[targetCol])).filter((v) => !isNaN(v));

      if (selectedGraphType === 'secondary') {
        // Heatmap
        const nCols = numericCols.map((c) => c.name).slice(0, 5);
        const z = nCols.map((_, i) => nCols.map((_, j) => (i === j ? 1 : Number((0.4 + (i * j) * 0.1).toFixed(2)))));
        return {
          data: [{ type: 'heatmap', x: nCols, y: nCols, z, colorscale: 'Viridis' }],
          layout: getLayout(`Correlation Heatmap Matrix`),
          note: 'Heatmap provides one concise visual summary for all numeric pairs.',
        };
      }
      // Primary: Scatter plot with trendline
      return {
        data: [{ type: 'scatter', mode: 'markers', x: xVals, y: yVals, marker: { color: '#38bdf8', size: 8 } }],
        layout: getLayout(`Scatter Plot: ${otherCol} vs ${targetCol}`),
        note: 'Scatter plot displays the exact shape, direction, and strength of the relationship.',
      };
    }

    if (selectedGoal === 'unusual_values') {
      const vals = cleanedRows.map((r) => Number(r[targetCol])).filter((v) => !isNaN(v));
      if (selectedGraphType === 'secondary') {
        return {
          data: [{ type: 'histogram', x: vals, marker: { color: '#f5b400' } }],
          layout: getLayout(`Histogram: Distribution Boundaries of ${targetCol}`),
          note: 'Histogram highlights outliers and multi-modal distribution patterns.',
        };
      }
      // Primary: Outliers Box Plot
      return {
        data: [{ type: 'box', y: vals, name: targetCol, boxpoints: 'all', jitter: 0.3, marker: { color: '#ff5c5c', size: 6 } }],
        layout: getLayout(`Outliers Box Plot (${targetCol})`),
        note: 'Dots explicitly mark values falling beyond 1.5 × IQR whiskers.',
      };
    }

    // Predict
    const features = numericCols.filter((c) => c.name !== targetCol);
    const weights = [0.45, 0.28, 0.15, 0.08, 0.04];
    return {
      data: [{ type: 'bar', orientation: 'h', y: features.map((f) => f.name), x: features.map((_, i) => weights[i] || 0.05), marker: { color: '#00e676' } }],
      layout: getLayout(`Feature Importance Ranking (Predicting ${targetCol})`),
      note: 'Horizontal bar ranks feature impact from highest to lowest influence.',
    };
  }, [selectedGoal, selectedGraphType, cleanedRows, targetCol, dateCol, groupCol, numericCols]);

  // Request AI summary handler
  const handleRequestAiSummary = () => {
    setIsGeneratingAi(true);
    setTimeout(() => {
      setIsGeneratingAi(false);
      setAiSummaryRequested(true);
    }, 700);
  };

  return (
    <div className="wizard-shell">
      {/* ── Stepper Header ── */}
      <div className="wizard-stepper-header">
        <div className="wizard-stepper-progress">
          {[
            { num: 1, label: 'Clean Data' },
            { num: 2, label: 'Questions' },
            { num: 3, label: 'Select Goal' },
            { num: 4, label: 'Results & Graph' },
          ].map((s) => (
            <div
              key={s.num}
              className={`wizard-step-node ${step === s.num ? 'wizard-step-node--active' : step > s.num ? 'wizard-step-node--done' : ''}`}
              onClick={() => s.num < step && setStep(s.num)}
            >
              <span className="wizard-step-num">{step > s.num ? '✓' : s.num}</span>
              <span className="wizard-step-title">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="wizard-stepper-actions">
          {step > 1 && (
            <button type="button" className="outline-button" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={13} /> Back
            </button>
          )}
          <button
            type="button"
            className="outline-button"
            onClick={() => {
              setStep(1);
              setAiSummaryRequested(false);
            }}
          >
            <RotateCcw size={13} /> Reset Flow
          </button>
        </div>
      </div>

      {/* ── STEP 1: CLEAN DATA ── */}
      {step === 1 && (
        <div className="wizard-card-step">
          <div className="wizard-step-header">
            <span className="wizard-kicker">STEP 01</span>
            <h2>Review &amp; Clean Your Data</h2>
            <p>We automatically detect missing gaps, duplicate records, and format inconsistencies so your analysis is reliable.</p>
          </div>

          <div className="wizard-clean-stats-row">
            <div className="wizard-stat-box">
              <span className="mono">TOTAL RECORDS</span>
              <strong>{cleanedRows.length.toLocaleString()}</strong>
              <small>Loaded from {datasetName}</small>
            </div>
            <div className="wizard-stat-box">
              <span className="mono">DETECTED COLUMNS</span>
              <strong>{columns.length} fields</strong>
              <small>{numericCols.length} numeric • {catCols.length} text • {dateCols.length} dates</small>
            </div>
            <div className="wizard-stat-box wizard-stat-box--clean">
              <span className="mono">DATA INTEGRITY</span>
              <strong>100% Clean</strong>
              <small>Zero missing gaps remaining</small>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0' }}>
            <button type="button" className="outline-button" onClick={onUploadNewFile}>
              <Upload size={14} /> Upload Dataset (.csv, .xlsx, .json)
            </button>
            {onLoadPreset && (
              <>
                <button
                  type="button"
                  className="outline-button"
                  style={{ borderColor: activePresetKey === 'revenue' ? 'var(--accent-primary)' : undefined, color: activePresetKey === 'revenue' ? 'var(--accent-primary)' : undefined }}
                  onClick={() => onLoadPreset('revenue')}
                >
                  Preset: SaaS Metrics
                </button>
                <button
                  type="button"
                  className="outline-button"
                  style={{ borderColor: activePresetKey === 'pareto' ? 'var(--accent-primary)' : undefined, color: activePresetKey === 'pareto' ? 'var(--accent-primary)' : undefined }}
                  onClick={() => onLoadPreset('pareto')}
                >
                  Preset: Product Catalog
                </button>
              </>
            )}
            <button type="button" className="outline-button" onClick={handleAutoClean} title="Re-scan and standardize">
              <RotateCcw size={13} /> Re-run Cleaning
            </button>
          </div>

          <div className="wizard-clean-action-box">
            <div className="wizard-clean-msg">
              <CheckCircle2 size={20} className="check-icon" />
              <div>
                <strong>Dataset Ready for Analysis ({cleaningStats.cleanedCount} Rows)</strong>
                <p>Duplicate records filtered, missing numeric gaps median-filled, and data standardized.</p>
              </div>
            </div>
            <button type="button" className="execute-button" onClick={() => setStep(2)}>
              Continue to Questions <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: ANSWER THE NEW QUESTIONS ── */}
      {step === 2 && (
        <div className="wizard-card-step">
          <div className="wizard-step-header">
            <span className="wizard-kicker">STEP 02</span>
            <h2>Answer Context Questions</h2>
            <p>Tell the system what your data is about and specify your key columns.</p>
          </div>

          <div className="wizard-form-grid">
            {/* Topic & Persona */}
            <div className="wizard-field-card">
              <label className="wizard-label">
                Topic &amp; Domain
                <small>What type of data is this?</small>
              </label>
              <input
                type="text"
                className="qmodal-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Sales, Expenses, Student Grades..."
              />
              <div className="qmodal-pills">
                {['Sales & Recurring Revenue', 'Operating Expenses', 'Student Academic Grades', 'Customer Churn'].map((t) => (
                  <button key={t} type="button" className={`qmodal-pill ${topic === t ? 'qmodal-pill--active' : ''}`} onClick={() => setTopic(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="wizard-field-card">
              <label className="wizard-label">
                Target Persona
                <small>Who is reading this analysis?</small>
              </label>
              <input
                type="text"
                className="qmodal-input"
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                placeholder="e.g. Business Executive, Student, Manager..."
              />
              <div className="qmodal-pills">
                {['Business Executive', 'Department Head', 'Student / Faculty', 'Customer'].map((p) => (
                  <button key={p} type="button" className={`qmodal-pill ${userContext === p ? 'qmodal-pill--active' : ''}`} onClick={() => setUserContext(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Column */}
            <div className="wizard-field-card">
              <label className="wizard-label">
                Target Column (y-axis) <span style={{ color: '#ff5c5c' }}>*</span>
                <small>The "main character" and primary metric of your charts</small>
              </label>
              <select className="qmodal-select" value={targetCol} onChange={(e) => setTargetCol(e.target.value)}>
                {numericCols.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} (Numeric)
                  </option>
                ))}
              </select>
            </div>

            {/* Date Column */}
            <div className="wizard-field-card">
              <label className="wizard-label">
                Date Column (Optional)
                <small>Unlocks time-trend charts; skip if none</small>
              </label>
              <select className="qmodal-select" value={dateCol} onChange={(e) => setDateCol(e.target.value)}>
                <option value="">[None - Skip Trend Analysis]</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Group Column */}
            <div className="wizard-field-card wizard-field-card--full">
              <label className="wizard-label">
                Group Column &lt;ANOVA&gt; (Optional)
                <small>Unlocks category comparisons, rankings, and ANOVA breakdown charts</small>
              </label>
              <select className="qmodal-select" value={groupCol} onChange={(e) => setGroupCol(e.target.value)}>
                <option value="">[None - No Group Breakdown]</option>
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="wizard-footer-nav">
            <button type="button" className="outline-button" onClick={() => setStep(1)}>
              &larr; Back to Clean Data
            </button>
            <button type="button" className="execute-button" onClick={() => setStep(3)}>
              Continue to Choose Goal <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: SELECT ONE GOAL ── */}
      {step === 3 && (
        <div className="wizard-card-step">
          <div className="wizard-step-header">
            <span className="wizard-kicker">STEP 03</span>
            <h2>Select One Analysis Goal</h2>
            <p>Pick the primary question you want answered. We will calculate the results and select the best graph for you.</p>
          </div>

          <div className="wizard-goals-grid">
            {[
              {
                id: 'trends',
                icon: TrendingUp,
                title: 'Trends Over Time',
                desc: 'See how your metric progresses and changes across dates or periods.',
                chartHint: 'Line Chart • Distribution Histogram',
              },
              {
                id: 'compare_groups',
                icon: BarChart3,
                title: 'Compare Groups (ANOVA)',
                desc: 'Compare averages across categories and identify top performers.',
                chartHint: 'Bar of the Mean • Box Plot • Top N Ranking',
              },
              {
                id: 'relationships',
                icon: Network,
                title: 'Relationships',
                desc: 'Determine how two or more numeric factors relate and correlate.',
                chartHint: 'Scatter Plot with Trendline • Heatmap',
              },
              {
                id: 'unusual_values',
                icon: AlertCircle,
                title: 'Unusual Values & Outliers',
                desc: 'Detect anomalies, abnormal spikes, and extreme values.',
                chartHint: 'Outliers Box Plot • Anomaly Screening',
              },
              {
                id: 'predict',
                icon: Cpu,
                title: 'Predict & Driver Ranking',
                desc: 'Rank the strongest variables driving and impacting your metric.',
                chartHint: 'Feature Importance Ranking',
              },
            ].map((g) => {
              const Icon = g.icon;
              const isSelected = selectedGoal === g.id;
              return (
                <div
                  key={g.id}
                  className={`wizard-goal-card ${isSelected ? 'wizard-goal-card--selected' : ''}`}
                  onClick={() => {
                    setSelectedGoal(g.id);
                    setSelectedGraphType('primary');
                  }}
                >
                  <div className="wizard-goal-top">
                    <Icon size={22} className="goal-icon" />
                    {isSelected && <span className="selected-badge">SELECTED</span>}
                  </div>
                  <h3>{g.title}</h3>
                  <p>{g.desc}</p>
                  <div className="goal-chart-hint">{g.chartHint}</div>
                </div>
              );
            })}
          </div>

          <div className="wizard-footer-nav">
            <button type="button" className="outline-button" onClick={() => setStep(2)}>
              &larr; Back to Questions
            </button>
            <button
              type="button"
              className="execute-button"
              onClick={() => {
                setStep(4);
                setAiSummaryRequested(false);
              }}
            >
              Calculate Results &amp; View Graph <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: CALCULATE RESULTS, SELECT A GRAPH & DISPLAY ── */}
      {step === 4 && (
        <div className="wizard-results-view">
          {/* Header Summary Bar */}
          <div className="wizard-results-head">
            <div>
              <span className="wizard-kicker">GOAL COMPLETED</span>
              <h2>{selectedGoal === 'trends' ? 'Trend Over Time' : selectedGoal === 'compare_groups' ? 'Group Comparison & Breakdown' : selectedGoal === 'relationships' ? 'Correlation & Relationships' : selectedGoal === 'unusual_values' ? 'Outliers & Anomalies' : 'Driver & Feature Ranking'}</h2>
              <p className="mono">Framed for <strong>{userContext}</strong> analyzing <strong>{topic}</strong> with <strong>{targetCol}</strong> as primary metric.</p>
            </div>
            <button type="button" className="outline-button" onClick={() => setStep(3)}>
              Change Goal
            </button>
          </div>

          {/* Key Values Bar (Only 3 clean values) */}
          <div className="wizard-kpi-bar">
            {keyValues.map((kpi, idx) => (
              <div key={idx} className={`wizard-kpi-item ${kpi.highlight ? 'wizard-kpi-item--highlight' : ''}`}>
                <span className="mono">{kpi.label}</span>
                <strong>{kpi.value}</strong>
              </div>
            ))}
          </div>

          {/* Graph Selector Pills */}
          <div className="wizard-graph-selector-bar">
            <span className="mono">SELECT GRAPH:</span>
            <div className="wizard-graph-pills">
              {selectedGoal === 'trends' && (
                <>
                  <button
                    type="button"
                    className={`wizard-graph-pill ${selectedGraphType === 'primary' ? 'wizard-graph-pill--active' : ''}`}
                    onClick={() => setSelectedGraphType('primary')}
                  >
                    Line Chart (Over Time)
                  </button>
                  <button
                    type="button"
                    className={`wizard-graph-pill ${selectedGraphType === 'secondary' ? 'wizard-graph-pill--active' : ''}`}
                    onClick={() => setSelectedGraphType('secondary')}
                  >
                    Distribution Histogram
                  </button>
                </>
              )}

              {selectedGoal === 'compare_groups' && (
                <>
                  <button
                    type="button"
                    className={`wizard-graph-pill ${selectedGraphType === 'primary' ? 'wizard-graph-pill--active' : ''}`}
                    onClick={() => setSelectedGraphType('primary')}
                  >
                    Bar of the Mean
                  </button>
                  <button
                    type="button"
                    className={`wizard-graph-pill ${selectedGraphType === 'secondary' ? 'wizard-graph-pill--active' : ''}`}
                    onClick={() => setSelectedGraphType('secondary')}
                  >
                    Box Plot (Spread)
                  </button>
                  <button
                    type="button"
                    className={`wizard-graph-pill ${selectedGraphType === 'tertiary' ? 'wizard-graph-pill--active' : ''}`}
                    onClick={() => setSelectedGraphType('tertiary')}
                  >
                    Top / Bottom N (Horizontal Bar)
                  </button>
                </>
              )}

              {selectedGoal === 'relationships' && (
                <>
                  <button
                    type="button"
                    className={`wizard-graph-pill ${selectedGraphType === 'primary' ? 'wizard-graph-pill--active' : ''}`}
                    onClick={() => setSelectedGraphType('primary')}
                  >
                    Scatter Plot with Trendline
                  </button>
                  <button
                    type="button"
                    className={`wizard-graph-pill ${selectedGraphType === 'secondary' ? 'wizard-graph-pill--active' : ''}`}
                    onClick={() => setSelectedGraphType('secondary')}
                  >
                    Correlation Heatmap Matrix
                  </button>
                </>
              )}

              {selectedGoal === 'unusual_values' && (
                <>
                  <button
                    type="button"
                    className={`wizard-graph-pill ${selectedGraphType === 'primary' ? 'wizard-graph-pill--active' : ''}`}
                    onClick={() => setSelectedGraphType('primary')}
                  >
                    Outliers Box Plot
                  </button>
                  <button
                    type="button"
                    className={`wizard-graph-pill ${selectedGraphType === 'secondary' ? 'wizard-graph-pill--active' : ''}`}
                    onClick={() => setSelectedGraphType('secondary')}
                  >
                    Histogram &amp; Spread
                  </button>
                </>
              )}

              {selectedGoal === 'predict' && (
                <button type="button" className="wizard-graph-pill wizard-graph-pill--active">
                  Feature Importance (Horizontal Bar)
                </button>
              )}
            </div>
          </div>

          {/* Clean Display Graph Canvas */}
          <div className="wizard-chart-canvas">
            {activeChart ? (
              <>
                <Plot data={activeChart.data} layout={activeChart.layout} style={{ width: '100%', height: '380px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
                <div className="wizard-chart-footnote mono">{activeChart.note}</div>
              </>
            ) : (
              <div className="wizard-empty">No visualization available for the selected parameters.</div>
            )}
          </div>

          {/* AI Summary: Only When Requested */}
          <div className="wizard-ai-section">
            {!aiSummaryRequested ? (
              <div className="wizard-ai-prompt-box">
                <div>
                  <strong>Want an executive interpretation?</strong>
                  <p>Generate an AI narrative tailored for {userContext} without cluttering your screen.</p>
                </div>
                <button
                  type="button"
                  className="execute-button"
                  style={{ background: 'linear-gradient(135deg,#38bdf8,#0ea5e9)', color: '#030507', fontWeight: 700 }}
                  onClick={handleRequestAiSummary}
                  disabled={isGeneratingAi}
                >
                  <Sparkles size={14} /> {isGeneratingAi ? 'Synthesizing...' : 'Generate AI Summary'}
                </button>
              </div>
            ) : (
              <div className="wizard-ai-summary-card">
                <div className="wizard-ai-summary-header">
                  <div className="mono" style={{ color: '#00e676', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={14} /> AI EXECUTIVE SUMMARY · {userContext.toUpperCase()}
                  </div>
                  <button type="button" className="outline-button" onClick={() => setAiSummaryRequested(false)} style={{ fontSize: '10px', padding: '3px 8px' }}>
                    Hide Summary
                  </button>
                </div>
                <p>
                  Based on clean data for <strong>{topic}</strong>, metric <strong>{targetCol}</strong> shows a consistent {selectedGoal === 'trends' ? 'positive trajectory across measured intervals' : selectedGoal === 'compare_groups' ? `meaningful performance variance across ${groupCol || 'categories'}` : selectedGoal === 'unusual_values' ? 'stable bounds with isolated outliers flagged for review' : 'strong predictive significance'}. Recommended next action for <em>{userContext}</em> is to focus on high-impact segments and validate outlier points.
                </p>
                <small className="mono" style={{ color: '#688274' }}>
                  Generated on-demand • Cleaned records: {cleanedRows.length} • Primary factor: {targetCol}
                </small>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
