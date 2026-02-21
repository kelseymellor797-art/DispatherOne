-- 0014_call_driver_distance_cache.sql

CREATE TABLE IF NOT EXISTS call_driver_distance_cache (
  call_id TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  distance_miles REAL NOT NULL,
  duration_minutes REAL,
  pickup_geocode_at TEXT NOT NULL,
  driver_loc_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (call_id, driver_id),
  FOREIGN KEY (call_id) REFERENCES calls(id),
  FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

CREATE INDEX IF NOT EXISTS idx_call_driver_distance_cache_updated
  ON call_driver_distance_cache(updated_at);
