-- Server-observed intervals; no client totals/timestamps or raw interaction content.
CREATE TABLE learning_time_streams (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES learning_sessions(id),
  source text NOT NULL CHECK (source IN ('written','tutor')),
  segment_id text REFERENCES learning_segments(id),
  visible boolean NOT NULL DEFAULT false,
  sequence integer NOT NULL DEFAULT 0,
  active_interval_id text,
  last_observed_at timestamptz,
  UNIQUE (session_id,segment_id),
  CHECK ((source='written' AND segment_id IS NULL) OR (source='tutor' AND segment_id IS NOT NULL))
);
CREATE TABLE learning_time_intervals (
  id text PRIMARY KEY,
  stream_id text NOT NULL REFERENCES learning_time_streams(id),
  session_id text NOT NULL REFERENCES learning_sessions(id),
  source text NOT NULL CHECK (source IN ('written','tutor')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX learning_time_intervals_session ON learning_time_intervals(session_id,started_at);
CREATE TABLE learning_time_receipts (
  session_id text NOT NULL REFERENCES learning_sessions(id),
  event_id text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(session_id,event_id)
);
