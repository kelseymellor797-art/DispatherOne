use anyhow::Result;
use chrono::Local;
use rusqlite::{params, Connection};

use crate::models::unit::UnitPosition;

fn now() -> String {
    Local::now().to_rfc3339()
}

pub fn unit_list(conn: &Connection) -> Result<Vec<UnitPosition>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          t.id,
          t.truck_number,
          COALESCE(up.lat, 0) AS lat,
          COALESCE(up.lng, 0) AS lng,
          COALESCE(up.speed, 0) AS speed,
          COALESCE(up.heading, 0) AS heading,
          COALESCE(up.updated_at, '') AS updated_at
        FROM trucks t
        LEFT JOIN unit_positions up ON up.unit_id = t.id
        WHERE t.is_active = 1
        ORDER BY t.truck_number ASC
        "#,
    )?;

    let rows = stmt
        .query_map([], |row| {
            Ok(UnitPosition {
                unit_id: row.get(0)?,
                truck_number: row.get(1)?,
                lat: row.get(2)?,
                lng: row.get(3)?,
                speed: row.get(4)?,
                heading: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    Ok(rows)
}

pub fn unit_position_set(
    conn: &Connection,
    unit_id: &str,
    lat: f64,
    lng: f64,
    speed: f64,
    heading: f64,
) -> Result<()> {
    let ts = now();
    conn.execute(
        r#"
        INSERT INTO unit_positions (unit_id, lat, lng, speed, heading, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(unit_id) DO UPDATE SET
          lat = excluded.lat,
          lng = excluded.lng,
          speed = excluded.speed,
          heading = excluded.heading,
          updated_at = excluded.updated_at
        "#,
        params![unit_id, lat, lng, speed, heading, ts],
    )?;
    Ok(())
}
