CREATE INDEX idx_groups_teacher
ON groups(teacher_id);

CREATE INDEX idx_members_student
ON group_members(student_id);

CREATE INDEX idx_lessons_group
ON lessons(group_id);

CREATE INDEX idx_attendance_lesson
ON attendance(lesson_id);

CREATE INDEX idx_attendance_student
ON attendance(student_id);

CREATE INDEX idx_sessions_user
ON sessions(user_id);
