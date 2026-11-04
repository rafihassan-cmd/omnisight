/**
 * OmniSight dataset API client.
 */

const API_BASE = "/api/v1";
const MAX_UPLOAD_BYTES = 50_000_000;


async function handleResponse(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(
      body?.detail ||
      `Request failed (${response.status})`
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}


export async function uploadDataset(file) {
  if (!file) {
    throw new Error("Select a CSV file first.");
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Only CSV files are supported.");
  }

  if (file.size === 0) {
    throw new Error("The selected file is empty.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("CSV exceeds the 50 MB upload limit.");
  }

  const response = await fetch(`${API_BASE}/datasets`, {
    method: "POST",
    credentials: "same-origin",

    headers: {
      "Content-Type": "text/csv",
      "X-OmniSight-Request": "1",
      "X-OmniSight-Filename": encodeURIComponent(
        file.name
      ),
    },

    body: file,
  });

  return handleResponse(response);
}


export async function getCurrentDataset() {
  const response = await fetch(
    `${API_BASE}/datasets/current`,
    {
      credentials: "same-origin",
    }
  );

  if (response.status === 404) {
    return null;
  }

  return handleResponse(response);
}


export async function deleteCurrentDataset() {
  const response = await fetch(
    `${API_BASE}/datasets/current`,
    {
      method: "DELETE",
      credentials: "same-origin",

      headers: {
        "X-OmniSight-Request": "1",
      },
    }
  );

  return handleResponse(response);
}

/**
 * Retrieve the complete analytical dataset profile.
 */
export async function getCurrentDatasetProfile({
  signal,
} = {}) {
  const response = await fetch(
    `${API_BASE}/datasets/current/profile`,
    {
      credentials: "same-origin",
      signal,
    }
  );

  return handleResponse(response);
}

export async function deleteDatasetColumn(
  columnId,
  expectedVersion
) {
  const response = await fetch(
    `${API_BASE}/datasets/current/columns/${encodeURIComponent(
      columnId
    )}`,
    {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-OmniSight-Request": "1",
      },
      body: JSON.stringify({
        expected_version: expectedVersion,
      }),
    }
  );

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => null);

    const detail = body?.detail;

    const message =
      typeof detail === "string"
        ? detail
        : typeof detail?.message === "string"
          ? detail.message
          : `Column deletion failed (${response.status}).`;

    const error = new Error(message);
    error.status = response.status;

    throw error;
  }

  return response.json();
}

/**
 * Rename a dataset column using its stable identifier.
 */
export async function renameDatasetColumn(
  columnId,
  newName,
  expectedVersion
) {
  const response = await fetch(
    `${API_BASE}/datasets/current/columns/${encodeURIComponent(
      columnId
    )}`,
    {
      method: "PATCH",
      credentials: "same-origin",

      headers: {
        "Content-Type": "application/json",
        "X-OmniSight-Request": "1",
      },

      body: JSON.stringify({
        name: newName,
        expected_version: expectedVersion,
      }),
    }
  );

  return handleResponse(response);
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadCleanedCsv() {
  const response = await fetch(
    `${API_BASE}/datasets/current/export.csv`,
    { credentials: "same-origin" }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : `Export failed (${response.status})`
    );
  }

  const blob = await response.blob();
  const disposition =
    response.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/.exec(disposition);

  saveBlob(blob, match ? match[1] : "dataset_cleaned.csv");
}