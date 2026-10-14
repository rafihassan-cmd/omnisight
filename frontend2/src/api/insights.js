/**
 * OmniSight AI insights API client.
 */

const API_BASE = "/api/v1";


function readError(body, status) {
  const detail = body?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (
    detail &&
    typeof detail === "object" &&
    typeof detail.message === "string"
  ) {
    return detail.message;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item.msg || "Validation error")
      .join("; ");
  }

  return `AI request failed (${status}).`;
}


async function parseResponse(response) {
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => null);

    const error = new Error(
      readError(body, response.status)
    );

    error.status = response.status;
    throw error;
  }

  return response.json();
}


export async function getInsightStatus({
  signal,
} = {}) {
  const response = await fetch(
    `${API_BASE}/insights/status`,
    {
      method: "GET",
      credentials: "same-origin",
      signal,
    }
  );

  return parseResponse(response);
}


export async function generateInsights(
  payload,
  { signal } = {}
) {
  const response = await fetch(
    `${API_BASE}/insights/generate`,
    {
      method: "POST",
      credentials: "same-origin",
      signal,

      headers: {
        "Content-Type": "application/json",
        "X-OmniSight-Request": "1",
      },

      body: JSON.stringify(payload),
    }
  );

  return parseResponse(response);
}