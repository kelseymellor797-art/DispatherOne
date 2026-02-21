-- 0009_driver_truck_assignments.sql

CREATE TABLE IF NOT EXISTS driver_truck_assignments (
  id         TEXT PRIMARY KEY,
  driver_id  TEXT NOT NULL,
  truck_id   TEXT NOT NULL,

  start_time TEXT NOT NULL,
  end_time   TEXT,

  note       TEXT,
  created_at TEXT NOT NULL,

  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dta_driver
  ON driver_truck_assignments(driver_id);

CREATE INDEX IF NOT EXISTS idx_dta_truck
  ON driver_truck_assignments(truck_id);

CREATE INDEX IF NOT EXISTS idx_dta_driver_endtime
  ON driver_truck_assignments(driver_id, end_time);

