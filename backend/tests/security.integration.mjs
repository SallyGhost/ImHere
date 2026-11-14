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
const absentEmail = `absent-${runId}@example.invalid`;
const absentUserId = `test-absent-${runId}`;
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
  assert.equal(response.status, 200, "Перевірку CSRF успішно ініційовано");
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
  remoteIp = testIp,
} = {}) {
  const headers = new Headers({ origin: requestOrigin, "cf-connecting-ip": remoteIp });
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

async function register(email, ctx = makeContext(), passwordValue = password) {
  return { ctx, ...(await request(ctx, "/api/auth/register", { method: "POST", body: { email, password: passwordValue } })) };
}

async function login(email, ctx = makeContext(), passwordValue = password) {
  return { ctx, ...(await request(ctx, "/api/auth/login", { method: "POST", body: { email, password: passwordValue } })) };
}

function hashLimiter(scope, identity) {
  return createHash("sha256").update(`${scope}:${identity || "unknown"}`).digest("hex");
}

async function cleanup() {
  const rateKeys = new Set();
  const identities = [testIp, `short-${runId}`, `nonlatin-${runId}`, "unknown", "127.0.0.1", "::1"];
  for (const identity of identities) {
    rateKeys.add(hashLimiter("register-ip", identity));
    rateKeys.add(hashLimiter("login-ip", identity));
  }
  for (const email of [studentEmail, outsiderEmail, absentEmail, ...teacherEmails, `missing-${runId}@example.invalid`, `rate-limit-${runId}@example.invalid`, `short-${runId}@example.invalid`, `nonlatin-${runId}@example.invalid`]) {
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
  assert.ok(pepper && pepper.length >= 32, "Спочатку задайте AUTH_PEPPER у backend/.dev.vars");
  assert.ok(qrSecret && qrSecret.length >= 32, "Спочатку задайте QR_SECRET у backend/.dev.vars");

  const teacherHash = await hashPassword(password, pepper);
  const secondTeacherHash = await hashPassword(password, pepper);
  await executeLocalSql(teacherIds.map((id, index) => `
    INSERT INTO users (id, email, password_hash, role)
    VALUES (${sqlValue(id)}, ${sqlValue(teacherEmails[index])}, ${sqlValue(index ? secondTeacherHash : teacherHash)}, 'teacher');
  `).join("\n"));

  const noAuth = await request(makeContext(), "/api/auth/me");
  status(noAuth, 401, "перевірка сеансу без автентифікації");

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
  status(oversizedRegistration, 413, "завелике тіло запиту");

  const shortRegistration = await request(makeContext(), "/api/auth/register", {
    method: "POST", body: { email: `short-${runId}@example.invalid`, password: "Ab1!x" },
    remoteIp: `short-${runId}`,
  });
  status(shortRegistration, 400, "пароль коротший за 6 символів");
  const nonLatinRegistration = await request(makeContext(), "/api/auth/register", {
    method: "POST", body: { email: `nonlatin-${runId}@example.invalid`, password: "Пароль123!" },
    remoteIp: `nonlatin-${runId}`,
  });
  status(nonLatinRegistration, 400, "пароль із кириличними символами");

  const roleEscalation = await request(makeContext(), "/api/auth/register", {
    method: "POST",
    body: { email: `role-${runId}@example.invalid`, password, role: "teacher" },
  });
  status(roleEscalation, 403, "публічну реєстрацію викладача має бути відхилено");

  const studentRegistration = await register(studentEmail, makeContext(), "Ab1!xy");
  status(studentRegistration, 201, "реєстрація учня");
  const student = studentRegistration.ctx;
  usersToDelete.push(studentRegistration.payload.user.id);
  assert.equal(studentRegistration.payload.user.role, "student");
  assert.equal("token" in studentRegistration.payload, false, "токен сеансу не має передаватися JavaScript");
  const sessionCookie = [...student.cookies.keys()].find((name) => name.endsWith("imhere_session"));
  assert.ok(sessionCookie, "файл cookie сеансу має бути встановлено");
  const setCookie = studentRegistration.response.headers.getSetCookie().find((cookie) => cookie.includes(sessionCookie));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=None/i);
  assert.match(setCookie, /Partitioned/i);

  const duplicateRegistration = await request(student, "/api/auth/register", {
    method: "POST",
    body: { email: studentEmail, password },
  });
  status(duplicateRegistration, 409, "повторна реєстрація електронної адреси");

  const outsiderRegistration = await register(outsiderEmail);
  status(outsiderRegistration, 201, "non-member account registration");
  const outsider = outsiderRegistration.ctx;
  usersToDelete.push(outsiderRegistration.payload.user.id);
  usersToDelete.push(absentUserId);
  await executeLocalSql(`
    INSERT INTO users (id, email, password_hash, role)
    VALUES (${sqlValue(absentUserId)}, ${sqlValue(absentEmail)}, ${sqlValue(teacherHash)}, 'student');
  `);
  const absentLogin = await login(absentEmail);
  status(absentLogin, 200, "вхід учня для перевірки автоматичного пропуску");
  const absentStudent = absentLogin.ctx;

  const badLogin = await login(teacherEmails[0], makeContext(), "неправильний-пароль");
  status(badLogin, 401, "неправильний пароль");

  const teacherLogin = await login(teacherEmails[0]);
  status(teacherLogin, 200, "вхід викладача");
  const teacher = teacherLogin.ctx;

  const studentCreateGroup = await request(student, "/api/groups", { method: "POST", body: { name: "Заборонено" } });
  status(studentCreateGroup, 403, "учень не може створити групу");
  status(await request(teacher, "/api/groups", { method: "POST", body: { name: 42 } }), 400, "перевірка типу назви групи");

  const hostileGroupName = "test'); DROP TABLE users;--";
  const createdGroup = await request(teacher, "/api/groups", { method: "POST", body: { name: hostileGroupName } });
  status(createdGroup, 201, "викладач створює групу");
  groupId = createdGroup.payload.group.id;
  assert.equal(createdGroup.payload.group.name, hostileGroupName, "рядок, схожий на SQL-команду, має залишитися звичайним значенням");
  const groupList = await request(teacher, "/api/groups");
  assert.ok(groupList.payload.groups.some((group) => group.id === groupId));
  status(await request(teacher, `/api/groups/${groupId}`), 200, "викладач переглядає власну групу");

  const secondTeacherLogin = await login(teacherEmails[1]);
  status(secondTeacherLogin, 200, "second teacher login");
  const foreignGroup = await request(secondTeacherLogin.ctx, `/api/groups/${groupId}`);
  status(foreignGroup, 404, "викладач не може переглядати чужу групу");

  status(await request(teacher, `/api/groups/${groupId}/members`, {
    method: "POST", body: { email: studentEmail.toUpperCase() },
  }), 201, "викладач додає учня за електронною адресою");
  const memberList = await request(teacher, `/api/groups/${groupId}/members`);
  assert.equal(memberList.payload.members.length, 1);
  assert.equal(memberList.payload.members[0].email, studentEmail);
  status(await request(teacher, `/api/groups/${groupId}/members`, {
    method: "POST", body: { email: `missing-${runId}@example.invalid` },
  }), 404, "додавання незареєстрованого учня відхиляється");
  status(await request(teacher, `/api/groups/${groupId}/members`, {
    method: "POST", body: { studentId: outsiderRegistration.payload.user.id },
  }), 201, "викладач додає другого учня");
  status(await request(teacher, `/api/groups/${groupId}/members/${outsiderRegistration.payload.user.id}`, {
    method: "DELETE",
  }), 200, "викладач вилучає учня");
  const studentGroups = await request(student, "/api/groups");
  const visibleStudentGroup = studentGroups.payload.groups.find((group) => group.id === groupId);
  assert.ok(visibleStudentGroup, "учень має бачити групи, до яких його додано");
  assert.equal(visibleStudentGroup.member_count, 1);
  assert.equal("email" in visibleStudentGroup, false, "список груп учня не має розкривати адреси електронної пошти учасників");

  status(await request(teacher, `/api/groups/${groupId}/members`, {
    method: "POST", body: { email: absentEmail },
  }), 201, "викладач додає учня для перевірки пропуску");

  const createdLesson = await request(teacher, "/api/lessons", {
    method: "POST", body: { groupId, title: "Перевірка QR-коду й журналу", lateThresholdMinutes: 5 },
  });
  status(createdLesson, 201, "викладач створює заняття");
  lessonId = createdLesson.payload.lesson.id;
  assert.equal(createdLesson.payload.lesson.status, "planned");
  assert.equal((await request(teacher, "/api/lessons")).payload.lessons.length, 1);
  status(await request(teacher, `/api/lessons/${lessonId}`), 200, "викладач переглядає власне заняття");
  status(await request(teacher, `/api/lessons/${lessonId}/start`, { method: "POST" }), 200, "викладач починає заняття");
  await executeLocalSql(`UPDATE lessons SET started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 minutes') WHERE id = ${sqlValue(lessonId)};`);
  const attendanceBeforeScan = await request(teacher, `/api/lessons/${lessonId}/attendance`);
  status(attendanceBeforeScan, 200, "викладач переглядає список відміток заняття");
  assert.equal(attendanceBeforeScan.payload.attendance.length, 2);
  assert.ok(attendanceBeforeScan.payload.attendance.every((row) => row.attendance_id === null));
  status(await request(secondTeacherLogin.ctx, `/api/lessons/${lessonId}/attendance`), 404, "викладач не переглядає чуже заняття");
  const qr = await request(teacher, `/api/qr/lessons/${lessonId}/token`);
  status(qr, 200, "викладач отримує чинний QR-код");

  const noCsrf = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token }, withCsrf: false,
  });
  status(noCsrf, 403, "відсутній токен CSRF");
  const evilOrigin = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token }, requestOrigin: "https://attacker.invalid",
  });
  status(evilOrigin, 403, "заборонене джерело запиту");

  const noSessionContext = makeContext();
  const unauthenticatedScan = await request(noSessionContext, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token },
  });
  status(unauthenticatedScan, 401, "відвідування без сеансу");

  const validAttendance = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token },
  });
  status(validAttendance, 201, "чинний QR-код для учасника групи");
  assert.equal(validAttendance.payload.attendance.status, "late");
  assert.ok(validAttendance.payload.attendance.late_minutes >= 5);
  const attendanceAfterScan = await request(teacher, `/api/lessons/${lessonId}/attendance`);
  const qrMarkedStudent = attendanceAfterScan.payload.attendance.find((row) => row.student_id === studentRegistration.payload.user.id);
  assert.equal(qrMarkedStudent.attendance_id, validAttendance.payload.attendance.id);
  assert.ok(qrMarkedStudent.marked_at);

  const badManualLate = await request(teacher, `/api/lessons/${lessonId}/attendance/${studentRegistration.payload.user.id}`, {
    method: "PATCH", body: { status: "late" },
  });
  status(badManualLate, 400, "ручне запізнення без кількості хвилин відхиляється");
  const manualAttendance = await request(teacher, `/api/lessons/${lessonId}/attendance/${studentRegistration.payload.user.id}`, {
    method: "PATCH", body: { status: "present" },
  });
  status(manualAttendance, 200, "викладач вручну змінює статус відвідування");
  assert.equal(manualAttendance.payload.attendance.status, "present");
  assert.equal(manualAttendance.payload.attendance.marked_manually, 1);
  const manualLate = await request(teacher, `/api/lessons/${lessonId}/attendance/${studentRegistration.payload.user.id}`, {
    method: "PATCH", body: { status: "late", lateMinutes: 9 },
  });
  assert.equal(manualLate.payload.attendance.status, "late");
  assert.equal(manualLate.payload.attendance.late_minutes, 9);

  status(await request(teacher, `/api/lessons/${lessonId}/grades/${studentRegistration.payload.user.id}`, {
    method: "PUT", body: { grade: 11 },
  }), 200, "викладач виставляє оцінку");
  const invalidGrade = await request(teacher, `/api/lessons/${lessonId}/grades/${studentRegistration.payload.user.id}`, {
    method: "PUT", body: { grade: 13 },
  });
  status(invalidGrade, 400, "оцінка поза шкалою відхиляється");
  status(await request(secondTeacherLogin.ctx, `/api/lessons/${lessonId}/grades/${studentRegistration.payload.user.id}`, {
    method: "PUT", body: { grade: 8 },
  }), 404, "інший викладач не змінює оцінку чужого заняття");
  const duplicateAttendance = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token },
  });
  status(duplicateAttendance, 409, "повторна відмітка відвідування");
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
  status(staleQr, 410, "прострочений QR-код");

  const changedSignature = qr.payload.token.signature[0] === "a" ? "b" : "a";
  const forgedQr = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: { ...qr.payload.token, signature: changedSignature + qr.payload.token.signature.slice(1) } },
  });
  status(forgedQr, 401, "змінений підпис QR-коду");
  const malformedQr = await request(student, "/api/attendance/qr", { method: "POST", body: { token: { version: 1 } } });
  status(malformedQr, 400, "неправильний формат QR-коду");

  const outsiderScan = await request(outsider, "/api/attendance/qr", {
    method: "POST", body: { token: qr.payload.token },
  });
  status(outsiderScan, 403, "учень не входить до групи");

  const studentHistory = await request(student, "/api/attendance/history");
  assert.equal(studentHistory.payload.attendance.length, 1);
  assert.ok(studentHistory.payload.attendance.every((row) => row.lesson_id === lessonId));
  assert.equal(studentHistory.payload.attendance[0].grade, 11);
  assert.equal(studentHistory.payload.attendance[0].late_minutes, 9);
  const teacherHistory = await request(teacher, `/api/attendance/history?groupId=${groupId}`);
  assert.equal(teacherHistory.payload.attendance.length, 1);
  assert.equal(teacherHistory.payload.attendance[0].grade, 11);
  const foreignHistory = await request(secondTeacherLogin.ctx, `/api/attendance/history?groupId=${groupId}`);
  status(foreignHistory, 404, "викладач не може переглядати історію чужої групи");

  const qrBeforeClose = await request(teacher, `/api/qr/lessons/${lessonId}/token`);
  status(qrBeforeClose, 200, "чинний QR-код перед завершенням");
  const closedLesson = await request(teacher, `/api/lessons/${lessonId}/close`, { method: "POST" });
  status(closedLesson, 200, "викладач завершує заняття");
  const closedQrScan = await request(student, "/api/attendance/qr", {
    method: "POST", body: { token: qrBeforeClose.payload.token },
  });
  status(closedQrScan, 409, "сканування після завершення заняття");
  const attendanceAfterClose = await request(teacher, `/api/lessons/${lessonId}/attendance`);
  const automaticallyAbsent = attendanceAfterClose.payload.attendance.find((row) => row.student_email === absentEmail);
  assert.equal(automaticallyAbsent.status, "absent");
  assert.equal(automaticallyAbsent.marked_manually, 0);
  status(await request(teacher, `/api/lessons/${lessonId}/grades/${absentUserId}`, {
    method: "PUT", body: { grade: 8 },
  }), 200, "викладач може оцінити відсутнього учня до кінця дня заняття");
  const absentHistory = await request(absentStudent, "/api/attendance/history");
  assert.equal(absentHistory.payload.attendance[0].status, "absent");
  assert.equal(absentHistory.payload.attendance[0].grade, 8);
  await executeLocalSql(`UPDATE lessons SET started_at = '2000-01-01T00:00:00.000Z' WHERE id = ${sqlValue(lessonId)};`);
  const expiredGrade = await request(teacher, `/api/lessons/${lessonId}/grades/${studentRegistration.payload.user.id}`, {
    method: "PUT", body: { grade: 10 },
  });
  status(expiredGrade, 409, "оцінку не можна змінити після календарного дня заняття");
  assert.equal(expiredGrade.payload.error.code, "GRADE_WINDOW_CLOSED");
  const closedQrIssue = await request(teacher, `/api/qr/lessons/${lessonId}/token`);
  status(closedQrIssue, 409, "створення QR-коду після завершення заняття");
  status(await request(teacher, `/api/lessons/${lessonId}/start`, { method: "POST" }), 409, "повторний запуск завершеного заняття");

  status(await request(student, "/api/auth/logout", { method: "POST" }), 200, "вихід завершує сеанс");
  status(await request(student, "/api/auth/me"), 401, "завершений сеанс не можна використати повторно");

  const teacherToken = teacher.cookies.get(sessionCookie);
  const tokenHash = createHash("sha256").update(teacherToken).digest("hex");
  await executeLocalSql(`UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token_hash = ${sqlValue(tokenHash)};`);
  status(await request(teacher, "/api/auth/me"), 401, "прострочений сеанс");
  const scheduledCleanup = await fetch(`${baseUrl}/cdn-cgi/local/scheduled`);
  assert.equal(scheduledCleanup.status, 200, "планове очищення має виконуватися локально");

  const throttledEmail = `rate-limit-${runId}@example.invalid`;
  for (let index = 0; index < 5; index += 1) {
    status(await login(throttledEmail, makeContext(), "неправильний-пароль"), 401, `спроба входу ${index + 1} у межах обмеження`);
  }
  status(await login(throttledEmail, makeContext(), "неправильний-пароль"), 429, "обмеження частоти входу");

  console.log("Перевірки безпеки та QR пройшли успішно.");
}

try {
  await run();
} finally {
  await cleanup();
}
