-- Migration body only. The integrator owns transaction/registry execution.
-- No raw answer, audio, transcript or evidence-summary columns.
CREATE TABLE learning_users (
  id text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('administrator','professor','student')),
  disabled boolean NOT NULL DEFAULT false
);
CREATE TABLE learning_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES learning_users(id),
  mode text NOT NULL CHECK (mode IN ('verb-image','verb-visible','sentence')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  journal_revision integer NOT NULL DEFAULT 0 CHECK (journal_revision >= 0),
  next_epoch integer NOT NULL DEFAULT 0 CHECK (next_epoch >= 0)
);
CREATE TABLE learning_operations (
  user_id text NOT NULL REFERENCES learning_users(id),
  operation_id text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (user_id, operation_id)
);
CREATE TABLE learning_instances (
  session_id text NOT NULL REFERENCES learning_sessions(id),
  exercise_id text NOT NULL,
  generation integer NOT NULL CHECK (generation >= 0),
  PRIMARY KEY (session_id, exercise_id, generation)
);
CREATE TABLE learning_events (
  session_id text NOT NULL REFERENCES learning_sessions(id),
  event_id text NOT NULL,
  exercise_id text NOT NULL,
  generation integer NOT NULL,
  fingerprint text NOT NULL,
  committed_revision integer NOT NULL CHECK (committed_revision > 0),
  PRIMARY KEY (session_id, event_id),
  UNIQUE (session_id, committed_revision),
  FOREIGN KEY (session_id, exercise_id, generation) REFERENCES learning_instances(session_id, exercise_id, generation)
);
CREATE TABLE learning_attempts (
  session_id text NOT NULL REFERENCES learning_sessions(id),
  attempt_key text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  PRIMARY KEY (session_id, attempt_key)
);
CREATE TABLE learning_segments (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES learning_sessions(id),
  epoch integer NOT NULL CHECK (epoch > 0),
  ended boolean NOT NULL DEFAULT false,
  UNIQUE (session_id, epoch)
);
CREATE UNIQUE INDEX learning_one_active_segment ON learning_segments(session_id) WHERE NOT ended;
CREATE TABLE learning_closes (
  session_id text PRIMARY KEY REFERENCES learning_sessions(id),
  result jsonb NOT NULL
);
CREATE TABLE learning_feedback_jobs (
  id text PRIMARY KEY,
  session_id text NOT NULL UNIQUE REFERENCES learning_sessions(id),
  state text NOT NULL CHECK (state IN ('pending','running','succeeded','failed','insufficient-evidence')),
  claim_token text
);
CREATE TABLE learning_comments (
  session_id text PRIMARY KEY REFERENCES learning_sessions(id),
  text text NOT NULL,
  provenance_version text NOT NULL
);
