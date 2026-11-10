import { HttpError, jsonResponse } from "../utils/http.js";

export function allowedOrigins(env) {
  return new Set(
    (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin && origin !== "*"),
  );
}

export function validateOrigin(request, env, { required = false } = {}) {
  const origin = request.headers.get("origin");
  if (!origin) {
    if (required) throw new HttpError(403, "У запиті не вказано джерело сторінки");
    return null;
  }
  if (!allowedOrigins(env).has(origin)) throw new HttpError(403, "Запити з цього джерела заборонені");
  return origin;
}

export function applyCors(response, origin) {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.append("vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function preflightResponse(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "Content-Type, X-CSRF-Token",
      "access-control-max-age": "600",
      vary: "Origin",
    },
  });
}
