/**
 * OmniSight analytical execution API.
 */

const API_BASE = "/api/v1";


function errorMessage(body, status) {
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

  return `Analysis request failed (${status}).`;
}


export async function executeAnalysis(
  payload,
  { signal } = {}
) {
  const response = await fetch(
    `${API_BASE}/analysis/execute`,
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

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => null);

    const error = new Error(
      errorMessage(body, response.status)
    );

    error.status = response.status;
    error.details = body;

    throw error;
  }

  return response.json();
}