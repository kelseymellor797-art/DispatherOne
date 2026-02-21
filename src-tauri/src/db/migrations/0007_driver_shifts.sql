-- 0007_driver_shifts.sql

CREATE TABLE IF NOT EXISTS driver_shifts (
  id          TEXT PRIMARY KEY,
  driver_id   TEXT NOT NULL,

  shift_start TEXT NOT NULL,
  lunch_start TEXT NOT NULL,
  lunch_end   TEXT NOT NULL,
  shift_end   TEXT NOT NULL,

  shift_label TEXT,

  is_cancelled INTEGER NOT NULL DEFAULT 0 CHECK (is_cancelled IN (0,1)),

  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,

  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_shifts_driver
  ON driver_shifts(driver_id);

CREATE INDEX IF NOT EXISTS idx_driver_shifts_shift_start
  ON driver_shifts(shift_start);

