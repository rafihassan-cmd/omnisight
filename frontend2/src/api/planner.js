/**
 * OmniSight analytical question planner API.
 */

const API_BASE = "/api/v1";


function parseError(body, status) {
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
      .map((error) => error.msg || "Validation error")
      .join("; ");
  }

  return `Request failed (${status}).`;
}


export async function getGeneratedQuestions({
  signal,
} = {}) {
  const response = await fetch(
    `${API_BASE}/planner/questions`,
    {
      method: "GET",
      credentials: "same-origin",
      signal,
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    const error = new Error(
      parseError(body, response.status)
    );

    error.status = response.status;

    throw error;
  }

  return response.json();
}

/**
 * Validate a prepared analytical request.
 *
 * The backend independently resolves the question,
 * column bindings, analysis method and parameters.
 *
 * This does not execute analysis.
 */
export async function validatePreparedAnalysis(payload) {
  const response = await fetch(
    `${API_BASE}/planner/validate`,
    {
      method: "POST",
      credentials: "same-origin",

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
      parseError(body, response.status)
    );

    error.status = response.status;
    error.details = body;

    throw error;
  }

  return response.json();
}