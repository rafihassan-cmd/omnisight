import AnalysisResults from "./AnalysisResults";

export default function VisualizationWorkspace({
  execution,
  onGoToPlanner,
}) {
  if (!execution) {
    return (
      <section className="telemetry-card empty-stage-card">
        <span className="eyebrow">STAGE 05 / VISUALIZATION TELEMETRY</span>
        <h2 className="telemetry-card-title">No Analysis Executed Yet</h2>
        <p className="telemetry-card-subtitle">
          Execute an inquiry in Stage 04 (Question Planner) to generate interactive
          telemetry charts, statistical metrics, result tables, and neural briefs.
        </p>

        <div className="actions" style={{ marginTop: "24px", justifyContent: "center" }}>
          <button
            type="button"
            className="execute-button"
            onClick={onGoToPlanner}
          >
            ← GO TO STAGE 04: QUESTION PLANNER
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="visualization-stage">
      <div className="telemetry-card-head" style={{ marginBottom: "20px" }}>
        <div>
          <span className="eyebrow">STAGE 05 / SYNTHESIS & TELEMETRY</span>
          <h2 className="telemetry-card-title">Analysis Telemetry Report</h2>
          <p className="telemetry-card-subtitle">
            Interactive Plotly charts, statistical metrics breakdown, and Gemini AI narrative.
          </p>
        </div>

        <button
          type="button"
          className="outline-button"
          onClick={onGoToPlanner}
          title="Return to planner to formulate another question"
        >
          ← PLAN ANOTHER INQUIRY
        </button>
      </div>

      <AnalysisResults key={execution.execution_id} execution={execution} />
    </div>
  );
}
