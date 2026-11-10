import { requireAuthentication } from "../middleware/authentication.js";
import { requireRole } from "../middleware/authorization.js";
import { decodePathSegment, readJsonObject, requiredString } from "../middleware/validation.js";
import {
  closeLesson,
  createLesson,
  getOwnedLesson,
  listTeacherLessons,
  startLesson,
} from "../services/lessonService.js";
import { HttpError, jsonResponse, methodNotAllowed } from "../utils/http.js";

export default async function lessonsRoute(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").slice(3);
  const teacher = requireRole(await requireAuthentication(request, env), "teacher");

  if (parts.length === 0) {
    if (request.method === "GET") {
      const groupIds = url.searchParams.getAll("groupId");
      if (groupIds.length > 1) throw new HttpError(400, "Ідентифікатор групи можна вказати лише один раз");
      const groupId = groupIds.length ? requiredString(groupIds[0], "groupId", { min: 1, max: 128 }) : null;
      return jsonResponse({ lessons: await listTeacherLessons(env.DB, teacher.id, groupId) });
    }
    if (request.method === "POST") {
      const body = await readJsonObject(request);
      const groupId = requiredString(body.groupId, "groupId", { min: 1, max: 128 });
      const title = requiredString(body.title, "title", { min: 1, max: 200 });
      return jsonResponse(
        { lesson: await createLesson(env.DB, teacher.id, groupId, title) },
        201,
      );
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  const lessonId = decodePathSegment(parts[0], "lesson id");
  if (parts.length === 1) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return jsonResponse({ lesson: await getOwnedLesson(env.DB, lessonId, teacher.id) });
  }

  if (parts.length === 2 && parts[1] === "start") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return jsonResponse({ lesson: await startLesson(env.DB, lessonId, teacher.id) });
  }

  if (parts.length === 2 && parts[1] === "close") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return jsonResponse({ lesson: await closeLesson(env.DB, lessonId, teacher.id) });
  }

  return jsonResponse({ error: "Ресурс не знайдено" }, 404);
}
