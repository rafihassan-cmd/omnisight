import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  toPlotlyFigure,
} from "./chartAdapter";


export default function ChartRenderer({ chart }) {
  const plotRef = useRef(null);

  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const container = plotRef.current;

    if (!container) return;

    let cancelled = false;
    let plotly = null;

    setStatus("loading");
    setError("");

    async function renderChart() {
      try {
        // Validate and translate before loading Plotly.
        const figure = toPlotlyFigure(chart);

        // Defer loading the relatively large plotting
        // library until a chart is actually requested.
        const module = await import(
          "plotly.js-basic-dist-min"
        );

        const Plotly = module.default ?? module;

        if (cancelled) return;

        plotly = Plotly;

        await Plotly.react(
          container,
          figure.data,
          figure.layout,
          figure.config
        );

        if (cancelled) {
          Plotly.purge(container);
          return;
        }

        setStatus("ready");

      } catch (err) {
        if (!cancelled) {
          setError(
            err.message || "Could not render the chart."
          );

          setStatus("error");
        }
      }
    }

    renderChart();

    return () => {
      cancelled = true;

      if (plotly) {
        PlotlyCleanup(plotly, container);
      }
    };
  }, [chart]);


  return (
    <div className="analysis-chart-wrapper">
      {status === "loading" && (
        <p className="muted" role="status">
          Rendering visualization...
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          Chart rendering failed: {error}
        </p>
      )}

      <div
        ref={plotRef}
        className="analysis-plot"
        role="img"
        aria-label={chart.title}
      />
    </div>
  );
}


function PlotlyCleanup(Plotly, container) {
  try {
    Plotly.purge(container);
  } catch {
    // Cleanup must not crash React unmounting.
  }
}