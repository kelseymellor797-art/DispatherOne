-- 0013_driver_last_location.sql

CREATE TABLE IF NOT EXISTS driver_last_location (
  driver_id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  source TEXT NOT NULL,
  source_call_id TEXT,
  source_address TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

CREATE INDEX IF NOT EXISTS idx_driver_last_location_updated
  ON driver_last_location(updated_at);
