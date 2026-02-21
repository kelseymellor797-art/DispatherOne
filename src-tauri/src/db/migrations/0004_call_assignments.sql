-- 0004_call_assignments.sql

CREATE TABLE IF NOT EXISTS call_assignments (
  id              TEXT PRIMARY KEY,
  call_id         TEXT NOT NULL,
  driver_id       TEXT NOT NULL,

  state           TEXT NOT NULL CHECK (state IN ('QUEUED','ACTIVE','ENDED')),
  queue_position  INTEGER,
  manual_sort_key REAL,

  assigned_at     TEXT NOT NULL,
  activated_at    TEXT,
  ended_at        TEXT,

  FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,

  CHECK (
    (state = 'QUEUED' AND queue_position IS NOT NULL)
    OR
    (state <> 'QUEUED' AND queue_position IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_assignments_driver_id
  ON call_assignments(driver_id);

CREATE INDEX IF NOT EXISTS idx_assignments_call_id
  ON call_assignments(call_id);

CREATE INDEX IF NOT EXISTS idx_assignments_driver_state
  ON call_assignments(driver_id, state);

CREATE INDEX IF NOT EXISTS idx_assignments_driver_queuepos
  ON call_assignments(driver_id, queue_position);

CREATE UNIQUE INDEX IF NOT EXISTS ux_current_assignment_per_call
  ON call_assignments(call_id)
  WHERE state IN ('QUEUED','ACTIVE');

CREATE UNIQUE INDEX IF NOT EXISTS ux_one_active_call_per_driver
  ON call_assignments(driver_id)
  WHERE state = 'ACTIVE';

