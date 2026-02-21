use anyhow::{Context, Result};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::models::driver::{DriverDetail, DriverRecord, DriverTruckInfo};
use crate::models::shift::DriverShiftRecord;

fn now() -> String {
    Local::now().to_rfc3339()
}

fn uuid() -> String {
    Uuid::new_v4().to_string()
}

fn event_append_driver(
    conn: &Connection,
    driver_id: &str,
    event_type: &str,
    metadata_json: Option<String>,
) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO events (id, timestamp, entity_type, entity_id, event_type, metadata_json)
        VALUES (?1, ?2, 'DRIVER', ?3, ?4, ?5)
        "#,
        params![uuid(), now(), driver_id, event_type, metadata_json],
    )?;
    Ok(())
}

pub fn driver_list_active(conn: &Connection) -> Result<Vec<DriverRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          id,
          display_name,
          availability_status,
          availability_updated_at,
          phone,
          capabilities,
          notes,
          last_location,
          last_location_updated_at,
          is_active,
          created_at,
          updated_at
        FROM drivers
        WHERE is_active = 1
        ORDER BY display_name ASC
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(DriverRecord {
            id: row.get(0)?,
            display_name: row.get(1)?,
            availability_status: row.get(2)?,
            availability_updated_at: row.get(3)?,
            phone: row.get(4)?,
            capabilities: row.get(5)?,
            notes: row.get(6)?,
            last_location: row.get(7)?,
            last_location_updated_at: row.get(8)?,
            is_active: row.get::<_, i64>(9)? != 0,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    })?;

    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn driver_list_archived(conn: &Connection) -> Result<Vec<DriverRecord>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          id,
          display_name,
          availability_status,
          availability_updated_at,
          phone,
          capabilities,
          notes,
          last_location,
          last_location_updated_at,
          is_active,
          created_at,
          updated_at
        FROM drivers
        WHERE is_active = 0
        ORDER BY display_name ASC
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(DriverRecord {
            id: row.get(0)?,
            display_name: row.get(1)?,
            availability_status: row.get(2)?,
            availability_updated_at: row.get(3)?,
            phone: row.get(4)?,
            capabilities: row.get(5)?,
            notes: row.get(6)?,
            last_location: row.get(7)?,
            last_location_updated_at: row.get(8)?,
            is_active: row.get::<_, i64>(9)? != 0,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    })?;

    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn driver_create(conn: &Connection, display_name: &str) -> Result<String> {
    let id = uuid();
    let ts = now();

    conn.execute(
        r#"
        INSERT INTO drivers (
          id,
          display_name,
          is_active,
          availability_status,
          availability_updated_at,
          phone,
          capabilities,
          notes,
          created_at,
          updated_at
        ) VALUES (?1, ?2, 1, 'AVAILABLE', ?3, NULL, NULL, NULL, ?4, ?5)
        "#,
        params![id, display_name.trim(), ts, ts, ts],
    )
    .context("insert driver failed")?;

    Ok(id)
}

pub fn driver_archive(conn: &Connection, driver_id: &str) -> Result<()> {
    let ts = now();
    conn.execute(
        r#"
        UPDATE drivers
        SET is_active = 0, updated_at = ?1
        WHERE id = ?2
        "#,
        params![ts, driver_id],
    )
    .context("archive driver failed")?;
    Ok(())
}

