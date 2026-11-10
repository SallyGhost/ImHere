import { requireAuthentication } from "../middleware/authentication.js";
import { requireRole } from "../middleware/authorization.js";
import { decodePathSegment, readJsonObject, requiredString } from "../middleware/validation.js";
import {
  addStudentToGroup,
  createGroup,
  getOwnedGroup,
  listStudentGroups,
  listGroupMembers,
  listTeacherGroups,
  removeStudentFromGroup,
} from "../services/groupService.js";
import { jsonResponse, methodNotAllowed } from "../utils/http.js";

export default async function groupsRoute(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").slice(3);

  if (parts.length === 0) {
    if (request.method === "GET") {
      const user = await requireAuthentication(request, env);
      if (user.role === "student") {
        return jsonResponse({ groups: await listStudentGroups(env.DB, user.id) });
      }
      const teacher = requireRole(user, "teacher");
      return jsonResponse({ groups: await listTeacherGroups(env.DB, teacher.id) });
    }
    if (request.method !== "POST") {
      return methodNotAllowed(["GET", "POST"]);
    }
    const teacher = requireRole(await requireAuthentication(request, env), "teacher");
    const body = await readJsonObject(request);
    const name = requiredString(body.name, "name", { min: 1, max: 120 });
    return jsonResponse({ group: await createGroup(env.DB, teacher.id, name) }, 201);
  }

  const groupId = decodePathSegment(parts[0], "group id");
  const teacher = requireRole(await requireAuthentication(request, env), "teacher");

  if (parts.length === 1) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return jsonResponse({ group: await getOwnedGroup(env.DB, groupId, teacher.id) });
  }

  if (parts.length === 2 && parts[1] === "members") {
    if (request.method === "GET") {
      return jsonResponse({ members: await listGroupMembers(env.DB, groupId, teacher.id) });
    }
    if (request.method === "POST") {
      const body = await readJsonObject(request);
      const studentId = requiredString(body.studentId, "studentId", { min: 1, max: 128 });
      return jsonResponse(
        { member: await addStudentToGroup(env.DB, groupId, teacher.id, studentId) },
        201,
      );
    }
    return methodNotAllowed(["GET", "POST"]);
  }

  if (parts.length === 3 && parts[1] === "members") {
    if (request.method !== "DELETE") return methodNotAllowed(["DELETE"]);
    const studentId = decodePathSegment(parts[2], "student id");
    await removeStudentFromGroup(env.DB, groupId, teacher.id, studentId);
    return jsonResponse({ status: "ok" });
  }

  return jsonResponse({ error: "Not found" }, 404);
}
