import { requireAuthentication } from "../middleware/authentication.js";
import { requireRole } from "../middleware/authorization.js";
import { enforceRateLimit } from "../middleware/rateLimit.js";
import { decodePathSegment, readJsonObject } from "../middleware/validation.js";
import {
  listStudentHistory,
  listTeacherHistory,
  recordQrAttendance,
} from "../services/attendanceService.js";
import { getOwnedGroup } from "../services/groupService.js";
import { verifyQrToken } from "../services/qrService.js";
import { HttpError, jsonResponse, methodNotAllowed } from "../utils/http.js";

export default async function attendanceRoute(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/api/attendance/history") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const user = await requireAuthentication(request, env);
    if (user.role === "student") {
      return jsonResponse({ attendance: await listStudentHistory(env.DB, user.id) });
    }
    if (user.role !== "teacher") {
      throw new HttpError(403, "You do not have permission to view attendance history");
    }

    const groupIds = url.searchParams.getAll("groupId");
    const studentIds = url.searchParams.getAll("studentId");
    if (groupIds.length > 1 || studentIds.length > 1) {
      throw new HttpError(400, "Each filter may only be specified once");
    }
    const groupId = groupIds.length ? decodePathSegment(groupIds[0], "group id") : null;
    const studentId = studentIds.length ? decodePathSegment(studentIds[0], "student id") : null;
    if (groupId) await getOwnedGroup(env.DB, groupId, user.id);
    return jsonResponse({ attendance: await listTeacherHistory(env.DB, user.id, { groupId, studentId }) });
  }

  if (path !== "/api/attendance/qr") return jsonResponse({ error: "Not found" }, 404);
  if (request.method !== "POST") return methodNotAllowed(["POST"]);

  const student = requireRole(await requireAuthentication(request, env), "student");
  await enforceRateLimit(env.DB, "attendance-student", student.id, { limit: 10 });
  const body = await readJsonObject(request);
  const token = await verifyQrToken(env, body.token);
  const result = await recordQrAttendance(env.DB, token.lessonId, student.id);

  if (result.duplicate) {
    return jsonResponse({
      success: false,
      error: { code: "ALREADY_ATTENDED", message: "Attendance already recorded" },
    }, 409);
  }
  return jsonResponse({ success: true, attendance: result.attendance }, 201);
}
