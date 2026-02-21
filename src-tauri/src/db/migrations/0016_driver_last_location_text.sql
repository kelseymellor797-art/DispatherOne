-- 0016_driver_last_location_text.sql
ALTER TABLE drivers ADD COLUMN last_location TEXT;
ALTER TABLE drivers ADD COLUMN last_location_updated_at TEXT;
