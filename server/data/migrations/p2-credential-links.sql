-- After p2-auth, p2-learning and p2-admin. Root owns registration.
-- Raw bearer tokens/passwords/URLs are never stored.
CREATE TABLE learning_credential_links (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id text NOT NULL REFERENCES learning_users(id),
  purpose text NOT NULL CHECK (purpose IN ('setup','reset')),
  issued_by text NOT NULL REFERENCES learning_users(id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
