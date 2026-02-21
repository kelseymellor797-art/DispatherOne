use anyhow::{Context, Result};
use chrono::{DateTime, Duration, FixedOffset, Local};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::models::shift::DriverShiftRecord;

fn now() -> String {
    Local::now().to_rfc3339()
}

fn uuid() -> String {
    Uuid::new_v4().to_string()
}

fn parse_ts(value: &str) -> Result<DateTime<FixedOffset>> {
    DateTime::parse_from_rfc3339(value).context("Invalid RFC3339 timestamp")
}

fn compute_default_lunch(shift_start: &str) -> Result<(String, String)> {
    let start = parse_ts(shift_start)?;
    let lunch_start = start + Duration::hours(4);
    let lunch_end = start + Duration::hours(5);
    Ok((lunch_start.to_rfc3339(), lunch_end.to_rfc3339()))
}

#[derive(Debug, Clone)]
pub struct ShiftCreatePayload {
    pub driver_id: String,
    pub shift_start: String,
    pub shift_end: String,
    pub lunch_start: Option<String>,
    pub lunch_end: Option<String>,
    pub shift_label: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ShiftUpdatePayload {
    pub shift_start: String,
    pub shift_end: String,
    pub lunch_start: Option<String>,
    pub lunch_end: Option<String>,
    pub shift_label: Option<String>,
}

pub fn shift_list(conn: &Connection, start_date: &str, end_date: &str) -> Result<Vec<DriverShiftRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          id,
          driver_id,
          shift_start,
          lunch_start,
          lunch_end,
          shift_end,
          shift_label,
          is_cancelled,
          created_at,
          updated_at
        FROM driver_shifts
        WHERE is_cancelled = 0
          AND date(shift_start) BETWEEN date(?1) AND date(?2)
        ORDER BY shift_start ASC
        "#,
    )?;

    let rows = stmt.query_map(params![start_date, end_date], |row| {
        Ok(DriverShiftRecord {
            id: row.get(0)?,
            driver_id: row.get(1)?,
            shift_start: row.get(2)?,
            lunch_start: row.get(3)?,
            lunch_end: row.get(4)?,
            shift_end: row.get(5)?,
            shift_label: row.get(6)?,
            is_cancelled: row.get::<_, i64>(7)? != 0,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?;

    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn shift_create(conn: &Connection, payload: ShiftCreatePayload) -> Result<String> {
    let id = uuid();
    let ts = now();

    let (lunch_start, lunch_end) = match (payload.lunch_start, payload.lunch_end) {
        (Some(start), Some(end)) => (start, end),
        _ => compute_default_lunch(&payload.shift_start)?,
    };

    conn.execute(
        r#"
        INSERT INTO driver_shifts (
          id,
          driver_id,
          shift_start,
          lunch_start,
          lunch_end,
          shift_end,
          shift_label,
          is_cancelled,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9)
        "#,
        params![
            id,
            payload.driver_id,
            payload.shift_start,
            lunch_start,
            lunch_end,
            payload.shift_end,
            payload.shift_label,
            ts,
            ts
        ],
    )
    .context("insert driver shift failed")?;

    Ok(id)
}

pub fn shift_update(conn: &Connection, shift_id: &str, payload: ShiftUpdatePayload) -> Result<()> {
    let ts = now();

    let (lunch_start, lunch_end) = match (payload.lunch_start, payload.lunch_end) {
        (Some(start), Some(end)) => (start, end),
        _ => compute_default_lunch(&payload.shift_start)?,
    };

    conn.execute(
        r#"
        UPDATE driver_shifts
        SET shift_start = ?1,
            lunch_start = ?2,
            lunch_end = ?3,
            shift_end = ?4,
            shift_label = ?5,
            updated_at = ?6
        WHERE id = ?7
        "#,
        params![
            payload.shift_start,
            lunch_start,
            lunch_end,
            payload.shift_end,
            payload.shift_label,
            ts,
            shift_id
        ],
    )
    .context("update driver shift failed")?;

    Ok(())
}

pub fn shift_delete(conn: &Connection, shift_id: &str) -> Result<()> {
    let ts = now();
    conn.execute(
        r#"
        UPDATE driver_shifts
        SET is_cancelled = 1, updated_at = ?1
        WHERE id = ?2
        "#,
        params![ts, shift_id],
    )
    .context("cancel driver shift failed")?;
    Ok(())
}