pub fn driver_restore(conn: &Connection, driver_id: &str) -> Result<()> {
    let ts = now();
    conn.execute(
        r#"
        UPDATE drivers
        SET is_active = 1, updated_at = ?1
        WHERE id = ?2
        "#,
        params![ts, driver_id],
    )
    .context("restore driver failed")?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct DriverUpdate {
    pub display_name: Option<String>,
    pub availability_status: Option<String>,
    pub phone: Option<String>,
    pub capabilities: Option<String>,
    pub notes: Option<String>,
    pub last_location: Option<String>,
}

pub fn driver_update(conn: &Connection, driver_id: &str, update: DriverUpdate) -> Result<()> {
    let ts = now();

    let current: Option<DriverRecord> = conn
        .query_row(
            r#"
            SELECT
              id,
              display_name,
              availability_status,
              availability_updated_at,
              phone,
              capabilities,
              notes,
              last_location,
              last_location_updated_at,
              is_active,
              created_at,
              updated_at
            FROM drivers
            WHERE id = ?1
            "#,
            [driver_id],
            |row| {
                Ok(DriverRecord {
                    id: row.get(0)?,
                    display_name: row.get(1)?,
                    availability_status: row.get(2)?,
                    availability_updated_at: row.get(3)?,
                    phone: row.get(4)?,
                    capabilities: row.get(5)?,
                    notes: row.get(6)?,
                    last_location: row.get(7)?,
                    last_location_updated_at: row.get(8)?,
                    is_active: row.get::<_, i64>(9)? != 0,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        )
        .optional()?;

    let current = current.ok_or_else(|| anyhow::anyhow!("Driver not found"))?;

    let display_name = update.display_name.unwrap_or(current.display_name.clone());
    let availability_status = update
        .availability_status
        .unwrap_or(current.availability_status.clone());
    let phone = update.phone.or(current.phone);
    let capabilities = update.capabilities.or(current.capabilities);
    let notes = update.notes.or(current.notes);
    let last_location_input = update.last_location.clone();
    let last_location = update.last_location.or(current.last_location.clone());
    let last_location_updated_at = if last_location_input.is_some() {
        Some(ts.clone())
    } else {
        current.last_location_updated_at.clone()
    };

    conn.execute(
        r#"
        UPDATE drivers
        SET display_name = ?1,
            availability_status = ?2,
            availability_updated_at = ?3,
            phone = ?4,
            capabilities = ?5,
            notes = ?6,
            last_location = ?7,
            last_location_updated_at = ?8,
            updated_at = ?9
        WHERE id = ?10
        "#,
        params![
            display_name,
            availability_status,
            ts,
            phone,
            capabilities,
            notes,
            last_location,
            last_location_updated_at,
            ts,
            driver_id
        ],
    )
    .context("update driver failed")?;

    if availability_status != current.availability_status {
        event_append_driver(
            conn,
            driver_id,
            "DRIVER_STATUS_CHANGED",
            Some(format!(
                r#"{{"from":"{}","to":"{}"}}"#,
                current.availability_status, availability_status
            )),
        )?;
    }

    Ok(())
}

pub fn driver_truck_assign(
    conn: &Connection,
    driver_id: &str,
    truck_number: Option<&str>,
) -> Result<()> {
    let ts = now();
    let trimmed = truck_number.map(|value| value.trim()).filter(|value| !value.is_empty());

    let current_truck: Option<(String, String)> = conn
        .query_row(
            r#"
            SELECT t.id, t.truck_number
            FROM driver_truck_assignments dta
            JOIN trucks t ON t.id = dta.truck_id
            WHERE dta.driver_id = ?1
              AND dta.end_time IS NULL
            LIMIT 1
            "#,
            params![driver_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    if trimmed.is_none() {
        if current_truck.is_some() {
            conn.execute(
                r#"
                UPDATE driver_truck_assignments
                SET end_time = ?1
                WHERE driver_id = ?2
                  AND end_time IS NULL
                "#,
                params![ts, driver_id],
            )?;
        }
        return Ok(());
    }

    let desired = trimmed.unwrap();
    if let Some((_, current_number)) = &current_truck {
        if current_number == desired {
            return Ok(());
        }
    }

    conn.execute(
        r#"
        UPDATE driver_truck_assignments
        SET end_time = ?1
        WHERE driver_id = ?2
          AND end_time IS NULL
        "#,
        params![ts, driver_id],
    )?;

    let truck_id: Option<String> = conn
        .query_row(
            "SELECT id FROM trucks WHERE truck_number = ?1",
            params![desired],
            |row| row.get(0),
        )
        .optional()?;

    let resolved_truck_id = if let Some(id) = truck_id {
        id
    } else {
        let new_id = uuid();
        conn.execute(
            r#"
            INSERT INTO trucks (id, truck_number, truck_type, notes, is_active)
            VALUES (?1, ?2, NULL, NULL, 1)
            "#,
            params![new_id, desired],
        )?;
        new_id
    };

    conn.execute(
        r#"
        INSERT INTO driver_truck_assignments (
          id,
          driver_id,
          truck_id,
          start_time,
          end_time,
          note,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?5)
        "#,
        params![uuid(), driver_id, resolved_truck_id, ts, ts],
    )?;

    Ok(())
}

pub fn driver_get(conn: &Connection, driver_id: &str) -> Result<DriverDetail> {
    let driver: DriverRecord = conn.query_row(
        r#"
        SELECT
          id,
          display_name,
          availability_status,
          availability_updated_at,
          phone,
          capabilities,
          notes,
          last_location,
          last_location_updated_at,
          is_active,
          created_at,
          updated_at
        FROM drivers
        WHERE id = ?1
        "#,
        [driver_id],
        |row| {
            Ok(DriverRecord {
                id: row.get(0)?,
                display_name: row.get(1)?,
                availability_status: row.get(2)?,
                availability_updated_at: row.get(3)?,
                phone: row.get(4)?,
                capabilities: row.get(5)?,
                notes: row.get(6)?,
                last_location: row.get(7)?,
                last_location_updated_at: row.get(8)?,
                is_active: row.get::<_, i64>(9)? != 0,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        },
    )?;

    let current_truck: Option<DriverTruckInfo> = conn
        .query_row(
            r#"
            SELECT t.truck_number, dta.start_time
            FROM driver_truck_assignments dta
            JOIN trucks t ON t.id = dta.truck_id
            WHERE dta.driver_id = ?1 AND dta.end_time IS NULL
            "#,
            [driver_id],
            |row| {
                Ok(DriverTruckInfo {
                    truck_number: row.get(0)?,
                    assigned_at: row.get(1)?,
                })
            },
        )
        .optional()?;

    let mut shifts_stmt = conn.prepare(
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
        WHERE driver_id = ?1
          AND is_cancelled = 0
          AND date(shift_start) = date('now','localtime')
        ORDER BY shift_start ASC
        "#,
    )?;

    let today_shifts = shifts_stmt
        .query_map([driver_id], |row| {
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
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(DriverDetail {
        driver,
        current_truck,
        today_shifts,
    })
}
