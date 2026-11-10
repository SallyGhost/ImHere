import { requireAuthentication } from "../middleware/authentication.js";
import {
  clearCsrfCookie,
  clearSessionCookie,
  csrfCookie,
  getSessionToken,
  sessionCookie,
} from "../middleware/cookies.js";
import { newCsrfToken } from "../middleware/csrf.js";
import { clientIp, enforceRateLimit } from "../middleware/rateLimit.js";
import {
  readJsonObject,
  requiredPassword,
  validEmail,
} from "../middleware/validation.js";
import { login, register, revokeSession } from "../services/authService.js";
import { HttpError, jsonResponse, methodNotAllowed } from "../utils/http.js";

function sessionTtl(env) {
  const value = Number(env.SESSION_TTL_SECONDS);
  return Number.isInteger(value) && value >= 60 && value <= 2_592_000 ? value : 86_400;
}

function sessionResponse(result, ttl, status = 200) {
  const csrfToken = newCsrfToken();
  const { token, ...publicResult } = result;
  const response = jsonResponse({ ...publicResult, csrfToken }, status);
  response.headers.append("set-cookie", sessionCookie(token, ttl));
  response.headers.append("set-cookie", csrfCookie(csrfToken));
  response.headers.set("cache-control", "no-store");
  return response;
}

export default async function authRoute(request, env, url) {
  const path = url.pathname;

  if (path === "/api/auth/csrf") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const csrfToken = newCsrfToken();
    const response = jsonResponse({ csrfToken });
    response.headers.append("set-cookie", csrfCookie(csrfToken));
    response.headers.set("cache-control", "no-store");
    return response;
  }

  if (path === "/api/auth/me") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const user = await requireAuthentication(request, env);
    return jsonResponse({ user });
  }

  if (path === "/api/auth/register") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (env.ALLOW_STUDENT_REGISTRATION !== "true") {
      throw new HttpError(403, "Реєстрацію учнів зараз вимкнено");
    }
    await enforceRateLimit(env.DB, "register-ip", clientIp(request), { limit: 5 });
    const body = await readJsonObject(request);
    if (body.role !== undefined && body.role !== "student") {
      throw new HttpError(403, "Публічна реєстрація доступна лише учням");
    }
    const email = validEmail(body.email);
    await enforceRateLimit(env.DB, "register-email", email, { limit: 5 });
    const password = requiredPassword(body.password, { min: 12, max: 128 });
    const ttl = sessionTtl(env);
    const result = await register(env.DB, email, password, ttl, env.AUTH_PEPPER);
    return sessionResponse(result, ttl, 201);
  }

  if (path === "/api/auth/login") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    await enforceRateLimit(env.DB, "login-ip", clientIp(request), { limit: 20 });
    const body = await readJsonObject(request);
    const email = validEmail(body.email);
    await enforceRateLimit(env.DB, "login-email", email, { limit: 5 });
    const password = requiredPassword(body.password, { min: 1, max: 128 });
    const ttl = sessionTtl(env);
    return sessionResponse(await login(env.DB, email, password, ttl, env.AUTH_PEPPER), ttl);
  }

  if (path === "/api/auth/logout") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    await requireAuthentication(request, env);
    const token = getSessionToken(request);
    await revokeSession(env.DB, token);
    const response = jsonResponse({ status: "ok" });
    response.headers.append("set-cookie", clearSessionCookie());
    response.headers.append("set-cookie", clearCsrfCookie());
    response.headers.set("cache-control", "no-store");
    return response;
  }

  return jsonResponse({ error: "Ресурс не знайдено" }, 404);
}
