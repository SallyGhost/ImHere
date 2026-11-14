import { requireAuthentication } from "../middleware/authentication.js";
import { requireRole } from "../middleware/authorization.js";
import { clientIp, enforceRateLimit } from "../middleware/rateLimit.js";
import {
  decodePathSegment,
  readJsonObject,
  requiredPassword,
  validUsername,
} from "../middleware/validation.js";
import { createFirstAdmin } from "../services/authService.js";
import { HttpError, jsonResponse, methodNotAllowed } from "../utils/http.js";

function constantTimeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function validatedPassword(value) {
  const password = requiredPassword(value, { min: 6, max: 128 });
  if (!/^[\x21-\x7E]+$/.test(password)) {
    throw new HttpError(400, "Пароль має містити лише латинські символи, цифри та знаки пунктуації");
  }
  return password;
}

export default async function adminRoute(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/api/admin/bootstrap") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    await enforceRateLimit(env.DB, "admin-bootstrap-ip", clientIp(request), { limit: 5 });
    const body = await readJsonObject(request);
    if (!constantTimeEqual(body.bootstrapCode, env.ADMIN_BOOTSTRAP_CODE)) {
      throw new HttpError(403, "Код первинного налаштування адміністратора неправильний");
    }
    const username = validUsername(body.username);
    const password = validatedPassword(body.password);
    const admin = await createFirstAdmin(env.DB, username, password, env.AUTH_PEPPER);
    return jsonResponse({ admin, message: "Адміністратора створено. Тепер увійдіть з обраним логіном і паролем." }, 201);
  }

  const admin = requireRole(await requireAuthentication(request, env), "admin");
  if (path === "/api/admin/registrations") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const result = await env.DB.prepare(`
      SELECT id, username, role, created_at
      FROM users
      WHERE approval_status = 'pending' AND is_admin = 0
      ORDER BY created_at, username
    `).all();
    return jsonResponse({ registrations: result.results });
  }

  const parts = path.split("/");
  if (
    parts.length === 6 &&
    parts[1] === "api" &&
    parts[2] === "admin" &&
    parts[3] === "registrations" &&
    parts[5] === "decision"
  ) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const userId = decodePathSegment(parts[4], "user id");
    const body = await readJsonObject(request);
    const status = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : null;
    if (!status) throw new HttpError(400, "Рішення має бути approve або reject");

    const result = await env.DB.prepare(`
      UPDATE users
      SET approval_status = ?, approval_decided_by = ?,
          approval_decided_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND approval_status = 'pending' AND is_admin = 0
    `).bind(status, admin.id, userId).run();
    if (result.meta.changes !== 1) {
      throw new HttpError(409, "Заявку вже розглянуто або її не знайдено");
    }
    return jsonResponse({ status });
  }

  return jsonResponse({ error: "Ресурс не знайдено" }, 404);
}
