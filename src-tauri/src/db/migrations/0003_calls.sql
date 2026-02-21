-- 0003_calls.sql

CREATE TABLE IF NOT EXISTS calls (
  id                  TEXT PRIMARY KEY,

  external_call_number TEXT,

  source_type         TEXT NOT NULL CHECK (
    source_type IN ('AAA','AAA_RAP','PPI','COD','LAW_ENFORCEMENT')
  ),

  law_agency          TEXT CHECK (
    law_agency IN ('SHERIFF','CVPD','CHP','SDPD')
  ),

  pickup_address      TEXT NOT NULL CHECK (length(trim(pickup_address)) > 0),
  dropoff_address     TEXT,
  pickup_notes        TEXT,

  contact_name        TEXT,
  callback_phone      TEXT,
  vehicle_description TEXT,
  membership_level    TEXT,

  status              TEXT NOT NULL CHECK (
    status IN ('ACTIVE','PENDING','ASSIGNED','EN_ROUTE','94','95','97','IN_TOW','98')
  ),
  status_updated_at   TEXT NOT NULL,

  created_via         TEXT NOT NULL CHECK (created_via IN ('MANUAL','OCR')),

  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,

  closed_at           TEXT,
  outcome             TEXT CHECK (outcome IN ('COMPLETED','CANCELLED')),

  pricing_category    TEXT NOT NULL CHECK (
    pricing_category IN ('AAA','AAA_RAP','PPI','COD','LAW_ENFORCEMENT')
  ),
  pricing_total       REAL,
  pricing_notes       TEXT,

  CHECK (
    (source_type = 'LAW_ENFORCEMENT' AND law_agency IS NOT NULL)
    OR
    (source_type <> 'LAW_ENFORCEMENT' AND law_agency IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_calls_external_call_number
  ON calls(external_call_number);

CREATE INDEX IF NOT EXISTS idx_calls_status
  ON calls(status);

CREATE INDEX IF NOT EXISTS idx_calls_source_type
  ON calls(source_type);

CREATE INDEX IF NOT EXISTS idx_calls_law_agency
  ON calls(law_agency);

CREATE INDEX IF NOT EXISTS idx_calls_status_updated_at
  ON calls(status_updated_at);

CREATE INDEX IF NOT EXISTS idx_calls_created_at
  ON calls(created_at);

CREATE INDEX IF NOT EXISTS idx_calls_closed_at
  ON calls(closed_at);

