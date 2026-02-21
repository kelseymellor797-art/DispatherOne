use anyhow::{Context, Result};
use chrono::Local;
use rusqlite::{Connection, TransactionBehavior};
use std::{collections::HashSet, fs, path::PathBuf};
use tauri::Manager;

pub const DB_FILENAME: &str = "dispatcherone.db";

pub struct DbState {
    pub conn: std::sync::Mutex<Connection>,
    pub db_path: PathBuf,
}

pub fn resolve_db_path(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf)> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("Failed to resolve app_data_dir")?;

    let root_dir = app_data_dir.join("DispatcherOne");
    let backups_dir = root_dir.join("backups");
    let db_path = root_dir.join(DB_FILENAME);

    fs::create_dir_all(&backups_dir)
        .with_context(|| format!("Failed to create app data dirs at {:?}", backups_dir))?;

    Ok((db_path, backups_dir))
}

pub fn open_connection(db_path: &PathBuf) -> Result<Connection> {
    let conn = Connection::open(db_path)
        .with_context(|| format!("Failed to open SQLite DB at {:?}", db_path))?;

    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;

    Ok(conn)
}

fn ensure_init_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version   TEXT PRIMARY KEY,
          filename  TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_meta (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        "#,
    )?;

    let created_at = Local::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO app_meta (key, value) VALUES ('db.created_at', ?1)",
        [created_at],
    )?;

    Ok(())
}

fn migrations() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("0001", "0001_init.sql", include_str!("./migrations/0001_init.sql")),
        ("0002", "0002_drivers.sql", include_str!("./migrations/0002_drivers.sql")),
        ("0003", "0003_calls.sql", include_str!("./migrations/0003_calls.sql")),
        (
            "0004",
            "0004_call_assignments.sql",
            include_str!("./migrations/0004_call_assignments.sql"),
        ),
        ("0005", "0005_events.sql", include_str!("./migrations/0005_events.sql")),
        ("0006", "0006_settings.sql", include_str!("./migrations/0006_settings.sql")),
        (
            "0007",
            "0007_driver_shifts.sql",
            include_str!("./migrations/0007_driver_shifts.sql"),
        ),
        ("0008", "0008_trucks.sql", include_str!("./migrations/0008_trucks.sql")),
        (
            "0009",
            "0009_driver_truck_assignments.sql",
            include_str!("./migrations/0009_driver_truck_assignments.sql"),
        ),
        (
            "0010",
            "0010_rate_rules.sql",
            include_str!("./migrations/0010_rate_rules.sql"),
        ),
        (
            "0011",
            "0011_ocr_imports.sql",
            include_str!("./migrations/0011_ocr_imports.sql"),
        ),
        (
            "0012",
            "0012_address_geocodes.sql",
            include_str!("./migrations/0012_address_geocodes.sql"),
        ),
        (
            "0013",
            "0013_driver_last_location.sql",
            include_str!("./migrations/0013_driver_last_location.sql"),
        ),
        (
            "0014",
            "0014_call_driver_distance_cache.sql",
            include_str!("./migrations/0014_call_driver_distance_cache.sql"),
        ),
        (
            "0015",
            "0015_calls_notes_priority.sql",
            include_str!("./migrations/0015_calls_notes_priority.sql"),
        ),
        (
            "0016",
            "0016_driver_last_location_text.sql",
            include_str!("./migrations/0016_driver_last_location_text.sql"),
        ),
        (
            "0017",
            "0017_contact_id.sql",
            include_str!("./migrations/0017_contact_id.sql"),
        ),
    ]
}

fn pending_migrations(conn: &Connection) -> Result<Vec<(&'static str, &'static str, &'static str)>> {
    ensure_init_tables(conn)?;

    let mut stmt = conn.prepare("SELECT version FROM schema_migrations")?;
    let applied: HashSet<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<_, _>>()?;

    Ok(migrations()
        .into_iter()
        .filter(|(v, _, _)| !applied.contains(&v.to_string()))
        .collect())
}

fn backup_db_if_needed(db_path: &PathBuf, backups_dir: &PathBuf, pending_count: usize) -> Result<()> {
    if pending_count == 0 {
        return Ok(());
    }

    if !db_path.exists() {
        return Ok(());
    }

    let stamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_path = backups_dir.join(format!("dispatcherone_{stamp}.db"));

    fs::copy(db_path, &backup_path)
        .with_context(|| format!("Failed to backup DB to {:?}", backup_path))?;

    Ok(())
}

pub fn run_migrations(conn: &mut Connection, db_path: &PathBuf, backups_dir: &PathBuf) -> Result<()> {
    let pending = pending_migrations(conn)?;
    backup_db_if_needed(db_path, backups_dir, pending.len())?;

    for (version, filename, sql) in pending {
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute_batch(sql)
            .with_context(|| format!("Migration failed: {filename}"))?;

        let applied_at = Local::now().to_rfc3339();
        tx.execute(
            "INSERT INTO schema_migrations (version, filename, applied_at) VALUES (?1, ?2, ?3)",
            (&version, &filename, &applied_at),
        )?;

        tx.commit()
            .with_context(|| format!("Failed to commit migration {filename}"))?;
    }

    Ok(())
}

pub mod assignments_repo;
pub mod admin_repo;
pub mod calls_repo;
pub mod dashboard_repo;
pub mod distance_repo;
pub mod drivers_repo;
pub mod events_repo;
pub mod geocode_repo;
pub mod nearby_repo;
pub mod reports_repo;
pub mod ocr_repo;
pub mod search_repo;
pub mod settings_repo;
pub mod shifts_repo;
