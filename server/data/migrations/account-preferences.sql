-- Account-owned preferences are independent of profile fields and authentication settings.
CREATE TABLE learning_user_preferences (
  user_id text PRIMARY KEY REFERENCES learning_users(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
