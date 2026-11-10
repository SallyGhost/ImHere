import { HttpError, jsonResponse } from "./utils/http.js";
import authRoute from "./routes/auth.js";
import groupsRoute from "./routes/groups.js";
import lessonsRoute from "./routes/lessons.js";
import qrRoute from "./routes/qr.js";
import attendanceRoute from "./routes/attendance.js";
import { applyCors, preflightResponse, validateOrigin } from "./middleware/cors.js";
import { requireCsrf } from "./middleware/csrf.js";
import { cleanupExpiredData } from "./middleware/rateLimit.js";

const routes = [
  ["/api/auth", authRoute],
  ["/api/groups", groupsRoute],
  ["/api/lessons", lessonsRoute],
  ["/api/qr", qrRoute],
  ["/api/attendance", attendanceRoute],
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    let origin = null;
    let response;

    try {
      if (method === "OPTIONS") {
        origin = validateOrigin(request, env, { required: true });
        return preflightResponse(origin);
      }

      origin = validateOrigin(request, env);
      if (!["GET", "HEAD"].includes(method) && url.pathname.startsWith("/api/")) {
        requireCsrf(request, env);
      }

      if (url.pathname === "/health") {
        response = method === "GET"
          ? jsonResponse({ status: "ok" })
          : jsonResponse({ error: "Цей метод запиту не підтримується" }, 405, { allow: "GET" });
      } else {
        const matchedRoute = routes.find(([prefix]) =>
          url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
        );

        if (matchedRoute) {
          response = await matchedRoute[1](request, env, url);
        } else {
          response = jsonResponse({ error: "Ресурс не знайдено" }, 404);
        }
      }
    } catch (error) {
      if (error instanceof HttpError) {
        response = error.code
          ? jsonResponse({ success: false, error: { code: error.code, message: error.message } }, error.status)
          : jsonResponse({ error: error.message }, error.status);
      } else {
        const message = String(error?.message ?? error);
        if (/UNIQUE constraint failed/i.test(message)) {
          response = jsonResponse({ error: "Такий ресурс уже існує" }, 409);
        } else if (/FOREIGN KEY constraint failed/i.test(message)) {
          response = jsonResponse({ error: "Пов’язаний ресурс не існує" }, 400);
        } else {
          console.error("Unhandled API error", error);
          response = jsonResponse({ error: "Внутрішня помилка сервера" }, 500);
        }
      }
    }

    return applyCors(response, origin);
  },

  async scheduled(_controller, env) {
    await cleanupExpiredData(env.DB);
  },
};
