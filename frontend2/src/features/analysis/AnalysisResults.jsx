import ChartRenderer from "./ChartRenderer";
import InsightsPanel from "../insights/InsightsPanel";

const TABLE_PREVIEW_LIMIT = 50;


function formatValue(value) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "N/A";
    }

    return new Intl.NumberFormat(undefined, {
      maximumSignificantDigits: 8,
    }).format(value);
  }

  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  return String(value);
}


function MetricsPanel({ metrics }) {
  if (!metrics?.length) return null;

  return (
    <section className="analysis-result-section">
      <h4>Statistical Metrics</h4>

      <div className="analysis-metrics">
        {metrics.map((metric) => (
          <div
            key={metric.key}
            className="analysis-metric"
          >
            <span className="muted">
              {metric.label}
            </span>

            <strong title={String(metric.value ?? "")}>
              {formatValue(metric.value)}
              {metric.unit
                ? ` ${metric.unit}`
                : ""}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}


function ResultTable({ table }) {
  if (!table) return null;

  const visibleRows = table.rows.slice(
    0,
    TABLE_PREVIEW_LIMIT
  );

  return (
    <section className="analysis-result-section">
      <h4>Result Table</h4>

      <p className="muted">
        Showing {visibleRows.length} of{" "}
        {table.rows.length} returned rows.
        {" "}
        Total analytical result rows:{" "}
        {table.total_rows}.
      </p>

      {table.truncated && (
        <p className="analysis-info">
          The backend limited the returned result
          table. The analysis may include additional
          observations or categories.
        </p>
      )}

      {table.rows.length > TABLE_PREVIEW_LIMIT && (
        <p className="muted">
          The table preview is limited to the first{" "}
          {TABLE_PREVIEW_LIMIT} returned rows.
          The chart may include more.
        </p>
      )}

      {visibleRows.length === 0 ? (
        <p className="muted">
          No tabular results are available.
        </p>
      ) : (
        <div className="table-scroll analysis-table-scroll">
          <table className="analysis-table">
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={index}>
                  {table.columns.map((column) => (
                    <td key={column.key}>
                      {formatValue(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


function AnalysisWarnings({ warnings }) {
  if (!warnings?.length) return null;

  return (
    <section className="analysis-warning">
      <h4>Analysis Warnings</h4>

      <ul>
        {warnings.map((warning, index) => (
          <li key={index}>{warning}</li>
        ))}
      </ul>
    </section>
  );
}


export default function AnalysisResults({ execution }) {
  const { plan, result } = execution;

  const executedAt = new Date(
    execution.executed_at
  );

  const timestamp = Number.isNaN(
    executedAt.getTime()
  )
    ? execution.executed_at
    : executedAt.toLocaleString();

  const chart = result.chart;

  return (
    <section className="analysis-results">
      <div className="analysis-result-heading">
        <div>
          <h3>Analysis Results</h3>

          <p className="muted">
            {plan.title}
          </p>

          <p className="muted">
            Executed: {timestamp}
          </p>
        </div>

        <span className="analysis-complete">
          Execution complete
        </span>
      </div>

      <AnalysisWarnings warnings={result.warnings} />

      <MetricsPanel metrics={result.metrics} />

      {chart && (
        <section className="analysis-result-section">
          <h4>Visualization</h4>

          <ChartRenderer
            key={execution.execution_id}
            chart={chart}
          />

          {chart.metadata?.truncated && (
            <p className="analysis-info">
              The chart displays a limited subset of
              the analytical results.
            </p>
          )}

          {chart.kind === "histogram" && (
            <p className="muted">
              Histogram intervals and frequencies
              were calculated by the backend.
              The final interval includes its upper
              boundary.
            </p>
          )}

          {chart.kind === "line" && (
            <p className="muted">
              Time periods without observations are
              omitted, not assumed to contain zero.
              The line may connect across such gaps.
            </p>
          )}

          {chart.kind === "scatter" &&
            chart.metadata?.sampling !== "none" && (
              <p className="muted">
                The scatter chart uses a bounded
                selection of observation pairs.
                Statistical metrics use the full
                set of valid pairs.
              </p>
            )}
        </section>
      )}

      <ResultTable table={result.table} />

      <details className="analysis-technical">
        <summary>Execution and result metadata</summary>

        <pre className="planner-json">
          {JSON.stringify(
            {
              execution_id: execution.execution_id,
              schema_version: execution.schema_version,
              plan,
              metadata: result.metadata,
              chart_metadata: chart?.metadata || null,
            },
            null,
            2
          )}
        </pre>
      </details>
      <InsightsPanel
        key={execution.execution_id}
        execution={execution}
      />
    </section>
  );
}