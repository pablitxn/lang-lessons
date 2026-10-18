-- Append-only timezone configuration; no guessed/backfilled setting for existing students.
CREATE TABLE learning_student_timezones (
  user_id text NOT NULL REFERENCES learning_users(id),
  revision integer NOT NULL CHECK (revision > 0),
  time_zone text NOT NULL,
  effective_at timestamptz NOT NULL,
  PRIMARY KEY (user_id,revision),
  UNIQUE (user_id,effective_at)
);
CREATE TABLE learning_timezone_receipts (
  user_id text NOT NULL REFERENCES learning_users(id),
  operation_id text NOT NULL,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(user_id,operation_id)
);
