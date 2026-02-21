-- 0002_drivers.sql

CREATE TABLE IF NOT EXISTS drivers (
  id                     TEXT PRIMARY KEY,
  display_name           TEXT NOT NULL CHECK (length(trim(display_name)) > 0),

  is_active              INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),

  availability_status    TEXT NOT NULL CHECK (
    availability_status IN ('AVAILABLE','ON_LUNCH','BUSY','OFF_SHIFT')
  ),
  availability_updated_at TEXT NOT NULL,

  phone                  TEXT,
  capabilities           TEXT,
  notes                  TEXT,

  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drivers_display_name
  ON drivers(display_name);

CREATE INDEX IF NOT EXISTS idx_drivers_is_active
  ON drivers(is_active);

CREATE INDEX IF NOT EXISTS idx_drivers_availability_status
  ON drivers(availability_status);

