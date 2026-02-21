use rusqlite::{params, Connection};

use crate::models::search::{SearchCallHit, SearchDriverHit, SearchResults};

pub fn search(conn: &Connection, query: &str, limit: i32) -> rusqlite::Result<SearchResults> {
    let pattern = format!("%{}%", query.trim());

    let mut drivers_stmt = conn.prepare(
        r#"
        SELECT
          id,
          display_name,
          availability_status,
          phone,
          is_active
        FROM drivers
        WHERE
          display_name LIKE ?1
          OR phone LIKE ?1
          OR capabilities LIKE ?1
          OR notes LIKE ?1
        ORDER BY display_name ASC
        LIMIT ?2
        "#,
    )?;

    let drivers = drivers_stmt
        .query_map(params![pattern, limit], |row| {
            Ok(SearchDriverHit {
                driver_id: row.get(0)?,
                display_name: row.get(1)?,
                availability_status: row.get(2)?,
                phone: row.get(3)?,
                is_active: row.get::<_, i64>(4)? != 0,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut calls_stmt = conn.prepare(
        r#"
        SELECT
          id,
          external_call_number,
          source_type,
          law_agency,
          pickup_address,
          dropoff_address,
          status,
          status_updated_at
        FROM calls
        WHERE
          external_call_number LIKE ?1
          OR pickup_address LIKE ?1
          OR dropoff_address LIKE ?1
          OR pickup_notes LIKE ?1
          OR notes LIKE ?1
          OR contact_name LIKE ?1
          OR callback_phone LIKE ?1
          OR vehicle_description LIKE ?1
          OR membership_level LIKE ?1
          OR law_agency LIKE ?1
        ORDER BY status_updated_at DESC
        LIMIT ?2
        "#,
    )?;

    let calls = calls_stmt
        .query_map(params![pattern, limit], |row| {
            Ok(SearchCallHit {
                call_id: row.get(0)?,
                external_call_number: row.get(1)?,
                source_type: row.get(2)?,
                law_agency: row.get(3)?,
                pickup_address: row.get(4)?,
                dropoff_address: row.get(5)?,
                status: row.get(6)?,
                status_updated_at: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(SearchResults { drivers, calls })
}
