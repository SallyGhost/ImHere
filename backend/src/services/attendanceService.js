import { HttpError } from "../utils/http.js";

export async function listStudentHistory(db, studentId) {
  const result = await db
    .prepare(`
      SELECT attendance.id, attendance.lesson_id, attendance.marked_at,
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
             attendance.marked_at, users.email AS student_email,
             lessons.title, lessons.status, lessons.started_at, lessons.ended_at,
             groups.id AS group_id, groups.name AS group_name
      FROM attendance
      JOIN lessons ON lessons.id = attendance.lesson_id
      JOIN groups ON groups.id = lessons.group_id
      JOIN users ON users.id = attendance.student_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY COALESCE(lessons.started_at, attendance.marked_at) DESC, users.email
    `)
    .bind(...values)
    .all();
  return result.results;
}

export async function recordQrAttendance(db, lessonId, studentId) {
  const lesson = await db
    .prepare("SELECT id, group_id, status FROM lessons WHERE id = ? LIMIT 1")
    .bind(lessonId)
    .first();
  if (!lesson) throw new HttpError(404, "Lesson not found", "LESSON_NOT_FOUND");
  if (lesson.status !== "active") {
    throw new HttpError(409, "Lesson is not active", "LESSON_NOT_ACTIVE");
  }

  const membership = await db
    .prepare("SELECT 1 AS member FROM group_members WHERE group_id = ? AND student_id = ? LIMIT 1")
    .bind(lesson.group_id, studentId)
    .first();
  if (!membership) throw new HttpError(403, "Student is not a member of this group", "NOT_GROUP_MEMBER");

  const result = await db
    .prepare(`
      INSERT INTO attendance (id, lesson_id, student_id)
      VALUES (?, ?, ?)
      ON CONFLICT (lesson_id, student_id) DO NOTHING
    `)
    .bind(crypto.randomUUID(), lessonId, studentId)
    .run();

  if (result.meta.changes === 0) return { duplicate: true };
  const attendance = await db
    .prepare("SELECT id, lesson_id, student_id, marked_at FROM attendance WHERE lesson_id = ? AND student_id = ?")
    .bind(lessonId, studentId)
    .first();
  return { duplicate: false, attendance };
}
