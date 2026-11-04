import { toPlotlyFigure } from "./chartAdapter";
import { saveBlob } from "../../api/datasets";

const MARGIN = 40;
const CHART_W = 900;
const CHART_H = 520;

function format(value) {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? new Intl.NumberFormat(undefined, {
          maximumSignificantDigits: 8,
        }).format(value)
      : "N/A";
  }
  return String(value);
}

// The on-screen chart uses a dark theme; re-style it for paper.
function printFigure(chart) {
  const figure = toPlotlyFigure(chart);
  const ink = "#1f2933";

  const layout = structuredClone(figure.layout);
  layout.paper_bgcolor = "#ffffff";
  layout.plot_bgcolor = "#ffffff";
  layout.autosize = false;
  layout.width = CHART_W;
  layout.height = CHART_H;
  layout.title.font.color = ink;

  for (const axis of ["xaxis", "yaxis"]) {
    layout[axis].title.font.color = ink;
    layout[axis].tickfont.color = ink;
    layout[axis].gridcolor = "#e3e8ee";
    layout[axis].linecolor = "#9aa5b1";
  }

  const data = structuredClone(figure.data).map((trace) => {
    if (trace.marker) {
      trace.marker.color = "#1b7f5c";
      if (trace.marker.line) trace.marker.line.color = "#ffffff";
    }
    if (trace.line) trace.line.color = "#1b7f5c";
    return trace;
  });

  return { data, layout };
}

export async function exportAnalysisPdf({
  execution,
  insights,
  includeSummary,
}) {
  const { plan, result } = execution;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - MARGIN * 2;
  let y = MARGIN;

  const ensure = (needed) => {
    if (y + needed > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const write = (text, { size = 10, bold = false, gap = 6 } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(31, 41, 51);

    for (const line of doc.splitTextToSize(String(text), width)) {
      ensure(size * 1.3);
      doc.text(line, MARGIN, y + size);
      y += size * 1.3;
    }

    y += gap;
  };

  // Header
  write(plan.title, { size: 16, bold: true, gap: 4 });
  write(
    `Generated ${new Date().toLocaleString()} · ` +
      `dataset revision ${plan.dataset_version}`,
    { size: 9, gap: 14 }
  );

  // Chart
  if (result.chart) {
    const Plotly = await import("plotly.js-basic-dist-min");
    const png = await (Plotly.default ?? Plotly).toImage(
      printFigure(result.chart),
      { format: "png", width: CHART_W, height: CHART_H, scale: 2 }
    );

    const height = (width * CHART_H) / CHART_W;
    ensure(height);
    doc.addImage(png, "PNG", MARGIN, y, width, height);
    y += height + 14;
  }

  // Metrics
  if (result.metrics?.length) {
    write("Statistical Metrics", { size: 12, bold: true, gap: 4 });
    for (const metric of result.metrics) {
      write(`${metric.label}: ${format(metric.value)}`, { gap: 2 });
    }
    y += 10;
  }

  // Warnings
  if (result.warnings?.length) {
    write("Warnings", { size: 12, bold: true, gap: 4 });
    for (const warning of result.warnings) {
      write(`- ${warning}`, { gap: 2 });
    }
    y += 10;
  }

  // Optional AI summary
  if (includeSummary && insights) {
    write("AI Summary", { size: 12, bold: true, gap: 4 });
    write(insights.headline, { bold: true, gap: 4 });
    write(insights.summary, { gap: 8 });

    for (const [title, items] of [
      ["Key Findings", insights.findings],
      ["Limitations", insights.limitations],
    ]) {
      if (items?.length) {
        write(title, { bold: true, gap: 2 });
        for (const item of items) write(`- ${item}`, { gap: 2 });
        y += 6;
      }
    }

    write(
      "AI-generated interpretation. Verify against the metrics above.",
      { size: 8 }
    );
  }

  // Page numbers
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Page ${page} of ${total}`, pageW - MARGIN, pageH - 20, {
      align: "right",
    });
  }

  const slug =
    plan.title.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 60) || "analysis";

  saveBlob(doc.output("blob"), `${slug}.pdf`);
}