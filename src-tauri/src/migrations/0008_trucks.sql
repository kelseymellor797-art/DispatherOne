-- 0008_trucks.sql

CREATE TABLE IF NOT EXISTS trucks (
  id          TEXT PRIMARY KEY,
  truck_number TEXT NOT NULL CHECK (length(trim(truck_number)) > 0),

  truck_type  TEXT,
  notes       TEXT,

  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_trucks_truck_number
  ON trucks(truck_number);

CREATE INDEX IF NOT EXISTS idx_trucks_is_active
  ON trucks(is_active);

