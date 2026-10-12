# OmniSight — Summary of Changes & Current Feature Guide

**Date:** October 12, 2026  
**Branch:** `Sami`  
**Local Dev Server:** `http://localhost:5173/`  
**Live Production URL (from earlier push):** `https://omnisight-swart.vercel.app/`

---

## 1. Executive Summary

Today's work centered on redesigning the frontend analysis experience on branch **`Sami`** to serve non-technical users through a calm, sequential, and uncluttered step-by-step workflow:

$$\text{Clean Data} \longrightarrow \text{Answer Questions} \longrightarrow \text{Select Goal} \longrightarrow \text{Calculate Results} \longrightarrow \text{Select Graph} \longrightarrow \text{View Key Values} \longrightarrow \text{On-Demand AI Summary}$$

All complex 3D holographic screens, moving carousels, and intrusive popup dialogs were replaced as the default landing view by an intuitive **Guided Analysis Workbench**, while preserving all analytical capabilities, column management tools, and data cleaning controls.

---

## 2. File Changes Summary

### **New Files Created**
| File | Purpose |
| :--- | :--- |
| `frontend/src/AnalysisWizard.jsx` | **The Core 4-Step Guided Analysis Component.** Houses the full step-by-step workflow: data cleaning table, context questions, goal cards, KPI cards, graph selector pills, Plotly chart, and on-demand AI summary. |
| `frontend/src/QuestionnaireModal.jsx` | **Dedicated Questionnaire Component.** Implements the 5-question intake system (Topic, Goal, Target, Date, Group) and exports `GOAL_MAP` and `GOAL_META`. |
| `frontend/src/ActionPages.jsx` | **Dedicated Action Pages Component.** Renders deep-dive Plotly visualizations corresponding to each goal (Line trends, ANOVA bar of mean, Box plot spread, Top/Bottom N horizontal bars, Scatter with trendlines, Correlation heatmap, Outliers box plot, Predict feature importance, and Overview table). |

### **Existing Files Modified**
| File | Modifications Made |
| :--- | :--- |
| `frontend/src/main.jsx` | 1. Imported and set `AnalysisWizard` as the default view for the Workbench.<br>2. Removed the automatic popup trigger (`setModal('questionnaire')`) on file upload so uploaded datasets load directly into Step 1.<br>3. Added a clean toggle to switch between the Guided Analysis Workbench and the classic 3D Spatial Studio.<br>4. Connected preset dataset switchers (SaaS Metrics vs. Product Catalog) directly into the wizard. |
| `frontend/src/style.css` | 1. Added styles for `.wizard-shell`, `.wizard-stepper-*`, `.wizard-card-step`, `.wizard-stat-box`, `.wizard-goals-grid`, and `.wizard-goal-card`.<br>2. Added styles for the interactive `.wizard-column-options-card`, `.wizard-column-options-header`, `.clean-grid`, and `.clean-row`.<br>3. Styled `.wizard-kpi-bar`, `.wizard-graph-pills`, `.wizard-chart-canvas`, and the on-demand `.wizard-ai-summary-card`. |
| `.gitignore` | Added `.vercel/` and `.env*` to keep working directory clean. |

---

## 3. What is Available on the Page Now

### **Step 1: Review & Clean Your Data**
- **High-Level Statistics**:
  - **Total Records Count**: Cleanly formatted (e.g., `1,250` or `12` rows).
  - **Detected Columns**: Total fields count with breakdowns (numeric, text, datetime).
  - **Data Integrity Indicator**: Status of missing gaps and standardization.
- **Dataset Source Controls**:
  - **Upload Dataset Button**: Drop or browse any CSV, XLSX, JSON, or Parquet file.
  - **Preset Switchers**: One-click demo datasets (*SaaS Metrics* vs. *Product Catalog*).
  - **Re-run Cleaning Button**: Resets and standardizes raw inputs.
