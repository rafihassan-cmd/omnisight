import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  generateInsights,
  getInsightStatus,
} from "../../api/insights";


function InsightList({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <section className="insight-section">
      <h4>{title}</h4>

      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}


export default function InsightsPanel({ execution }) {
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [generating, setGenerating] = useState(false);

  const [response, setResponse] = useState(null);
  const [error, setError] = useState("");

  const requestRef = useRef(null);


  useEffect(() => {
    const controller = new AbortController();

    setStatusLoading(true);

    getInsightStatus({
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setStatus(result);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setStatusLoading(false);
        }
      });

    return () => {
      controller.abort();

      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, []);


  const plan = execution.plan;

  // Regenerate server-side using these identifiers.
  // Never send client-provided statistics or bindings.
  const payload = {
    question_id: plan.question_id,
    expected_version: plan.dataset_version,
    parameters: plan.parameters,
  };


  async function handleGenerate() {
    if (
      generating ||
      statusLoading ||
      !status?.configured
    ) {
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;

    setGenerating(true);
    setError("");
    setResponse(null);

    try {
      const result = await generateInsights(
        payload,
        {
          signal: controller.signal,
        }
      );

      if (controller.signal.aborted) return;

      if (
        result.question_id !== plan.question_id ||
        result.dataset_id !== plan.dataset_id ||
        result.dataset_version !== plan.dataset_version ||
        !result.insights
      ) {
        throw new Error(
          "AI response does not match the selected analysis."
        );
      }

      setResponse(result);

    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err.message ||
          "Could not generate AI insights."
        );
      }

    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setGenerating(false);
      }
    }
  }


  const insights = response?.insights;

  return (
    <section className="ai-insights-panel">
      <div className="ai-insights-header">
        <div>
          <h3>AI Insights</h3>

          <p className="muted">
            Gemini can interpret the statistical
            findings from this analysis.
          </p>
        </div>

        <span className="ai-label">
          Gemini
        </span>
      </div>

      <p className="ai-privacy-notice">
        Generating insights sends a limited analytical
        summary to Google Gemini. The original CSV and
        individual scatter-plot records are not sent.
        Column names, category labels and aggregated
        values may still contain sensitive information.
        Do not use this feature with sensitive data
        unless external processing is appropriate.
      </p>

      {statusLoading && (
        <p className="muted" role="status">
          Checking Gemini configuration...
        </p>
      )}

      {!statusLoading && status && !status.configured && (
        <p className="analysis-warning">
          Gemini is not configured.
          Set GEMINI_API_KEY in the backend environment
          and restart the server.
        </p>
      )}

      {status?.configured && (
        <p className="muted">
          Model: {status.model}
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={
            generating ||
            statusLoading ||
            !status?.configured
          }
        >
          {generating
            ? "Generating Insights..."
            : insights
              ? "Generate Again"
              : "Generate AI Insights"}
        </button>
      </div>

      {generating && (
        <p className="muted" role="status">
          Gemini is interpreting the current analysis.
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {response && insights && (
        <div className="ai-insight-response">
          <div className="ai-result-meta">
            <span>
              {response.cached
                ? "Retrieved from session cache"
                : "Generated by Gemini"}
            </span>

            <span>
              {new Date(
                response.generated_at
              ).toLocaleString()}
            </span>
          </div>

          <h4 className="ai-headline">
            {insights.headline}
          </h4>

          <p className="ai-summary">
            {insights.summary}
          </p>

          <InsightList
            title="Key Findings"
            items={insights.findings}
          />

          <InsightList
            title="Limitations"
            items={insights.limitations}
          />

          <InsightList
            title="Suggested Follow-up Questions"
            items={insights.suggested_questions}
          />

          <p className="ai-disclaimer">
            AI-generated interpretation. Verify claims
            against the statistical metrics, data table,
            and warnings above. Suggested follow-up
            questions are not automatically registered
            analytical questions.
          </p>
        </div>
      )}
    </section>
  );
}