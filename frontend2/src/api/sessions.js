/**
 * OmniSight session API client.
 */

const API_BASE = "/api/v1";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);

    throw new Error(
      body?.detail || `Request failed (${response.status})`
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function createSession() {
  return apiRequest("/sessions", {
    method: "POST",
    headers: {
      "X-OmniSight-Request": "1",
    },
  });
}

export function getCurrentSession() {
  return apiRequest("/sessions/current");
}

export function deleteSession() {
  return apiRequest("/sessions/current", {
    method: "DELETE",
    headers: {
      "X-OmniSight-Request": "1",
    },
  });
}

// Avoid duplicate initialization requests during
// React StrictMode development effect execution.
let initializationPromise = null;

export function initializeSession() {
  if (!initializationPromise) {
    initializationPromise = createSession().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

export function clearSessionInitialization() {
  initializationPromise = null;
}