-- Canonical broker receipts only: no SDP, audio, transcript, token or credential.
CREATE TABLE learning_broker_receipts (
  segment_id text PRIMARY KEY REFERENCES learning_segments(id),
  session_id text NOT NULL REFERENCES learning_sessions(id),
  user_id text NOT NULL REFERENCES learning_users(id),
  epoch integer NOT NULL CHECK (epoch > 0),
  token_digest text NOT NULL UNIQUE,
  provider_call_id text,
  state text NOT NULL CHECK (state IN ('reserved','created','ended','rejected')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz
);
