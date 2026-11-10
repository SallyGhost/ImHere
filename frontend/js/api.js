let csrfToken = null;

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message ?? payload?.error ?? `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.code = payload?.error?.code ?? null;
    this.payload = payload;
  }
}

function apiBaseUrl() {
  if (typeof window !== "undefined" && window.IMHERE_API_BASE_URL) {
    return window.IMHERE_API_BASE_URL.replace(/\/+$/, "");
  }
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "http://localhost:8787";
  }
  throw new Error("API не настроен: задайте window.IMHERE_API_BASE_URL в frontend/js/config.js");
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${apiBaseUrl()}/api/auth/csrf`, {
    method: "GET",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.csrfToken !== "string") {
    throw new ApiError(response.status, payload);
  }
  csrfToken = payload.csrfToken;
  return csrfToken;
}

export async function apiRequest(path, {
  method = "GET",
  body,
  headers = {},
  _csrfRetry = false,
} = {}) {
  const normalizedMethod = method.toUpperCase();
  const requestHeaders = new Headers(headers);
  requestHeaders.set("accept", "application/json");
  if (body !== undefined) requestHeaders.set("content-type", "application/json");

  if (!["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
    requestHeaders.set("x-csrf-token", await getCsrfToken());
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: normalizedMethod,
    credentials: "include",
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (typeof payload?.csrfToken === "string") csrfToken = payload.csrfToken;
  if (
    response.status === 403 && payload?.error === "CSRF validation failed" &&
    !["GET", "HEAD", "OPTIONS"].includes(normalizedMethod) && !_csrfRetry
  ) {
    csrfToken = null;
    return apiRequest(path, { method: normalizedMethod, body, headers, _csrfRetry: true });
  }
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}

export function clearCsrfToken() {
  csrfToken = null;
}
