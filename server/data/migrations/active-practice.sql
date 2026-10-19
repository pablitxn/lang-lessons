-- Historical sessions and their progress remain intact; only this pointer is current.
CREATE UNIQUE INDEX learning_sessions_actor_identity ON learning_sessions(user_id,id);
CREATE TABLE learning_active_practice (
  user_id text PRIMARY KEY REFERENCES learning_users(id),
  session_id text NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (user_id,session_id) REFERENCES learning_sessions(user_id,id)
);
