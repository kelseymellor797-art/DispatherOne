-- 0011_ocr_imports.sql

CREATE TABLE IF NOT EXISTS ocr_imports (
  id                TEXT PRIMARY KEY,

  template_type      TEXT NOT NULL CHECK (
    template_type IN ('ACE_PICKUP','ACE_DROPOFF')
  ),

  image_ref          TEXT NOT NULL,
  raw_text           TEXT NOT NULL,

  parsed_fields_json TEXT,
  confidence_json    TEXT,

  created_call_id    TEXT,
  created_at         TEXT NOT NULL,

  FOREIGN KEY (created_call_id) REFERENCES calls(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ocr_imports_template_type
  ON ocr_imports(template_type);

CREATE INDEX IF NOT EXISTS idx_ocr_imports_created_call_id
  ON ocr_imports(created_call_id);

