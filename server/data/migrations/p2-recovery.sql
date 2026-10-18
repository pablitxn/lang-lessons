-- Manual retry uses a separate feedback revision; lifecycle/progress fences are unchanged.
ALTER TABLE learning_feedback_jobs ADD COLUMN retry_revision integer NOT NULL DEFAULT 0 CHECK (retry_revision >= 0);
