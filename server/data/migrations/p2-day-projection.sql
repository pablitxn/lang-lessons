-- Additive daily-projection fields; legacy rows remain explicitly unattributed.
ALTER TABLE learning_events ADD COLUMN received_at timestamptz;
ALTER TABLE learning_events ALTER COLUMN received_at SET DEFAULT clock_timestamp();
ALTER TABLE learning_events ADD COLUMN event_payload jsonb;
ALTER TABLE learning_sessions ADD COLUMN started_at timestamptz;
ALTER TABLE learning_sessions ALTER COLUMN started_at SET DEFAULT clock_timestamp();
ALTER TABLE learning_sessions ADD COLUMN closed_at timestamptz;
CREATE INDEX learning_events_received ON learning_events(received_at,session_id,event_id);
CREATE INDEX learning_sessions_owner_started ON learning_sessions(user_id,started_at,id);
