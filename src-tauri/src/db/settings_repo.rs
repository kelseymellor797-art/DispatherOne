use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use std::collections::HashMap;

fn now() -> String {
    chrono::Local::now().to_rfc3339()
}

pub fn settings_set(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO settings_kv (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
          value=excluded.value,
          updated_at=excluded.updated_at
        "#,
        params![key, value, now()],
    )
    .context("settings_set failed")?;
    Ok(())
}

pub fn settings_get(conn: &Connection, keys: &[String]) -> Result<HashMap<String, String>> {
    let mut out = HashMap::new();
    if keys.is_empty() {
        return Ok(out);
    }

    let placeholders = keys.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT key, value FROM settings_kv WHERE key IN ({})", placeholders);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(keys.iter()), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for row in rows {
        let (k, v) = row?;
        out.insert(k, v);
    }

    Ok(out)
}
