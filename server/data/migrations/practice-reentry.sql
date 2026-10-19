-- Remember the selected record for each mode when several legacy sessions exist.
ALTER TABLE learning_sessions ADD COLUMN last_entered_at timestamptz;
UPDATE learning_sessions s SET last_entered_at=p.updated_at FROM learning_active_practice p WHERE p.session_id=s.id;
CREATE INDEX learning_sessions_owner_mode_entered ON learning_sessions(user_id,mode,last_entered_at DESC,started_at DESC,id DESC) WHERE status='open';
