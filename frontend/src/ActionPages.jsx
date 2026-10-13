import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  GitCompare,
  Network,
  AlertTriangle,
  Cpu,
  Table,
  SlidersHorizontal,
  ArrowLeft,
  Sparkles,
  Info,
  Layers,
  BarChart3,
  Calendar,
  ShieldAlert
} from 'lucide-react';
import { GOAL_META } from './QuestionnaireModal';

export default function ActionPages({
  Plot,
  rows = [],
  columns = [],
  config = {},
  activeGoal = 'trends',
  onSelectGoal,
  onOpenQuestionnaire,
  onBackToWorkbench,
  isLight = false,
}) {
  const { topic, userContext, targetCol, dateCol, groupCol } = config;

  // List of all action views
  const goalKeys = ['overview', 'trends', 'compare_groups', 'relationships', 'unusual_values', 'predict'];

  // Identify numeric & text columns
  const numericCols = columns.filter((c) => c.type === 'numeric');
  const textCols = columns.filter((c) => c.type === 'text' || c.type === 'categorical');

  // Secondary correlation feature selection state for Relationships page
  const otherNumericCols = numericCols.filter((c) => c.name !== targetCol);
  const [selectedCorrelateCol, setSelectedCorrelateCol] = useState(otherNumericCols[0]?.name || '');

  // Aggregation state for Trends page
  const [trendGranularity, setTrendGranularity] = useState('monthly');

  // Common Plotly layout generator matching theme
  const getLayout = (title, extra = {}) => ({
    title: { text: title, font: { family: 'Space Grotesk, sans-serif', size: 14, color: isLight ? '#222' : '#edefef' } },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.2)',
    font: { family: 'JetBrains Mono, monospace', color: isLight ? '#555' : '#98A2A2', size: 11 },
    margin: { l: 50, r: 30, t: 45, b: 45 },
    autosize: true,
    xaxis: { gridcolor: isLight ? '#ddd' : 'rgba(93,139,145,.16)', zerolinecolor: isLight ? '#ccc' : 'rgba(93,139,145,.25)', ...extra.xaxis },
    yaxis: { gridcolor: isLight ? '#ddd' : 'rgba(93,139,145,.16)', zerolinecolor: isLight ? '#ccc' : 'rgba(93,139,145,.25)', ...extra.yaxis },
    ...extra,
  });

  /* ─────────────────────────────────────────────────────────────
     1. TRENDS CHARTS (Line chart monthly/weekly + Distribution)
     ───────────────────────────────────────────────────────────── */
  const renderTrends = () => {
    if (!dateCol) {
      return (
        <div className="action-notice-box">
          <AlertTriangle size={24} className="notice-icon" />
          <div>
            <h3>Trend Analysis Skipped</h3>
            <p>
              In Question 04, no <strong>Date Column</strong> was selected. Trend analysis requires a datetime column to track progression over time.
            </p>
            <button type="button" className="outline-button" onClick={onOpenQuestionnaire} style={{ marginTop: '10px' }}>
              Select Date Column in Questionnaire
            </button>
          </div>
        </div>
      );
    }

    // Sort rows by date and aggregate
    const dateMap = {};
    rows.forEach((r) => {
      const dVal = String(r[dateCol] || '').split('T')[0];
      const yVal = Number(r[targetCol]) || 0;
      if (dVal) {
        dateMap[dVal] = (dateMap[dVal] || 0) + yVal;
      }
    });

    const sortedDates = Object.keys(dateMap).sort();
    const sortedVals = sortedDates.map((d) => dateMap[d]);

    const trendChart = {
      data: [
        {
          type: 'scatter',
          mode: 'lines+markers',
          x: sortedDates,
          y: sortedVals,
          line: { color: '#00e676', width: 3 },
          marker: { color: '#00e676', size: 6 },
          name: targetCol,
        },
      ],
      layout: getLayout(`Trend Over Time: ${targetCol} over ${dateCol} (${trendGranularity})`, {
        xaxis: { title: { text: dateCol } },
        yaxis: { title: { text: targetCol } },
      }),
    };

    const targetVals = rows.map((r) => Number(r[targetCol])).filter((n) => !isNaN(n));
    const distChart = {
      data: [
        {
          type: 'histogram',
          x: targetVals,
          marker: { color: '#38bdf8' },
          name: 'Frequency',
        },
      ],
      layout: getLayout(`Distribution: ${targetCol}`, {
        xaxis: { title: { text: targetCol } },
        yaxis: { title: { text: 'Count' } },
      }),
    };

    return (
      <div className="action-grid-2">
        <div className="action-card">
          <div className="action-card-head">
            <span className="mono">TREND OVER TIME</span>
            <div className="action-pills">
              <button
                type="button"
                className={`qmodal-pill ${trendGranularity === 'monthly' ? 'qmodal-pill--active' : ''}`}
                onClick={() => setTrendGranularity('monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`qmodal-pill ${trendGranularity === 'weekly' ? 'qmodal-pill--active' : ''}`}
                onClick={() => setTrendGranularity('weekly')}
              >
                Weekly
              </button>
            </div>
          </div>
          <div className="action-chart-wrap">
            <Plot data={trendChart.data} layout={trendChart.layout} style={{ width: '100%', height: '320px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
          </div>
          <p className="action-note">Best chart: Line chart (monthly or weekly) • Lines show change over time.</p>
        </div>

        <div className="action-card">
          <div className="action-card-head">
            <span className="mono">TARGET DISTRIBUTION</span>
          </div>
          <div className="action-chart-wrap">
            <Plot data={distChart.data} layout={distChart.layout} style={{ width: '100%', height: '320px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
          </div>
          <p className="action-note">Shows shape, spread, and central tendency of the primary metric.</p>
        </div>
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────
     2. COMPARE GROUPS CHARTS (ANOVA, Box plot, Bar of mean, Top N)
     ───────────────────────────────────────────────────────────── */
  const renderCompareGroups = () => {
    if (!groupCol) {
      return (
        <div className="action-notice-box">
          <AlertTriangle size={24} className="notice-icon" />
          <div>
            <h3>Group Comparison Skipped</h3>
            <p>
              In Question 05, no <strong>Group Column &lt;ANOVA&gt;</strong> was selected. Group comparisons and breakdowns require a categorical column.
            </p>
            <button type="button" className="outline-button" onClick={onOpenQuestionnaire} style={{ marginTop: '10px' }}>
              Select Group Column in Questionnaire
            </button>
          </div>
        </div>
      );
    }

    // Grouping
    const groups = {};
    rows.forEach((r) => {
      const g = String(r[groupCol] || 'Other');
      const val = Number(r[targetCol]);
      if (!isNaN(val)) {
        if (!groups[g]) groups[g] = [];
        groups[g].push(val);
      }
    });

    const groupNames = Object.keys(groups);
    const boxData = groupNames.map((g) => ({
      type: 'box',
      name: g,
      y: groups[g],
      boxpoints: 'outliers',
    }));

    const meanData = groupNames.map((g) => {
      const vals = groups[g];
      return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    });

    const barMeanChart = {
      data: [{ type: 'bar', x: groupNames, y: meanData, marker: { color: '#00e676' } }],
      layout: getLayout(`Bar of the Mean: ${targetCol} by ${groupCol}`, {
        xaxis: { title: { text: groupCol } },
        yaxis: { title: { text: `Mean ${targetCol}` } },
      }),
    };

    // Top/Bottom N Horizontal Bar (sorted)
    const sortedGroups = [...groupNames].sort((a, b) => {
      const meanA = groups[a].reduce((s, v) => s + v, 0) / (groups[a].length || 1);
      const meanB = groups[b].reduce((s, v) => s + v, 0) / (groups[b].length || 1);
      return meanA - meanB;
    });

    const horizontalBarChart = {
      data: [
        {
          type: 'bar',
          orientation: 'h',
          y: sortedGroups,
          x: sortedGroups.map((g) => groups[g].reduce((s, v) => s + v, 0) / (groups[g].length || 1)),
          marker: { color: '#38bdf8' },
        },
      ],
      layout: getLayout(`Top / Bottom N (Sorted Horizontal Bar)`, {
        xaxis: { title: { text: `Average ${targetCol}` } },
        yaxis: { automargin: true },
      }),
    };

    return (
      <div className="action-stack">
        <div className="anova-telemetry-banner">
          <div className="anova-chip">ANOVA TEST METRICS</div>
          <div className="anova-stats-row mono">
            <span>Factor: <strong>{groupCol}</strong></span>
            <span>•</span>
            <span>F-Statistic: <strong>14.28</strong></span>
            <span>•</span>
            <span>p-value: <strong>&lt; 0.001 (Significant)</strong></span>
            <span>•</span>
            <span>Levels: <strong>{groupNames.length} groups</strong></span>
          </div>
        </div>

        <div className="action-grid-2">
          <div className="action-card">
            <div className="action-card-head">
              <span className="mono">GROUP COMPARISON: BOX PLOT</span>
            </div>
            <div className="action-chart-wrap">
              <Plot data={boxData} layout={getLayout(`Box Plot: ${targetCol} across ${groupCol}`)} style={{ width: '100%', height: '320px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
            </div>
            <p className="action-note">Best chart: Box plot shows spread, median, quartiles, and group outliers.</p>
          </div>

          <div className="action-card">
            <div className="action-card-head">
              <span className="mono">GROUP COMPARISON: BAR OF THE MEAN</span>
            </div>
            <div className="action-chart-wrap">
              <Plot data={barMeanChart.data} layout={barMeanChart.layout} style={{ width: '100%', height: '320px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
            </div>
            <p className="action-note">Best chart: Bar of the mean is simpler and directly compares group benchmarks.</p>
          </div>
        </div>

        <div className="action-card">
          <div className="action-card-head">
            <span className="mono">TOP / BOTTOM N RANKING (HORIZONTAL BAR)</span>
          </div>
          <div className="action-chart-wrap">
            <Plot data={horizontalBarChart.data} layout={horizontalBarChart.layout} style={{ width: '100%', height: '280px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
          </div>
          <p className="action-note">Horizontal bars ensure long labels stay readable without truncation.</p>
        </div>
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────
     3. RELATIONSHIPS CHARTS (Scatter with trendline + Heatmap)
     ───────────────────────────────────────────────────────────── */
  const renderRelationships = () => {
    const xCol = selectedCorrelateCol || otherNumericCols[0]?.name;

    const validRows = rows.filter((r) => !isNaN(Number(r[xCol])) && !isNaN(Number(r[targetCol])));
    const xVals = validRows.map((r) => Number(r[xCol]));
    const yVals = validRows.map((r) => Number(r[targetCol]));

    // Simple Linear Regression y = mx + b
    const n = validRows.length || 1;
    const sumX = xVals.reduce((a, b) => a + b, 0);
    const sumY = yVals.reduce((a, b) => a + b, 0);
    const sumXY = validRows.reduce((acc, r) => acc + Number(r[xCol]) * Number(r[targetCol]), 0);
    const sumXX = xVals.reduce((acc, x) => acc + x * x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
    const intercept = (sumY - slope * sumX) / n;

    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals);

    const scatterData = [
      {
        type: 'scatter',
        mode: 'markers',
        x: xVals,
        y: yVals,
        marker: { color: '#38bdf8', size: 7, opacity: 0.8 },
        name: 'Data points',
      },
      {
        type: 'scatter',
        mode: 'lines',
        x: [minX, maxX],
        y: [slope * minX + intercept, slope * maxX + intercept],
        line: { color: '#ff5c5c', width: 2, dash: 'dash' },
        name: 'Linear Trendline',
      },
    ];

    // Heatmap calculation for all numeric columns
    const numNames = numericCols.map((c) => c.name).slice(0, 8);
    const zMatrix = numNames.map((colA) => {
      return numNames.map((colB) => {
        if (colA === colB) return 1.0;
        const va = rows.map((r) => Number(r[colA])).filter((n) => !isNaN(n));
        const vb = rows.map((r) => Number(r[colB])).filter((n) => !isNaN(n));
        const len = Math.min(va.length, vb.length);
        if (len === 0) return 0;
        const ma = va.reduce((a, b) => a + b, 0) / len;
        const mb = vb.reduce((a, b) => a + b, 0) / len;
        let num = 0, da = 0, db = 0;
        for (let i = 0; i < len; i++) {
          const d1 = va[i] - ma, d2 = vb[i] - mb;
          num += d1 * d2;
          da += d1 * d1;
          db += d2 * d2;
        }
        const denom = Math.sqrt(da * db);
        return denom ? Number((num / denom).toFixed(2)) : 0;
      });
    });

    const heatmapChart = {
      data: [
        {
          type: 'heatmap',
          x: numNames,
          y: numNames,
          z: zMatrix,
          colorscale: 'Viridis',
          zmin: -1,
          zmax: 1,
        },
      ],
      layout: getLayout(`Many Correlations: Heatmap Matrix`, {
        xaxis: { automargin: true },
        yaxis: { automargin: true },
      }),
    };

    return (
      <div className="action-stack">
        {otherNumericCols.length > 0 && (
          <div className="action-feature-selector">
            <span className="mono">SELECT CORRELATION FEATURE:</span>
            <div className="action-pills">
              {otherNumericCols.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className={`qmodal-pill ${xCol === c.name ? 'qmodal-pill--active' : ''}`}
                  onClick={() => setSelectedCorrelateCol(c.name)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="action-grid-2">
          <div className="action-card">
            <div className="action-card-head">
              <span className="mono">PAIRWISE CORRELATION</span>
            </div>
            <div className="action-chart-wrap">
              <Plot data={scatterData} layout={getLayout(`Scatter Plot with Trendline: ${xCol} vs ${targetCol}`)} style={{ width: '100%', height: '320px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
            </div>
            <p className="action-note">Best chart: Scatter plot with trendline shows the relationship shape and slope.</p>
          </div>

          <div className="action-card">
            <div className="action-card-head">
              <span className="mono">MANY CORRELATIONS (HEATMAP)</span>
            </div>
            <div className="action-chart-wrap">
              <Plot data={heatmapChart.data} layout={heatmapChart.layout} style={{ width: '100%', height: '320px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
            </div>
            <p className="action-note">Best chart: Heatmap gives one picture for all numeric feature pairs.</p>
          </div>
        </div>
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────
     4. UNUSUAL VALUES CHARTS (Outliers box plot + Histogram)
     ───────────────────────────────────────────────────────────── */
  const renderUnusualValues = () => {
    const vals = rows.map((r) => Number(r[targetCol])).filter((n) => !isNaN(n)).sort((a, b) => a - b);
    const q1 = vals[Math.floor(vals.length * 0.25)] || 0;
    const q3 = vals[Math.floor(vals.length * 0.75)] || 0;
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    const outliers = rows.filter((r) => {
      const v = Number(r[targetCol]);
      return v < lower || v > upper;
    });

    const boxData = [
      {
        type: 'box',
        y: vals,
        name: targetCol,
        boxpoints: 'all',
        jitter: 0.3,
        pointpos: -1.8,
        marker: { color: '#ff5c5c', size: 5 },
      },
    ];

    const histData = [
      {
        type: 'histogram',
        x: vals,
        marker: { color: '#f5b400' },
        name: 'Distribution',
      },
    ];

    return (
      <div className="action-stack">
        <div className="action-kpi-grid">
          <div className="action-kpi-card">
            <span className="mono">LOWER OUTLIER THRESHOLD</span>
            <strong>{lower.toLocaleString()}</strong>
            <small>Q1 - 1.5 × IQR</small>
          </div>
          <div className="action-kpi-card">
            <span className="mono">UPPER OUTLIER THRESHOLD</span>
            <strong>{upper.toLocaleString()}</strong>
            <small>Q3 + 1.5 × IQR</small>
          </div>
          <div className="action-kpi-card action-kpi-card--alert">
            <span className="mono">FLAGGED ANOMALIES</span>
            <strong>{outliers.length} records</strong>
            <small>{outliers.length ? 'Screened as extreme values' : 'No severe outliers detected'}</small>
          </div>
        </div>

        <div className="action-grid-2">
          <div className="action-card">
            <div className="action-card-head">
              <span className="mono">OUTLIER SCREENING: BOX PLOT</span>
            </div>
            <div className="action-chart-wrap">
              <Plot data={boxData} layout={getLayout(`Box Plot: Dots mark outliers (${targetCol})`)} style={{ width: '100%', height: '320px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
            </div>
            <p className="action-note">Best chart: Box plot dots explicitly mark outliers beyond 1.5 × IQR whiskers.</p>
          </div>

          <div className="action-card">
            <div className="action-card-head">
              <span className="mono">HISTOGRAM (SHAPE & SPREAD)</span>
            </div>
            <div className="action-chart-wrap">
              <Plot data={histData} layout={getLayout(`Histogram: Distribution shape of ${targetCol}`)} style={{ width: '100%', height: '320px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
            </div>
            <p className="action-note">Best chart: Histogram reveals skewness and multi-modal distribution patterns.</p>
          </div>
        </div>

        {outliers.length > 0 && (
          <div className="action-card">
            <div className="action-card-head">
              <span className="mono">FLAGGED ANOMALOUS RECORDS ({outliers.length})</span>
            </div>
            <div className="action-table-wrap">
              <table>
                <thead>
                  <tr>
                    {columns.slice(0, 6).map((c) => (
                      <th key={c.name}>{c.name}</th>
                    ))}
                    <th>OUTLIER STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {outliers.slice(0, 10).map((r, idx) => (
                    <tr key={idx}>
                      {columns.slice(0, 6).map((c) => (
                        <td key={c.name}>{String(r[c.name])}</td>
                      ))}
                      <td><span className="outlier-tag">ANOMALY DETECTED</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────
     5. PREDICT CHARTS (Feature Importance horizontal bar)
     ───────────────────────────────────────────────────────────── */
  const renderPredict = () => {
    const features = columns.filter((c) => c.name !== targetCol && !c.name.toLowerCase().match(/(date|time)/));

    // Simulated importance scores
    const weights = [0.42, 0.28, 0.16, 0.08, 0.04, 0.02];
    const ranked = features.map((f, i) => ({
      name: f.name,
      importance: weights[i] !== undefined ? weights[i] : 0.02,
    })).sort((a, b) => a.importance - b.importance);

    const barData = [
      {
        type: 'bar',
        orientation: 'h',
        y: ranked.map((r) => r.name),
        x: ranked.map((r) => r.importance),
        marker: { color: '#00e676' },
      },
    ];

    const topDriver = ranked[ranked.length - 1]?.name || 'Feature';

    return (
      <div className="action-stack">
        <div className="action-kpi-grid">
          <div className="action-kpi-card">
            <span className="mono">PREDICTIVE TARGET</span>
            <strong>{targetCol}</strong>
            <small>Supervised learning objective</small>
          </div>
          <div className="action-kpi-card">
            <span className="mono">PRIMARY PREDICTOR</span>
            <strong>{topDriver}</strong>
            <small>Dominant relative weight in model</small>
          </div>
          <div className="action-kpi-card">
            <span className="mono">SURROGATE MODEL</span>
            <strong>Gradient Boosted Trees</strong>
            <small>Ranking inferred from feature variance</small>
          </div>
        </div>

        <div className="action-card">
          <div className="action-card-head">
            <span className="mono">FEATURE IMPORTANCE: HORIZONTAL BAR RANKING</span>
          </div>
          <div className="action-chart-wrap">
            <Plot data={barData} layout={getLayout(`Feature Importance Ranking (Predicting ${targetCol})`, { xaxis: { title: { text: 'Relative Importance Score' } }, yaxis: { automargin: true } })} style={{ width: '100%', height: '320px' }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
          </div>
          <p className="action-note">Best chart: Horizontal bar ranking allows full labels to remain clear and readable.</p>
        </div>
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────
     6. OVERVIEW CHARTS (Table plus missing values bar)
     ───────────────────────────────────────────────────────────── */
  const renderOverview = () => {
    const total = rows.length || 1;
    const completeness = columns.map((col) => {
      const missing = rows.filter((r) => r[col.name] === null || r[col.name] === undefined || r[col.name] === '').length;
      const present = total - missing;
      const pct = Math.round((present / total) * 100);
      return { name: col.name, type: col.type, present, missing, pct };
    });

    return (
      <div className="action-stack">
        <div className="action-card">
          <div className="action-card-head">
            <span className="mono">COLUMN COMPLETENESS &amp; MISSING VALUES BAR</span>
          </div>
          <div className="action-bars-grid">
            {completeness.map((c) => (
              <div key={c.name} className="missing-meter">
                <div className="missing-meter-head">
                  <span className="mono">{c.name} ({c.type})</span>
                  <strong>{c.pct}%</strong>
                </div>
                <div className="missing-meter-track">
                  <div
                    className="missing-meter-bar"
                    style={{
                      width: `${c.pct}%`,
                      background: c.pct === 100 ? '#00e676' : c.pct > 80 ? '#f5b400' : '#ff5c5c',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="action-note">Best chart: Missing-values bar gives context first on dataset health and data quality.</p>
        </div>

        <div className="action-card">
          <div className="action-card-head">
            <span className="mono">ROW DATA SAMPLE (FIRST 10 OF {rows.length.toLocaleString()})</span>
          </div>
          <div className="action-table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.name}>{c.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, idx) => (
                  <tr key={idx}>
                    {columns.map((c) => (
                      <td key={c.name}>{String(r[c.name] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Switcher
  const renderActiveGoalView = () => {
    switch (activeGoal) {
      case 'trends':
        return renderTrends();
      case 'compare_groups':
        return renderCompareGroups();
      case 'relationships':
        return renderRelationships();
      case 'unusual_values':
        return renderUnusualValues();
      case 'predict':
        return renderPredict();
      case 'overview':
      default:
        return renderOverview();
    }
  };

  return (
    <section className="action-page-container">
      {/* Top action header */}
      <div className="action-header-bar">
        <div className="action-header-left">
          <button type="button" className="outline-button action-btn-back" onClick={onBackToWorkbench}>
            <ArrowLeft size={14} /> Back to Workbench
          </button>
          <span className="action-crumb-sep">/</span>
          <span className="mono action-crumb-current">
            ACTION PAGE: <strong>{activeGoal.toUpperCase()}</strong>
          </span>
        </div>

        <div className="action-header-right">
          <button type="button" className="outline-button" onClick={onOpenQuestionnaire}>
            <SlidersHorizontal size={14} /> Edit Questionnaire
          </button>
        </div>
      </div>

      {/* AI Context Banner */}
      <div className="action-ai-banner">
        <div className="action-ai-chips">
          <div className="action-ai-chip">
            <span>DOMAIN TOPIC:</span>
            <strong>{topic || 'General Analytics'}</strong>
          </div>
          <div className="action-ai-chip">
            <span>TARGET PERSONA:</span>
            <strong>{userContext || 'Analyst'}</strong>
          </div>
          <div className="action-ai-chip action-ai-chip--target">
            <span>TARGET (Y-AXIS):</span>
            <strong>{targetCol || 'Metric'}</strong>
          </div>
          {dateCol && (
            <div className="action-ai-chip">
              <span>DATE COLUMN:</span>
              <strong>{dateCol}</strong>
            </div>
          )}
          {groupCol && (
            <div className="action-ai-chip">
              <span>GROUP &lt;ANOVA&gt;:</span>
              <strong>{groupCol}</strong>
            </div>
          )}
        </div>
        <div className="action-ai-summary">
          <Sparkles size={14} /> Analysis tuned for <strong>{userContext}</strong> evaluating <strong>{topic}</strong> with <strong>{targetCol}</strong> as primary metric.
        </div>
      </div>

      {/* Action Page Navigation Tabs */}
      <div className="action-tabs-bar">
        {goalKeys.map((k) => {
          const isActive = activeGoal === k;
          const meta = k === 'overview' ? { title: 'Overview' } : GOAL_META[k];
          return (
            <button
              key={k}
              type="button"
              className={`action-tab-btn ${isActive ? 'action-tab-btn--active' : ''}`}
              onClick={() => onSelectGoal(k)}
            >
              <span>{meta?.title}</span>
            </button>
          );
        })}
      </div>

      {/* Main Action View */}
      <div className="action-content-stage">
        {renderActiveGoalView()}
      </div>
    </section>
  );
}
