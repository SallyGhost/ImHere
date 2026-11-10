import { requireAuthentication } from "../middleware/authentication.js";
import { requireRole } from "../middleware/authorization.js";
import { enforceRateLimit } from "../middleware/rateLimit.js";
import { decodePathSegment } from "../middleware/validation.js";
import { getOwnedLesson } from "../services/lessonService.js";
import { createQrToken } from "../services/qrService.js";
import { HttpError, jsonResponse, methodNotAllowed } from "../utils/http.js";

export default async function qrRoute(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const match = path.match(/^\/api\/qr\/lessons\/([^/]+)\/token$/);
  if (!match) return jsonResponse({ error: "Ресурс не знайдено" }, 404);
  if (request.method !== "GET") return methodNotAllowed(["GET"]);

  const teacher = requireRole(await requireAuthentication(request, env), "teacher");
  await enforceRateLimit(env.DB, "qr-issue-teacher", teacher.id, { limit: 30 });
  const lessonId = decodePathSegment(match[1], "lesson id");
  const lesson = await getOwnedLesson(env.DB, lessonId, teacher.id);
  if (lesson.status !== "active") {
    throw new HttpError(409, "QR-коди доступні лише під час заняття", "LESSON_NOT_ACTIVE");
  }

  const response = jsonResponse(await createQrToken(env, lessonId));
  response.headers.set("cache-control", "no-store, private");
  return response;
}
