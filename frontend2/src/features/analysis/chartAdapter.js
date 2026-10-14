/**
 * Translate OmniSight ChartSpec v1.0 into Plotly.
 *
 * This module performs presentation mapping only.
 * It does not recalculate any statistical result.
 */


function assertChart(chart) {
  if (
    !chart ||
    chart.schema_version !== "1.0" ||
    !chart.x?.field ||
    !chart.y?.field ||
    !Array.isArray(chart.data)
  ) {
    throw new Error(
      "Invalid or unsupported chart specification."
    );
  }
}


function numericValue(value, field) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new Error(
      `Invalid numeric chart value in '${field}'.`
    );
  }

  return value;
}


function axisType(dataType) {
  if (dataType === "temporal") return "date";
  if (dataType === "quantitative") return "linear";
  return "category";
}


function makeHistogram(chart) {
  if (chart.metadata?.representation !== "prebinned") {
    throw new Error(
      "The histogram must contain precomputed bins."
    );
  }

  const startField = chart.x.field;
  const endField = chart.metadata.bin_end_field;
  const countField = chart.y.field;

  if (typeof endField !== "string" || !endField) {
    throw new Error(
      "Histogram bin-end metadata is missing."
    );
  }

  const centers = [];
  const widths = [];
  const frequencies = [];
  const customdata = [];

  for (const row of chart.data) {
    const start = numericValue(
      row[startField],
      startField
    );

    const end = numericValue(
      row[endField],
      endField
    );

    const count = numericValue(
      row[countField],
      countField
    );

    if (end <= start || count < 0) {
      throw new Error(
        "The histogram contains invalid intervals."
      );
    }

    centers.push(start + (end - start) / 2);
    widths.push(end - start);
    frequencies.push(count);
    customdata.push([start, end]);
  }

  return {
    type: "bar",
    name: "Frequency",

    // Plotly bars are centered around their x values.
    // Width is expressed in the x-axis data units.
    x: centers,
    y: frequencies,
    width: widths,

    customdata,

    hovertemplate:
      "Interval: %{customdata[0]} to %{customdata[1]}" +
      "<br>Frequency: %{y}<extra></extra>",
  };
}


function makeBar(chart) {
  const xField = chart.x.field;
  const yField = chart.y.field;

  const percentageField =
    chart.metadata?.percentage_field;

  const x = chart.data.map((row) =>
    String(row[xField] ?? "")
  );

  const y = chart.data.map((row) =>
    numericValue(row[yField], yField)
  );

  const trace = {
    type: "bar",
    name: chart.y.label,
    x,
    y,
    hovertemplate:
      "%{x}<br>Value: %{y}<extra></extra>",
  };

  if (percentageField) {
    trace.customdata = chart.data.map(
      (row) => row[percentageField]
    );

    trace.hovertemplate =
      "%{x}<br>Value: %{y}" +
      "<br>Percentage: %{customdata:.2f}%" +
      "<extra></extra>";
  }

  return trace;
}


function makeScatter(chart) {
  const xField = chart.x.field;
  const yField = chart.y.field;

  return {
    type: "scatter",
    mode: "markers",
    name: chart.title,

    x: chart.data.map((row) =>
      numericValue(row[xField], xField)
    ),

    y: chart.data.map((row) =>
      numericValue(row[yField], yField)
    ),

    marker: {
      size: 7,
      opacity: 0.7,
    },

    hovertemplate:
      "X: %{x}<br>Y: %{y}<extra></extra>",
  };
}


function makeLine(chart) {
  const xField = chart.x.field;
  const yField = chart.y.field;

  return {
    type: "scatter",
    mode: "lines+markers",
    name: chart.y.label,

    x: chart.data.map((row) => row[xField]),

    y: chart.data.map((row) =>
      numericValue(row[yField], yField)
    ),

    connectgaps: false,

    hovertemplate:
      "%{x}<br>Value: %{y}<extra></extra>",
  };
}


export function toPlotlyFigure(chart) {
  assertChart(chart);

  let trace;

  switch (chart.kind) {
    case "histogram":
      trace = makeHistogram(chart);
      break;

    case "bar":
      trace = makeBar(chart);
      break;

    case "scatter":
      trace = makeScatter(chart);
      break;

    case "line":
      trace = makeLine(chart);
      break;

    default:
      throw new Error(
        `Unsupported chart kind: ${chart.kind}`
      );
  }

  const categorical =
    chart.x.data_type === "nominal";

  const layout = {
    title: {
      text: chart.title,
      x: 0.03,
      xanchor: "left",
      font: {
        size: 16,
      },
    },

    autosize: true,
    height: 450,

    margin: {
      l: 75,
      r: 24,
      t: 75,
      b: categorical ? 115 : 75,
    },

    showlegend: false,
    hovermode: "closest",

    xaxis: {
      title: {
        text: chart.x.label,
      },
      type: axisType(chart.x.data_type),
      automargin: true,
      tickangle: categorical ? -30 : 0,
    },

    yaxis: {
      title: {
        text: chart.y.label,
      },
      type: axisType(chart.y.data_type),
      automargin: true,

      ...(chart.kind === "bar" ||
      chart.kind === "histogram"
        ? { rangemode: "tozero" }
        : {}),
    },

    ...(chart.kind === "histogram"
      ? { bargap: 0 }
      : { bargap: 0.2 }),
  };

  const config = {
    responsive: true,
    displaylogo: false,
    displayModeBar: true,

    toImageButtonOptions: {
      format: "png",
      filename: "omnisight-analysis",
      scale: 2,
    },
  };

  return {
    data: [trace],
    layout,
    config,
  };
}