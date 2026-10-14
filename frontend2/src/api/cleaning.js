/**
 * OmniSight cleaning API client.
 */

const API_BASE = "/api/v1";


function getErrorMessage(body, status) {
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

  return `Request failed (${status})`;
}


async function request(
  path,
  {
    method = "GET",
    body,
    signal,
  } = {}
) {
  const options = {
    method,
    credentials: "same-origin",
    signal,
  };

  if (method !== "GET") {
    options.headers = {
      "Content-Type": "application/json",
      "X-OmniSight-Request": "1",
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetch(
    `${API_BASE}${path}`,
    options
  );

  if (!response.ok) {
    const errorBody = await response
      .json()
      .catch(() => null);

    const error = new Error(
      getErrorMessage(errorBody, response.status)
    );

    error.status = response.status;
    error.details = errorBody;

    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}


export function getCleaningOperations(options = {}) {
  return request("/cleaning/operations", options);
}


export function getDatasetHistory(options = {}) {
  return request("/datasets/current/history", options);
}


export function previewCleaning(
  kind,
  parameters,
  expectedVersion
) {
  return request("/cleaning/preview", {
    method: "POST",
    body: {
      kind,
      parameters,
      expected_version: expectedVersion,
    },
  });
}


export function applyCleaning(
  previewToken,
  expectedVersion
) {
  return request("/cleaning/apply", {
    method: "POST",
    body: {
      preview_token: previewToken,
      expected_version: expectedVersion,
    },
  });
}


export function undoCleaning(expectedVersion) {
  return request("/cleaning/undo", {
    method: "POST",
    body: {
      expected_version: expectedVersion,
    },
  });
}


export function resetCleaning(expectedVersion) {
  return request("/cleaning/reset", {
    method: "POST",
    body: {
      expected_version: expectedVersion,
    },
  });
}