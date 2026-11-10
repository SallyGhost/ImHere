import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../src/services/authService.js";

const backend = process.cwd();
const baseUrl = process.env.IMHERE_API_URL ?? "http://localhost:8787";
const origin = "http://localhost:5500";
const runId = randomUUID().replaceAll("-", "");
const testIp = `test-${runId}`;
const teacherIds = [`test-teacher-${runId}`, `test-other-teacher-${runId}`];
const teacherEmails = [`teacher-${runId}@example.invalid`, `other-${runId}@example.invalid`];
const studentEmail = `student-${runId}@example.invalid`;
const outsiderEmail = `outsider-${runId}@example.invalid`;
const password = `Local-test-${runId}!`;
const usersToDelete = [...teacherIds];
const tempDir = await mkdtemp(join(tmpdir(), "imhere-security-"));
const wranglerCli = join(backend, "node_modules", "wrangler", "bin", "wrangler.js");
const contexts = [];
let groupId;
let lessonId;

function sqlValue(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function executeLocalSql(sql) {
  const file = join(tempDir, `${randomUUID()}.sql`);
  await writeFile(file, sql, "utf8");
  try {
    execFileSync(process.execPath, [wranglerCli, "d1", "execute", "imhere-db", "--local", `--file=${file}`], {
      cwd: backend,
      stdio: "pipe",
    });
  } finally {
    await rm(file, { force: true });
  }
}

function putCookies(context, response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    const pair = cookie.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator >= 0) context.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(context) {
  return [...context.cookies].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function readPayload(response) {
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function bootstrapCsrf(context) {
  const response = await fetch(`${baseUrl}/api/auth/csrf`, {
    headers: { origin, "cf-connecting-ip": testIp },
  });
  putCookies(context, response);
  const payload = await readPayload(response);
  assert.equal(response.status, 200, "CSRF bootstrap should succeed");
  context.csrf = payload.csrfToken;
}

function makeContext() {
  const context = { cookies: new Map(), csrf: null };
  contexts.push(context);
  return context;
}

async function request(context, path, {
  method = "GET",
  body,
  withCsrf = true,
  requestOrigin = origin,
} = {}) {
  const headers = new Headers({ origin: requestOrigin, "cf-connecting-ip": testIp });
  if (cookieHeader(context)) headers.set("cookie", cookieHeader(context));
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && withCsrf) {
    if (!context.csrf) await bootstrapCsrf(context);
    headers.set("x-csrf-token", context.csrf);
    if (cookieHeader(context)) headers.set("cookie", cookieHeader(context));
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  putCookies(context, response);
  const payload = await readPayload(response);
  if (typeof payload?.csrfToken === "string") context.csrf = payload.csrfToken;
  return { response, payload };
}

function status(result, expected, label) {
  assert.equal(result.response.status, expected, `${label}: ${JSON.stringify(result.payload)}`);
  return result.payload;
}

async function register(email, ctx = makeContext()) {
  return { ctx, ...(await request(ctx, "/api/auth/register", { method: "POST", body: { email, password } })) };
}

async function login(email, ctx = makeContext(), passwordValue = password) {
  return { ctx, ...(await request(ctx, "/api/auth/login", { method: "POST", body: { email, password: passwordValue } })) };
}

function hashLimiter(scope, identity) {
  return createHash("sha256").update(`${scope}:${identity || "unknown"}`).digest("hex");
}

async function cleanup() {
  const rateKeys = new Set();
  const identities = [testIp, "unknown", "127.0.0.1", "::1"];
  for (const identity of identities) {
    rateKeys.add(hashLimiter("register-ip", identity));
    rateKeys.add(hashLimiter("login-ip", identity));
  }
  for (const email of [studentEmail, outsiderEmail, ...teacherEmails, `missing-${runId}@example.invalid`, `rate-limit-${runId}@example.invalid`]) {
    rateKeys.add(hashLimiter("register-email", email));
    rateKeys.add(hashLimiter("login-email", email));
  }
  for (const id of [...teacherIds, ...usersToDelete]) {
    rateKeys.add(hashLimiter("qr-issue-teacher", id));
    rateKeys.add(hashLimiter("attendance-student", id));
  }

  const ids = [...new Set(usersToDelete)];
  const idList = ids.map(sqlValue).join(",") || "''";
  const keysList = [...rateKeys].map(sqlValue).join(",") || "''";
  const statements = [];
  if (lessonId) statements.push(`DELETE FROM attendance WHERE lesson_id = ${sqlValue(lessonId)};`);
  if (groupId) {
    statements.push(`DELETE FROM group_members WHERE group_id = ${sqlValue(groupId)};`);
    statements.push(`DELETE FROM lessons WHERE group_id = ${sqlValue(groupId)};`);
    statements.push(`DELETE FROM groups WHERE id = ${sqlValue(groupId)};`);
  }
  statements.push(`DELETE FROM sessions WHERE user_id IN (${idList});`);
  statements.push(`DELETE FROM users WHERE id IN (${idList});`);
  statements.push(`DELETE FROM api_rate_limits WHERE key_hash IN (${keysList});`);
  if (statements.length) await executeLocalSql(statements.join("\n"));
  await rm(tempDir, { recursive: true, force: true });
}

async function run() {
  const varsText = await readFile(join(backend, ".dev.vars"), "utf8");
  const pepper = varsText.split(/\r?\n/).find((line) => line.startsWith("AUTH_PEPPER="))?.slice("AUTH_PEPPER=".length);
  const qrSecret = varsText.split(/\r?\n/).find((line) => line.startsWith("QR_SECRET="))?.slice("QR_SECRET=".length);
  assert.ok(pepper && pepper.length >= 32, "Set AUTH_PEPPER in backend/.dev.vars first");
  assert.ok(qrSecret && qrSecret.length >= 32, "Set QR_SECRET in backend/.dev.vars first");

  const teacherHash = await hashPassword(password, pepper);
  const secondTeacherHash = await hashPassword(password, pepper);
  await executeLocalSql(teacherIds.map((id, index) => `
    INSERT INTO users (id, email, password_hash, role)
    VALUES (${sqlValue(id)}, ${sqlValue(teacherEmails[index])}, ${sqlValue(index ? secondTeacherHash : teacherHash)}, 'teacher');
  `).join("\n"));

  const noAuth = await request(makeContext(), "/api/auth/me");
  status(noAuth, 401, "unauthenticated session lookup");

  const preflight = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-csrf-token",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);

  const oversizedRegistration = await request(makeContext(), "/api/auth/register", {
    method: "POST",
    body: { email: `large-${runId}@example.invalid`, password: "x".repeat(17_000) },
  });
  status(oversizedRegistration, 413, "oversized request body");

  const roleEscalation = await request(makeContext(), "/api/auth/register", {
    method: "POST",
    body: { email: `role-${runId}@example.invalid`, password, role: "teacher" },
  });
  status(roleEscalation, 403, "public teacher registration must be rejected");

  const studentRegistration = await register(studentEmail);
  status(studentRegistration, 201, "student registration");
  const student = studentRegistration.ctx;
  usersToDelete.push(studentRegistration.payload.user.id);
  assert.equal(studentRegistration.payload.user.role, "student");
  assert.equal("token" in studentRegistration.payload, false, "session token must not be returned to JavaScript");
  const sessionCookie = [...student.cookies.keys()].find((name) => name.endsWith("imhere_session"));
  assert.ok(sessionCookie, "session cookie should be set");
  const setCookie = studentRegistration.response.headers.getSetCookie().find((cookie) => cookie.includes(sessionCookie));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=None/i);
  assert.match(setCookie, /Partitioned/i);

  const duplicateRegistration = await request(student, "/api/auth/register", {
    method: "POST",
    body: { email: studentEmail, password },
  });
  status(duplicateRegistration, 409, "duplicate email registration");

  const outsiderRegistration = await register(outsiderEmail);
  status(outsiderRegistration, 201, "non-member account registration");
  const outsider = outsiderRegistration.ctx;
  usersToDelete.push(outsiderRegistration.payload.user.id);

  const badLogin = await login(teacherEmails[0], makeContext(), "wrong-password");
  status(badLogin, 401, "wrong password");

  const teacherLogin = await login(teacherEmails[0]);
  status(teacherLogin, 200, "teacher login");
  const teacher = teacherLogin.ctx;

  const studentCreateGroup = await request(student, "/api/groups", { method: "POST", body: { name: "Forbidden" } });
  status(studentCreateGroup, 403, "student cannot create group");
  status(await request(teacher, "/api/groups", { method: "POST", body: { name: 42 } }), 400, "group name type validation");

  const hostileGroupName = "test'); DROP TABLE users;--";
  const createdGroup = await request(teacher, "/api/groups", { method: "POST", body: { name: hostileGroupName } });
  status(createdGroup, 201, "teacher creates group");
  groupId = createdGroup.payload.group.id;
  assert.equal(createdGroup.payload.group.name, hostileGroupName, "SQL-like input must remain a plain value");
  const groupList = await request(teacher, "/api/groups");
  assert.ok(groupList.payload.groups.some((group) => group.id === groupId));
  status(await request(teacher, `/api/groups/${groupId}`), 200, "teacher reads own group");

  const secondTeacherLogin = await login(teacherEmails[1]);
  status(secondTeacherLogin, 200, "second teacher login");
  const foreignGroup = await request(secondTeacherLogin.ctx, `/api/groups/${groupId}`);
  status(foreignGroup, 404, "teacher cannot read another teacher's group");

  status(await request(teacher, `/api/groups/${groupId}/members`, {
    method: "POST", body: { studentId: studentRegistration.payload.user.id },
  }), 201, "teacher adds student");
  const memberList = await request(teacher, `/api/groups/${groupId}/members`);
  assert.equal(memberList.payload.members.length, 1);
  status(await request(teacher, `/api/groups/${groupId}/members`, {
    method: "POST", body: { studentId: outsiderRegistration.payload.user.id },
  }), 201, "teacher adds second student");
  status(await request(teacher, `/api/groups/${groupId}/members/${outsiderRegistration.payload.user.id}`, {
    method: "DELETE",
  }), 200, "teacher removes student");
  const studentGroups = await request(student, "/api/groups");
  const visibleStudentGroup = studentGroups.payload.groups.find((group) => group.id === groupId);
  assert.ok(visibleStudentGroup, "student should see groups they joined");
  assert.equal(visibleStudentGroup.member_count, 1);
  assert.equal("email" in visibleStudentGroup, false, "student group list must not reveal member email addresses");

  const createdLesson = await request(teacher, "/api/lessons", {
    method: "POST", body: { groupId, title: "Rotating QR test" },
  });
  status(createdLesson, 201, "teacher creates lesson");
  lessonId = createdLesson.payload.lesson.id;
  assert.equal(createdLesson.payload.lesson.status, "planned");
  assert.equal((await request(teacher, "/api/lessons")).payload.lessons.length, 1);
  status(await request(teacher, `/api/lessons/${lessonId}`), 200, "teacher reads own lesson");
  status(await request(teacher, `/api/lessons/${lessonId}/start`, { method: "POST" }), 200, "teacher starts lesson");
  const qr = await request(teacher, `/api/qr/lessons/${lessonId}/token`);
  status(qr, 200, "teacher receives active QR");

  const noCsrf = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token }, withCsrf: false,
  });
  status(noCsrf, 403, "missing CSRF token");
  const evilOrigin = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token }, requestOrigin: "https://attacker.invalid",
  });
  status(evilOrigin, 403, "disallowed Origin");

  const noSessionContext = makeContext();
  const unauthenticatedScan = await request(noSessionContext, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token },
  });
  status(unauthenticatedScan, 401, "attendance without session");

  const validAttendance = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token },
  });
  status(validAttendance, 201, "current QR for group member");
  const duplicateAttendance = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token },
  });
  status(duplicateAttendance, 409, "duplicate attendance");
  assert.equal(duplicateAttendance.payload.error.code, "ALREADY_ATTENDED");

  const staleTimeSlot = qr.payload.token.timeSlot - 1;
  const staleToken = {
    ...qr.payload.token,
    timeSlot: staleTimeSlot,
    signature: createHmac("sha256", qrSecret)
      .update(`v1\n${lessonId}\n${staleTimeSlot}`)
      .digest("hex"),
  };
  const staleQr = await request(student, "/api/attendance/qr", { method: "POST", body: { token: staleToken } });
  status(staleQr, 410, "stale QR");

  const changedSignature = qr.payload.token.signature[0] === "a" ? "b" : "a";
  const forgedQr = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: { ...qr.payload.token, signature: changedSignature + qr.payload.token.signature.slice(1) } },
  });
  status(forgedQr, 401, "modified QR signature");
  const malformedQr = await request(student, "/api/attendance/qr", { method: "POST", body: { token: { version: 1 } } });
  status(malformedQr, 400, "malformed QR");

  const outsiderScan = await request(outsider, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token },
  });
  status(outsiderScan, 403, "student outside group");

  const studentHistory = await request(student, "/api/attendance/history");
  assert.equal(studentHistory.payload.attendance.length, 1);
  assert.ok(studentHistory.payload.attendance.every((row) => row.lesson_id === lessonId));
  const teacherHistory = await request(teacher, `/api/attendance/history?groupId=${groupId}`);
  assert.equal(teacherHistory.payload.attendance.length, 1);
  const foreignHistory = await request(secondTeacherLogin.ctx, `/api/attendance/history?groupId=${groupId}`);
  status(foreignHistory, 404, "teacher cannot query foreign group history");

  const qrBeforeClose = await request(teacher, `/api/qr/lessons/${lessonId}/token`);
  status(qrBeforeClose, 200, "fresh QR before close");
  const closedLesson = await request(teacher, `/api/lessons/${lessonId}/close`, { method: "POST" });
  status(closedLesson, 200, "teacher closes lesson");
  const closedQrIssue = await request(teacher, `/api/qr/lessons/${lessonId}/token`);
  status(closedQrIssue, 409, "QR issuance after close");
  const closedQrScan = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: qrBeforeClose.payload.token },
  });
  status(closedQrScan, 409, "scan after lesson close");
  status(await request(teacher, `/api/lessons/${lessonId}/start`, { method: "POST" }), 409, "restarting a closed lesson");

  status(await request(student, "/api/auth/logout", { method: "POST" }), 200, "logout revokes session");
  status(await request(student, "/api/auth/me"), 401, "revoked session cannot be reused");

  const teacherToken = teacher.cookies.get(sessionCookie);
  const tokenHash = createHash("sha256").update(teacherToken).digest("hex");
  await executeLocalSql(`UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token_hash = ${sqlValue(tokenHash)};`);
  status(await request(teacher, "/api/auth/me"), 401, "expired session");
  const scheduledCleanup = await fetch(`${baseUrl}/cdn-cgi/local/scheduled`);
  assert.equal(scheduledCleanup.status, 200, "scheduled cleanup should run locally");

  const throttledEmail = `rate-limit-${runId}@example.invalid`;
  for (let index = 0; index < 5; index += 1) {
    status(await login(throttledEmail, makeContext(), "wrong-password"), 401, `rate-limit attempt ${index + 1}`);
  }
  status(await login(throttledEmail, makeContext(), "wrong-password"), 429, "login rate limit");

  console.log("Security and QR integration checks passed.");
}

try {
  await run();
} finally {
  await cleanup();
}
