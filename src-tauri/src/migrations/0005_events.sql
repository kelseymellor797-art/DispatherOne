-- 0005_events.sql

CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  timestamp     TEXT NOT NULL,

  entity_type   TEXT NOT NULL CHECK (entity_type IN ('CALL','DRIVER')),
  entity_id     TEXT NOT NULL,

  event_type    TEXT NOT NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_entity
  ON events(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_events_timestamp
  ON events(timestamp);

CREATE INDEX IF NOT EXISTS idx_events_event_type
  ON events(event_type);

