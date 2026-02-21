-- 0012_address_geocodes.sql

CREATE TABLE IF NOT EXISTS address_geocodes (
  normalized_address TEXT PRIMARY KEY,
  raw_address TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  provider TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
