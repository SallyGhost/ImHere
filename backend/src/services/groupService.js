import { HttpError } from "../utils/http.js";

export async function createGroup(db, teacherId, name) {
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO groups (id, name, teacher_id) VALUES (?, ?, ?)")
    .bind(id, name, teacherId)
    .run();
  return getOwnedGroup(db, id, teacherId);
}

export async function listTeacherGroups(db, teacherId) {
  const result = await db
    .prepare("SELECT id, name, teacher_id, created_at FROM groups WHERE teacher_id = ? ORDER BY created_at DESC, id")
    .bind(teacherId)
    .all();
  return result.results;
}

export async function listStudentGroups(db, studentId) {
  const result = await db
    .prepare(`
      SELECT groups.id, groups.name, groups.teacher_id, groups.created_at,
        group_members.joined_at,
        (SELECT COUNT(*) FROM group_members AS members WHERE members.group_id = groups.id) AS member_count
      FROM group_members
      JOIN groups ON groups.id = group_members.group_id
      WHERE group_members.student_id = ?
      ORDER BY groups.name, groups.id
    `)
    .bind(studentId)
    .all();
  return result.results;
}

export async function getOwnedGroup(db, groupId, teacherId) {
  const group = await db
    .prepare("SELECT id, name, teacher_id, created_at FROM groups WHERE id = ? AND teacher_id = ? LIMIT 1")
    .bind(groupId, teacherId)
    .first();
  if (!group) throw new HttpError(404, "Групу не знайдено");
  return group;
}

export async function addStudentToGroup(db, groupId, teacherId, studentId) {
  await getOwnedGroup(db, groupId, teacherId);
  const student = await db
    .prepare("SELECT id FROM users WHERE id = ? AND role = 'student' LIMIT 1")
    .bind(studentId)
    .first();
  if (!student) throw new HttpError(404, "Учня не знайдено");

  await db
    .prepare("INSERT INTO group_members (group_id, student_id) VALUES (?, ?)")
    .bind(groupId, studentId)
    .run();
  return db
    .prepare("SELECT group_id, student_id, joined_at FROM group_members WHERE group_id = ? AND student_id = ?")
    .bind(groupId, studentId)
    .first();
}

export async function removeStudentFromGroup(db, groupId, teacherId, studentId) {
  await getOwnedGroup(db, groupId, teacherId);
  const result = await db
    .prepare("DELETE FROM group_members WHERE group_id = ? AND student_id = ?")
    .bind(groupId, studentId)
    .run();
  if (result.meta.changes === 0) throw new HttpError(404, "Учень не входить до цієї групи");
}

export async function listGroupMembers(db, groupId, teacherId) {
  await getOwnedGroup(db, groupId, teacherId);
  const result = await db
    .prepare(`
      SELECT users.id, users.email, group_members.joined_at
      FROM group_members
      JOIN users ON users.id = group_members.student_id
      WHERE group_members.group_id = ?
      ORDER BY users.email, users.id
    `)
    .bind(groupId)
    .all();
  return result.results;
}
