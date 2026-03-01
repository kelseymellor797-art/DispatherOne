use anyhow::Result;
use rusqlite::{params, Connection};

use crate::models::report::{CallHistoryItem, DriverCallReportItem};

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

pub fn call_history_list(
    conn: &Connection,
    start_date: &str,
    end_date: &str,
    law_agency: Option<&str>,
) -> Result<Vec<CallHistoryItem>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          c.id,
          c.external_call_number,
          c.source_type,
          c.law_agency,
          c.pickup_address,
          c.dropoff_address,
          c.vehicle_description,
          c.notes,
          (SELECT d.display_name
           FROM call_assignments ca2
           JOIN drivers d ON d.id = ca2.driver_id
           WHERE ca2.call_id = c.id
           ORDER BY COALESCE(ca2.ended_at, ca2.activated_at, ca2.assigned_at) DESC
           LIMIT 1) AS driver_name,
          c.outcome,
          c.closed_at,
          c.created_at
        FROM calls c
        WHERE c.outcome IS NOT NULL
          AND (
            (c.closed_at IS NOT NULL AND date(c.closed_at) BETWEEN date(?1) AND date(?2))
            OR (c.closed_at IS NULL AND date(c.created_at) BETWEEN date(?1) AND date(?2))
          )
          AND (?3 IS NULL OR c.law_agency = ?3)
        ORDER BY COALESCE(c.closed_at, c.created_at) DESC
        "#,
    )?;

    let rows = stmt.query_map(params![start_date, end_date, law_agency], |row| {
        Ok(CallHistoryItem {
            call_id: row.get(0)?,
            external_call_number: row.get(1)?,
            source_type: row.get(2)?,
            law_agency: row.get(3)?,
            pickup_address: row.get(4)?,
            dropoff_address: row.get(5)?,
            vehicle_description: row.get(6)?,
            notes: row.get(7)?,
            driver_name: row.get(8)?,
            outcome: row.get(9)?,
            closed_at: row.get(10)?,
            created_at: row.get(11)?,
        })
    })?;

    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn call_history_clear(
    conn: &mut Connection,
    start_date: &str,
    end_date: &str,
    law_agency: Option<&str>,
) -> Result<usize> {
    let tx = conn.transaction()?;

    // Collect IDs of completed calls matching the criteria
    let ids: Vec<String> = {
        let mut stmt = tx.prepare(
            r#"
            SELECT id FROM calls
            WHERE outcome IS NOT NULL
              AND (
                (closed_at IS NOT NULL AND date(closed_at) BETWEEN date(?1) AND date(?2))
                OR (closed_at IS NULL AND date(created_at) BETWEEN date(?1) AND date(?2))
              )
              AND (?3 IS NULL OR law_agency = ?3)
            "#,
        )?;
        let rows = stmt.query_map(params![start_date, end_date, law_agency], |row| {
            row.get::<_, String>(0)
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    let count = ids.len();
    if count > 0 {
        // Build a parameterised IN clause for batch deletion
        let placeholders = ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect::<Vec<_>>()
            .join(", ");
        let id_params: Vec<&dyn rusqlite::types::ToSql> =
            ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();

        tx.execute(
            &format!("DELETE FROM call_assignments WHERE call_id IN ({placeholders})"),
            id_params.as_slice(),
        )?;
        tx.execute(
            &format!(
                "DELETE FROM events WHERE entity_type = 'CALL' AND entity_id IN ({placeholders})"
            ),
            id_params.as_slice(),
        )?;
        tx.execute(
            &format!("DELETE FROM calls WHERE id IN ({placeholders})"),
            id_params.as_slice(),
        )?;
    }

    tx.commit()?;
    Ok(count)
}
