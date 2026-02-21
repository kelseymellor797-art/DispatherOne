use anyhow::{Context, Result};
use rusqlite::{params, Connection};

use crate::models::event::{EventLogFilters, EventLogItem};

pub fn event_log_list(conn: &Connection, filters: EventLogFilters) -> Result<Vec<EventLogItem>> {
    let limit = filters.limit.unwrap_or(500).clamp(1, 5000);
    let search = filters.search.map(|value| value.trim().to_lowercase()).filter(|v| !v.is_empty());
    let search_like = search.as_ref().map(|value| format!("%{}%", value));
    let entity_type = filters.entity_type.filter(|v| !v.is_empty());
    let event_type = filters.event_type.filter(|v| !v.is_empty());

    let mut stmt = conn.prepare(
        r#"
        SELECT
          e.id,
          e.timestamp,
          e.entity_type,
          e.entity_id,
          e.event_type,
          e.metadata_json,
          c.external_call_number,
          c.source_type,
          c.pickup_address,
          d.display_name
        FROM events e
        LEFT JOIN calls c
          ON e.entity_type = 'CALL' AND e.entity_id = c.id
        LEFT JOIN drivers d
          ON e.entity_type = 'DRIVER' AND e.entity_id = d.id
        WHERE
          (?1 IS NULL OR date(e.timestamp) >= date(?1))
          AND (?2 IS NULL OR date(e.timestamp) <= date(?2))
          AND (?3 IS NULL OR e.entity_type = ?3)
          AND (?4 IS NULL OR e.event_type = ?4)
          AND (
            ?5 IS NULL
            OR lower(e.event_type) LIKE ?5
            OR lower(COALESCE(e.metadata_json, '')) LIKE ?5
            OR lower(COALESCE(c.external_call_number, '')) LIKE ?5
            OR lower(COALESCE(c.pickup_address, '')) LIKE ?5
            OR lower(COALESCE(d.display_name, '')) LIKE ?5
          )
        ORDER BY e.timestamp DESC
        LIMIT ?6
        "#,
    )?;

    let rows = stmt.query_map(
        params![
            filters.start_date.as_deref(),
            filters.end_date.as_deref(),
            entity_type.as_deref(),
            event_type.as_deref(),
            search_like.as_deref(),
            limit
        ],
        |row| {
            Ok(EventLogItem {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                event_type: row.get(4)?,
                metadata_json: row.get(5)?,
                call_number: row.get(6)?,
                call_source_type: row.get(7)?,
                call_pickup: row.get(8)?,
                driver_name: row.get(9)?,
            })
        },
    )?;

    Ok(rows.collect::<std::result::Result<Vec<_>, _>>().context("map events failed")?)
}

pub fn event_log_clear(conn: &Connection) -> Result<usize> {
    let affected = conn.execute("DELETE FROM events", [])?;
    Ok(affected)
}

pub fn driver_pause_lunch_map(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          entity_id,
          MAX(timestamp) AS ts
        FROM events
        WHERE entity_type = 'DRIVER'
          AND event_type = 'DRIVER_STATUS_CHANGED'
          AND metadata_json LIKE '%"from":"ON_LUNCH"%'
          AND metadata_json LIKE '%"to":"AVAILABLE"%'
        GROUP BY entity_id
        "#,
    )?;

    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}

pub fn driver_lunch_start_map(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT
          entity_id,
          MAX(timestamp) AS ts
        FROM events
        WHERE entity_type = 'DRIVER'
          AND event_type = 'DRIVER_STATUS_CHANGED'
          AND metadata_json LIKE '%"to":"ON_LUNCH"%'
        GROUP BY entity_id
        "#,
    )?;

    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
}
