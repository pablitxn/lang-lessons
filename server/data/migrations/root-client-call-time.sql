-- Explicitly orientative browser observations, never trusted tutor intervals.
CREATE TABLE learning_client_call_time (
  segment_id text PRIMARY KEY REFERENCES learning_segments(id),
  session_id text NOT NULL REFERENCES learning_sessions(id),
  epoch integer NOT NULL,
  intervals jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
