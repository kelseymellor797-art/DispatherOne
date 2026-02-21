-- 0010_rate_rules.sql

CREATE TABLE IF NOT EXISTS rate_rules (
  id              TEXT PRIMARY KEY,

  category        TEXT NOT NULL CHECK (
    category IN ('AAA','AAA_RAP','PPI','COD','LAW_ENFORCEMENT')
  ),

  rule_name       TEXT NOT NULL CHECK (length(trim(rule_name)) > 0),

  amount          REAL NOT NULL,
  unit            TEXT NOT NULL CHECK (length(trim(unit)) > 0),

  conditions_json TEXT,

  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_rules_category
  ON rate_rules(category);

CREATE INDEX IF NOT EXISTS idx_rate_rules_is_active
  ON rate_rules(is_active);

