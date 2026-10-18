-- Additive migration after p2-auth.sql and p2-learning.sql; registry remains root-owned.
ALTER TABLE learning_users ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);
-- Reject sessions issued before the latest deactivate/reactivate boundary, including racing logins.
ALTER TABLE learning_users ADD COLUMN auth_valid_after timestamptz;
