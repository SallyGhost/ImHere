ALTER TABLE lessons
ADD COLUMN late_threshold_minutes INTEGER NOT NULL DEFAULT 5
CHECK (late_threshold_minutes BETWEEN 0 AND 120);

ALTER TABLE attendance
ADD COLUMN status TEXT NOT NULL DEFAULT 'present'
CHECK (status IN ('present', 'late', 'absent'));

ALTER TABLE attendance
ADD COLUMN late_minutes INTEGER
CHECK (late_minutes IS NULL OR late_minutes >= 0);

ALTER TABLE attendance
ADD COLUMN grade INTEGER
CHECK (grade IS NULL OR grade BETWEEN 1 AND 12);

ALTER TABLE attendance
ADD COLUMN marked_by TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE attendance
ADD COLUMN marked_manually INTEGER NOT NULL DEFAULT 0
CHECK (marked_manually IN (0, 1));

ALTER TABLE attendance
ADD COLUMN grade_updated_by TEXT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE attendance
ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
