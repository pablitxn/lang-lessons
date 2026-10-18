-- Root registry owns application. Only authenticated internal server observations enter this table.
CREATE TABLE learning_call_observations (
  session_id text NOT NULL REFERENCES learning_sessions(id),
  event_id text NOT NULL,
  segment_id text NOT NULL REFERENCES learning_segments(id),
  epoch integer NOT NULL CHECK (epoch > 0),
  kind text NOT NULL CHECK (kind IN ('connected','never-connected')),
  PRIMARY KEY (session_id,event_id)
);
CREATE INDEX learning_call_observations_segment ON learning_call_observations(session_id,segment_id,epoch);
