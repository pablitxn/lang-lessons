-- Additive curriculum partition: all existing sessions retain their English identity.
ALTER TABLE learning_sessions ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','fr'));
CREATE INDEX IF NOT EXISTS learning_sessions_language_reentry ON learning_sessions(user_id,mode,language,id) WHERE status='open';
