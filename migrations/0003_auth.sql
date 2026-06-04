-- Username/password auth, roles (admin|member), and login sessions.
-- No email / no email verification. Admins create members directly with a
-- username + password. See docs/architecture/backend.md (Auth).

ALTER TABLE users ADD COLUMN IF NOT EXISTS username      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Backfill username from email for any pre-existing rows.
UPDATE users SET username = COALESCE(username, split_part(email, '@', 1)) WHERE username IS NULL;

-- Normalise roles to admin|member.
UPDATE users SET role = 'admin'  WHERE role IN ('owner', 'host', 'reviewer');
UPDATE users SET role = 'member' WHERE role NOT IN ('admin', 'member');

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_org_username ON users(org_id, lower(username));

-- Login sessions (opaque cookie token -> user).
CREATE TABLE IF NOT EXISTS auth_sessions (
  token       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
