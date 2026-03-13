-- 0018_unit_positions.sql

CREATE TABLE IF NOT EXISTS unit_positions (
  unit_id     TEXT PRIMARY KEY,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  speed       REAL NOT NULL DEFAULT 0,
  heading     REAL NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (unit_id) REFERENCES trucks(id)
);
