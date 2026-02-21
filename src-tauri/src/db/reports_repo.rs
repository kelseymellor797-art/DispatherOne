use anyhow::Result;
use rusqlite::{params, Connection};

use crate::models::report::DriverCallReportItem;

pub fn driver_call_report(conn: &Connection, start_date: &str, end_date: &str) -> Result<Vec<DriverCallReportItem>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          ca.driver_id,
          c.id,
          c.outcome,
          c.closed_at,
          c.source_type,
          c.external_call_number,
          (
            SELECT MAX(e.timestamp)
            FROM events e
            WHERE e.entity_type = 'CALL'
              AND e.entity_id = c.id
              AND e.event_type = 'CALL_STATUS_CHANGED'
              AND e.metadata_json LIKE '%"to":"EN_ROUTE"%'
          ) AS en_route_at
        FROM calls c
        JOIN call_assignments ca ON ca.call_id = c.id
        WHERE ca.state = 'ENDED'
          AND ca.ended_at = (
            SELECT MAX(ended_at)
            FROM call_assignments
            WHERE call_id = c.id
          )
          AND c.outcome IS NOT NULL
          AND date(c.closed_at) BETWEEN date(?1) AND date(?2)
        ORDER BY c.closed_at DESC
        "#,
    )?;

    let rows = stmt.query_map(params![start_date, end_date], |row| {
        Ok(DriverCallReportItem {
            driver_id: row.get(0)?,
            call_id: row.get(1)?,
            outcome: row.get(2)?,
            closed_at: row.get(3)?,
            source_type: row.get(4)?,
            external_call_number: row.get(5)?,
            en_route_at: row.get(6)?,
        })
    })?;

    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
