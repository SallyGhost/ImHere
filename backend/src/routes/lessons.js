import { requireAuthentication } from "../middleware/authentication.js";
import { requireRole } from "../middleware/authorization.js";
import { decodePathSegment, readJsonObject, requiredString } from "../middleware/validation.js";
import {
  listLessonAttendance,
  markLessonAttendance,
  setLessonGrade,
} from "../services/attendanceService.js";
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
      const lateThresholdMinutes = body.lateThresholdMinutes === undefined ? 5 : body.lateThresholdMinutes;
      if (!Number.isInteger(lateThresholdMinutes) || lateThresholdMinutes < 0 || lateThresholdMinutes > 120) {
        throw new HttpError(400, "Поріг запізнення має бути цілим числом від 0 до 120 хвилин");
      }
      return jsonResponse(
        { lesson: await createLesson(env.DB, teacher.id, groupId, title, lateThresholdMinutes) },
        201,
      );
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  const lessonId = decodePathSegment(parts[0], "lesson id");
  if (parts.length === 2 && parts[1] === "attendance") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return jsonResponse(await listLessonAttendance(env.DB, lessonId, teacher.id));
  }
  if (parts.length === 3 && parts[1] === "attendance") {
    if (request.method !== "PATCH") return methodNotAllowed(["PATCH"]);
    const studentId = decodePathSegment(parts[2], "student id");
    const body = await readJsonObject(request);
    if (!["present", "late", "absent"].includes(body.status)) {
      throw new HttpError(400, "Статус має бути present, late або absent");
    }
    let lateMinutes = null;
    if (body.status === "late") {
      if (!Number.isInteger(body.lateMinutes) || body.lateMinutes < 1 || body.lateMinutes > 1440) {
        throw new HttpError(400, "Для статусу late вкажіть кількість хвилин від 1 до 1440");
      }
      lateMinutes = body.lateMinutes;
    }
    return jsonResponse({ attendance: await markLessonAttendance(env.DB, lessonId, studentId, teacher.id, body.status, lateMinutes) });
  }
  if (parts.length === 3 && parts[1] === "grades") {
    if (request.method !== "PUT") return methodNotAllowed(["PUT"]);
    const studentId = decodePathSegment(parts[2], "student id");
    const body = await readJsonObject(request);
    if (body.grade !== null && (!Number.isInteger(body.grade) || body.grade < 1 || body.grade > 12)) {
      throw new HttpError(400, "Оцінка має бути цілим числом від 1 до 12 або null");
    }
    return jsonResponse({ attendance: await setLessonGrade(env.DB, lessonId, studentId, teacher.id, body.grade) });
  }
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
