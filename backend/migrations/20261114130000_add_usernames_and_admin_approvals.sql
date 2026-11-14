ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE users ADD COLUMN approval_decided_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN approval_decided_at TEXT;
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0
  CHECK (is_admin IN (0, 1));

CREATE UNIQUE INDEX idx_users_username
  ON users(username COLLATE NOCASE)
  WHERE username IS NOT NULL;
CREATE INDEX idx_users_approval_status
  ON users(approval_status, created_at);
