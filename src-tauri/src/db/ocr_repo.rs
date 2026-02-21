use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().to_rfc3339()
}

fn uuid() -> String {
    Uuid::new_v4().to_string()
}

pub fn ocr_import_create(
    conn: &Connection,
    template_type: &str,
    image_ref: &str,
    raw_text: &str,
    parsed_fields_json: Option<String>,
    confidence_json: Option<String>,
) -> Result<String> {
    let id = uuid();
    conn.execute(
        r#"
        INSERT INTO ocr_imports (
          id,
          template_type,
          image_ref,
          raw_text,
          parsed_fields_json,
          confidence_json,
          created_call_id,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)
        "#,
        params![
            id,
            template_type,
            image_ref,
            raw_text,
            parsed_fields_json,
            confidence_json,
            now()
        ],
    )
    .context("insert ocr_imports failed")?;

    Ok(id)
}

pub fn ocr_import_attach_call(conn: &Connection, import_id: &str, call_id: &str) -> Result<()> {
    conn.execute(
        r#"
        UPDATE ocr_imports
        SET created_call_id = ?1
        WHERE id = ?2
        "#,
        params![call_id, import_id],
    )
    .context("update ocr_imports created_call_id failed")?;
    Ok(())
}