- **Interactive Column Customization & Cleaning Options**:
  - **Include / Exclude Checkbox**: Check or uncheck individual columns to include or exclude them from analysis.
  - **Column Type Badge**: Color-coded badges indicating whether a column is `numeric`, `text`, or `datetime`.
  - **Manual Column Renaming Input**: An inline text field (`Rename: Keep as "..."`). Type any name you want (e.g. rename `Revenue` &rarr; `Net_Revenue`).
  - **Missing Value Handling Dropdown**:
    - `Do nothing` (leaves missing cells untouched)
    - `Drop rows` (removes records where this column is blank)
    - `Fill with value` (opens an input to specify a custom fallback string or number)
    - `Fill with mean` (auto-imputes the column mathematical average for numeric fields)
    - `Fill with min` (imputes lowest observed value)
    - `Fill with max` (imputes highest observed value)
  - **Missing Counter**: Badge showing `0 missing` or exact missing count.
  - **Apply Column Changes**: Applies your renames, filters, and missing strategies with instant confirmation (`Changes Applied`).
- **Continue to Questions Button**: Automatically applies your cleaning rules and moves forward.

---

### **Step 2: Answer Context Questions**
- **Topic & Domain**:
  - Quick-select pills (*Sales & Recurring Revenue*, *Operating Expenses*, *Student Academic Grades*, *Customer Churn*) or custom text.
- **Target Persona**:
  - Identifies who will read the analysis (*Business Executive*, *Department Head*, *Student / Faculty*, *Customer*).
- **Target Column ($y$-axis)**:
  - Dropdown containing all active numeric columns.
  - **Auto-mapped**: If you renamed a column in Step 1, this dropdown automatically displays your new column name!
- **Date Column (Optional)**:
  - Dropdown containing time/date columns. Unlocks trend charts.
- **Group Column <ANOVA> (Optional)**:
  - Dropdown containing category columns. Unlocks ANOVA comparisons and rankings.

---

### **Step 3: Select One Goal**
Clear, non-technical visual cards with descriptive badges and chart hints:
1. **Trends Over Time** (*Line Chart & Distribution Histogram*) &mdash; Track metric changes over dates/periods.
2. **Compare Groups (ANOVA)** (*Bar of the Mean, Box Plot, Top/Bottom N*) &mdash; Compare averages across categories.
3. **Relationships** (*Scatter Plot with Trendline, Correlation Heatmap*) &mdash; Measure how two numeric factors correlate.
4. **Unusual Values & Outliers** (*Outliers Box Plot, Spread Histogram*) &mdash; Identify abnormal spikes and extreme values.
5. **Predict & Driver Ranking** (*Feature Importance Horizontal Bar*) &mdash; Rank which variables most strongly influence the metric.

---

### **Step 4: Results, Graph & On-Demand AI Summary**
- **Key Metric Values Bar**:
  - 3 clean KPI metric cards displaying essential stats (e.g., *Average*, *Total*, *Trend Growth / Outlier Count*).
- **Graph Selector Pills**:
  - Interactive pill buttons above the chart allowing instant switching between graph types for your chosen goal:
    - *Trends*: **Line Chart (Over Time)** | **Distribution Histogram**
    - *Compare Groups*: **Bar of the Mean** | **Box Plot (Spread)** | **Top / Bottom N (Horizontal Bar)**
    - *Relationships*: **Scatter Plot with Trendline** | **Correlation Heatmap Matrix**
    - *Unusual Values*: **Outliers Box Plot** | **Histogram & Spread**
    - *Predict*: **Feature Importance (Horizontal Bar)**
- **Interactive Plotly Graph**:
  - Clean, high-contrast, clutter-free canvas.
  - Explanatory footnote below each chart explaining why this chart was selected and how to interpret it.
- **On-Demand AI Summary (Never Dumped Automatically)**:
  - An unobtrusive prompt box: *"Want an executive interpretation? [Generate AI Summary]"*.
  - When clicked, smoothly generates and displays an executive brief framed specifically for your selected persona and data.
  - Includes a *"Hide Summary"* button to collapse it at any time.

---

### **Alternative View Modes Preserved**
- **Spatial Studio (Classic 3D View)**:
  - Accessible via the top toolbar button (**"Switch to Spatial Studio"**).
  - Contains the original 3D scatter mapping, telemetry counters, and moving task rail.
  - Can switch back instantly via **"Back to Simple Guided Flow"**.
- **Action Pages**:
  - Accessible directly from the sidebar navigation (**"Action Pages"**).
  - Offers full-screen dedicated action views for deep exploration.

---

## 4. Local Execution Guide

To test everything on your local machine:
```bash
cd c:\Users\SAMI\Downloads\Downloads\Ommmmni\frontend
npm run dev
```
Open **`http://localhost:5173/`** in your browser.
