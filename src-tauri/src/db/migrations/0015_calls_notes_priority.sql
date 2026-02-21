-- 0015_calls_notes_priority.sql

ALTER TABLE calls ADD COLUMN notes TEXT;
ALTER TABLE calls ADD COLUMN priority_group TEXT;

CREATE INDEX IF NOT EXISTS idx_calls_priority_group
  ON calls(priority_group);
