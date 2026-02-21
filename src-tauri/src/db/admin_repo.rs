use anyhow::Result;
use rusqlite::Connection;

pub fn reset_app_data(conn: &mut Connection) -> Result<()> {
    let tx = conn.transaction()?;

    tx.execute("DELETE FROM events", [])?;

    tx.execute("DELETE FROM call_driver_distance_cache", [])?;
    tx.execute("DELETE FROM ocr_imports", [])?;

    tx.execute("DELETE FROM calls WHERE outcome IS NULL", [])?;
    tx.execute(
        "DELETE FROM calls WHERE source_type IN ('AAA','AAA_RAP')",
        [],
    )?;

    tx.execute("DELETE FROM driver_last_location", [])?;
    tx.execute("DELETE FROM driver_shifts", [])?;
    tx.execute("DELETE FROM drivers", [])?;

    tx.commit()?;
    Ok(())
}
