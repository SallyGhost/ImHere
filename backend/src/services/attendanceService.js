import { HttpError } from "../utils/http.js";

function kyivDate(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function listStudentHistory(db, studentId) {
  const result = await db
    .prepare(`
      SELECT attendance.id, attendance.lesson_id, attendance.marked_at,
             attendance.status, attendance.late_minutes, attendance.grade,
             lessons.title, lessons.started_at, lessons.ended_at,
             groups.id AS group_id, groups.name AS group_name
      FROM attendance
      JOIN lessons ON lessons.id = attendance.lesson_id
      JOIN groups ON groups.id = lessons.group_id
      WHERE attendance.student_id = ?
      ORDER BY COALESCE(lessons.started_at, attendance.marked_at) DESC
    `)
    .bind(studentId)
    .all();
  return result.results;
}

export async function listTeacherHistory(db, teacherId, { groupId = null, studentId = null } = {}) {
  const conditions = ["groups.teacher_id = ?", "lessons.teacher_id = ?"];
  const values = [teacherId, teacherId];
  if (groupId) {
    conditions.push("lessons.group_id = ?");
    values.push(groupId);
  }
  if (studentId) {
    conditions.push("attendance.student_id = ?");
    values.push(studentId);
  }
  const result = await db
    .prepare(`
      SELECT attendance.id, attendance.lesson_id, attendance.student_id,
             attendance.marked_at, attendance.status, attendance.late_minutes,
             attendance.grade, attendance.marked_manually,
             COALESCE(users.username, users.email) AS student_login,
             lessons.title, lessons.status AS lesson_status,
             lessons.started_at, lessons.ended_at,
             groups.id AS group_id, groups.name AS group_name
      FROM attendance
      JOIN lessons ON lessons.id = attendance.lesson_id
      JOIN groups ON groups.id = lessons.group_id
      JOIN users ON users.id = attendance.student_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY COALESCE(lessons.started_at, attendance.marked_at) DESC, COALESCE(users.username, users.email)
    `)
    .bind(...values)
    .all();
  return result.results;
}

export async function listLessonAttendance(db, lessonId, teacherId) {
  const lesson = await db
    .prepare(`
      SELECT lessons.id, lessons.group_id, lessons.title, lessons.status,
             lessons.late_threshold_minutes, lessons.started_at, lessons.ended_at
      FROM lessons
      JOIN groups ON groups.id = lessons.group_id
      WHERE lessons.id = ? AND lessons.teacher_id = ? AND groups.teacher_id = ?
      LIMIT 1
    `)
    .bind(lessonId, teacherId, teacherId)
    .first();
  if (!lesson) throw new HttpError(404, "Заняття не знайдено");

  const result = await db
    .prepare(`
      SELECT users.id AS student_id, COALESCE(users.username, users.email) AS student_login,
             attendance.id AS attendance_id, attendance.status,
             attendance.late_minutes, attendance.marked_at,
             attendance.grade, attendance.marked_manually
      FROM group_members
      JOIN users ON users.id = group_members.student_id
      LEFT JOIN attendance
        ON attendance.lesson_id = ? AND attendance.student_id = users.id
      WHERE group_members.group_id = ?
      ORDER BY COALESCE(users.username, users.email) COLLATE NOCASE
    `)
    .bind(lessonId, lesson.group_id)
    .all();

  return { lesson, attendance: result.results };
}

export async function markLessonAttendance(db, lessonId, studentId, teacherId, status, lateMinutes) {
  const lesson = await db
    .prepare(`
      SELECT lessons.id, lessons.group_id, lessons.status
      FROM lessons
      JOIN groups ON groups.id = lessons.group_id
      WHERE lessons.id = ? AND lessons.teacher_id = ? AND groups.teacher_id = ?
      LIMIT 1
    `)
    .bind(lessonId, teacherId, teacherId)
    .first();
  if (!lesson) throw new HttpError(404, "Заняття не знайдено");
  if (lesson.status === "planned") throw new HttpError(409, "Спочатку розпочніть заняття");

  const membership = await db
    .prepare("SELECT 1 AS member FROM group_members WHERE group_id = ? AND student_id = ? LIMIT 1")
    .bind(lesson.group_id, studentId)
    .first();
  if (!membership) throw new HttpError(404, "Учень не входить до групи цього заняття");

  await db
    .prepare(`
      INSERT INTO attendance
        (id, lesson_id, student_id, status, late_minutes, marked_by, marked_manually)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT (lesson_id, student_id) DO UPDATE SET
        status = excluded.status,
        late_minutes = excluded.late_minutes,
        marked_by = excluded.marked_by,
        marked_manually = 1,
        marked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `)
    .bind(crypto.randomUUID(), lessonId, studentId, status, lateMinutes, teacherId)
    .run();

  return db
    .prepare(`
      SELECT id, lesson_id, student_id, status, late_minutes, marked_at,
             grade, marked_by, marked_manually
      FROM attendance WHERE lesson_id = ? AND student_id = ?
    `)
    .bind(lessonId, studentId)
    .first();
}

export async function setLessonGrade(db, lessonId, studentId, teacherId, grade) {
  const lesson = await db
    .prepare(`
      SELECT lessons.id, lessons.status, lessons.started_at
      FROM lessons
      JOIN groups ON groups.id = lessons.group_id
      WHERE lessons.id = ? AND lessons.teacher_id = ? AND groups.teacher_id = ?
      LIMIT 1
    `)
    .bind(lessonId, teacherId, teacherId)
    .first();
  if (!lesson) throw new HttpError(404, "Заняття не знайдено");
  if (lesson.status === "planned" || !lesson.started_at) {
    throw new HttpError(409, "Оцінку можна виставити після початку заняття");
  }
  if (kyivDate(Date.now()) !== kyivDate(lesson.started_at)) {
    throw new HttpError(409, "Термін редагування оцінки завершився", "GRADE_WINDOW_CLOSED");
  }

  const result = await db
    .prepare(`
      UPDATE attendance
      SET grade = ?, grade_updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE lesson_id = ? AND student_id = ?
    `)
    .bind(grade, teacherId, lessonId, studentId)
    .run();
  if (result.meta.changes !== 1) {
    throw new HttpError(404, "Спочатку зафіксуйте відвідування учня для цього заняття");
  }

  return db
    .prepare(`
      SELECT id, lesson_id, student_id, status, late_minutes, marked_at, grade
      FROM attendance WHERE lesson_id = ? AND student_id = ?
    `)
    .bind(lessonId, studentId)
    .first();
}

export async function recordQrAttendance(db, lessonId, studentId) {
  const lesson = await db
    .prepare(`
      SELECT id, group_id, status, started_at, late_threshold_minutes
      FROM lessons WHERE id = ? LIMIT 1
    `)
    .bind(lessonId)
    .first();
  if (!lesson) throw new HttpError(404, "Заняття не знайдено", "LESSON_NOT_FOUND");
  if (lesson.status !== "active") {
    throw new HttpError(409, "Заняття не триває", "LESSON_NOT_ACTIVE");
  }

  const membership = await db
    .prepare("SELECT 1 AS member FROM group_members WHERE group_id = ? AND student_id = ? LIMIT 1")
    .bind(lesson.group_id, studentId)
    .first();
  if (!membership) throw new HttpError(403, "Учень не входить до цієї групи", "NOT_GROUP_MEMBER");

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(lesson.started_at)) / 60_000));
  const isLate = elapsedMinutes > lesson.late_threshold_minutes;
  const status = isLate ? "late" : "present";
  const lateMinutes = isLate ? elapsedMinutes : null;
  const result = await db
    .prepare(`
      INSERT INTO attendance (id, lesson_id, student_id, status, late_minutes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (lesson_id, student_id) DO NOTHING
    `)
    .bind(crypto.randomUUID(), lessonId, studentId, status, lateMinutes)
    .run();

  if (result.meta.changes === 0) return { duplicate: true };
  const attendance = await db
    .prepare(`
      SELECT id, lesson_id, student_id, status, late_minutes, marked_at, grade
      FROM attendance WHERE lesson_id = ? AND student_id = ?
    `)
    .bind(lessonId, studentId)
    .first();
  return { duplicate: false, attendance };
}
