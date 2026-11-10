import { HttpError } from "../utils/http.js";
import { getOwnedGroup } from "./groupService.js";

const statusLabel = { planned: "запланованим", active: "активним", closed: "завершеним" };

export async function createLesson(db, teacherId, groupId, title) {
  await getOwnedGroup(db, groupId, teacherId);
  const id = crypto.randomUUID();
  await db
    .prepare(`
      INSERT INTO lessons (id, group_id, teacher_id, title, status)
      VALUES (?, ?, ?, ?, 'planned')
    `)
    .bind(id, groupId, teacherId, title)
    .run();
  return getOwnedLesson(db, id, teacherId);
}

export async function listTeacherLessons(db, teacherId, groupId = null) {
  if (groupId) await getOwnedGroup(db, groupId, teacherId);
  const statement = groupId
    ? db.prepare(`
        SELECT id, group_id, teacher_id, title, status, started_at, ended_at, created_at
        FROM lessons WHERE teacher_id = ? AND group_id = ?
        ORDER BY created_at DESC, id
      `).bind(teacherId, groupId)
    : db.prepare(`
        SELECT id, group_id, teacher_id, title, status, started_at, ended_at, created_at
        FROM lessons WHERE teacher_id = ?
        ORDER BY created_at DESC, id
      `).bind(teacherId);
  const result = await statement.all();
  return result.results;
}

export async function getOwnedLesson(db, lessonId, teacherId) {
  const lesson = await db
    .prepare(`
      SELECT lessons.id, lessons.group_id, lessons.teacher_id, lessons.title,
             lessons.status, lessons.started_at, lessons.ended_at, lessons.created_at
      FROM lessons
      JOIN groups ON groups.id = lessons.group_id
      WHERE lessons.id = ?
        AND lessons.teacher_id = ?
        AND groups.teacher_id = ?
      LIMIT 1
    `)
    .bind(lessonId, teacherId, teacherId)
    .first();
  if (!lesson) throw new HttpError(404, "Заняття не знайдено");
  return lesson;
}

export async function startLesson(db, lessonId, teacherId) {
  const lesson = await getOwnedLesson(db, lessonId, teacherId);
  if (lesson.status !== "planned") {
    throw new HttpError(409, `Неможливо розпочати заняття зі статусом «${statusLabel[lesson.status] ?? "невідомим"}»`);
  }

  const result = await db
    .prepare(`
      UPDATE lessons
      SET status = 'active', started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND teacher_id = ? AND status = 'planned'
    `)
    .bind(lessonId, teacherId)
    .run();
  if (result.meta.changes !== 1) throw new HttpError(409, "Стан заняття змінився. Оновіть сторінку та спробуйте ще раз");
  return getOwnedLesson(db, lessonId, teacherId);
}

export async function closeLesson(db, lessonId, teacherId) {
  const lesson = await getOwnedLesson(db, lessonId, teacherId);
  if (lesson.status !== "active") {
    throw new HttpError(409, `Неможливо завершити заняття зі статусом «${statusLabel[lesson.status] ?? "невідомим"}»`);
  }

  const result = await db
    .prepare(`
      UPDATE lessons
      SET status = 'closed', ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND teacher_id = ? AND status = 'active'
    `)
    .bind(lessonId, teacherId)
    .run();
  if (result.meta.changes !== 1) throw new HttpError(409, "Стан заняття змінився. Оновіть сторінку та спробуйте ще раз");
  return getOwnedLesson(db, lessonId, teacherId);
}
