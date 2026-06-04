-- SessionVault initial schema (Phase 1 / MVP).
-- Forward-only. See docs/data/data-model.md.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----- Tenancy -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS orgs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'admin',  -- owner|admin|host|reviewer|viewer
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- Templates (Session Builder output) --------------------------------
-- A template owns an ordered flow of steps plus flow-level anchors/timer.
CREATE TABLE IF NOT EXISTS templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  version      INT  NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'draft',   -- draft|published|archived
  -- flow_config: { recordingStart, timerStart, timerMode, totalTimerSeconds,
  --                endTriggers[], navigation:'linear' }
  flow_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_templates_project ON templates(project_id);

CREATE TABLE IF NOT EXISTS template_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  ordinal      INT  NOT NULL,
  type         TEXT NOT NULL,   -- welcome|consent|preflight|task|finish
  title        TEXT NOT NULL DEFAULT '',
  body_md      TEXT NOT NULL DEFAULT '',
  required     BOOLEAN NOT NULL DEFAULT true,
  -- config: per-step capture overrides, preflight requirements, etc.
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (template_id, ordinal)
);

-- ----- Sessions (issued instances) ---------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id        UUID NOT NULL REFERENCES templates(id),
  -- Resolved flow snapshot at issue time (immutability).
  flow_snapshot      JSONB NOT NULL,
  participant_name   TEXT,
  participant_email  TEXT,
  status             TEXT NOT NULL DEFAULT 'issued',
  -- issued|started|recording|finalizing|complete|incomplete|corrupt|expired|force_ended
  current_step       INT,
  recording_started_at TIMESTAMPTZ,
  timer_started_at     TIMESTAMPTZ,
  started_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  end_reason         TEXT,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- ----- Participant link tokens -------------------------------------------
CREATE TABLE IF NOT EXISTS session_tokens (
  token        TEXT PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  max_uses     INT NOT NULL DEFAULT 1,
  uses         INT NOT NULL DEFAULT 0,
  consume_on   TEXT NOT NULL DEFAULT 'complete',  -- start|complete
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tokens_session ON session_tokens(session_id);

-- ----- Artifacts & segment ledger ----------------------------------------
CREATE TABLE IF NOT EXISTS artifacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  track        TEXT NOT NULL,   -- screen|webcam|mic|events
  storage_key  TEXT NOT NULL,
  bytes        BIGINT,
  duration_ms  BIGINT,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending|uploaded|verified|missing
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);

CREATE TABLE IF NOT EXISTS segments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  track        TEXT NOT NULL,
  seq          INT  NOT NULL,
  storage_key  TEXT NOT NULL,
  bytes        BIGINT,
  start_ms     BIGINT,
  duration_ms  BIGINT,
  sha256       TEXT,
  uploaded     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, track, seq)
);

-- ----- Session events (timeline) -----------------------------------------
CREATE TABLE IF NOT EXISTS session_events (
  id           BIGSERIAL PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  at_ms        BIGINT NOT NULL,   -- offset from session clock
  type         TEXT NOT NULL,     -- step_enter|recording_start|timer_start|camera_off|share_stopped|tab_hidden|...
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id, at_ms);

-- ----- Reviewer annotations ----------------------------------------------
CREATE TABLE IF NOT EXISTS annotations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES users(id),
  at_ms        BIGINT NOT NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_annotations_session ON annotations(session_id, at_ms);
