use crate::models::dashboard::{
    CallSummary, CurrentTruck, DashboardSettings, DashboardSnapshot, DriverDashboardItem,
};
use rusqlite::Connection;
use std::collections::HashMap;

pub fn dashboard_get(conn: &Connection) -> rusqlite::Result<DashboardSnapshot> {
    let mut drivers_stmt = conn.prepare(
        r#"
        SELECT
          d.id,
          d.display_name,
          d.is_active,
          d.availability_status,
          d.availability_updated_at,
          d.phone,
          d.capabilities,
          d.notes,
          d.last_location,
          d.last_location_updated_at,
          d.created_at,
          d.updated_at,
          MIN(s.shift_start) AS today_shift_start
        FROM drivers d
        LEFT JOIN driver_shifts s
          ON s.driver_id = d.id
         AND s.is_cancelled = 0
         AND date(s.shift_start) = date('now','localtime')
        WHERE d.is_active = 1
        GROUP BY d.id
        ORDER BY
          CASE WHEN today_shift_start IS NULL THEN 1 ELSE 0 END,
          today_shift_start ASC,
          d.display_name ASC
        "#,
    )?;

    let driver_rows = drivers_stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, Option<String>>(12)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut current_trucks: HashMap<String, CurrentTruck> = HashMap::new();
    let mut truck_stmt = conn.prepare(
        r#"
        SELECT
          dta.driver_id,
          t.truck_number,
          dta.start_time
        FROM driver_truck_assignments dta
        JOIN trucks t ON t.id = dta.truck_id
        WHERE dta.end_time IS NULL
        "#,
    )?;
    let truck_rows = truck_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in truck_rows {
        let (driver_id, truck_number, start_time) = row?;
        let entry = current_trucks.entry(driver_id).or_insert(CurrentTruck {
            truck_number: truck_number.clone(),
            assigned_at: start_time.clone(),
        });
        if entry.assigned_at < start_time {
            entry.truck_number = truck_number;
            entry.assigned_at = start_time;
        }
    }

    let mut active_calls: HashMap<String, CallSummary> = HashMap::new();
    let mut active_stmt = conn.prepare(
        r#"
        SELECT
          ca.driver_id,
          c.id,
          c.external_call_number,
          c.source_type,
          c.law_agency,
          c.pickup_address,
          c.dropoff_address,
          c.status,
          c.status_updated_at,
          c.created_at,
          c.membership_level,
          c.contact_id,
          c.callback_phone,
          c.notes,
          c.pricing_total,
          c.pricing_notes
        FROM call_assignments ca
        JOIN calls c ON c.id = ca.call_id
        WHERE ca.state = 'ACTIVE'
          AND c.outcome IS NULL
        "#,
    )?;
    let active_rows = active_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            CallSummary {
                call_id: row.get::<_, String>(1)?,
                external_call_number: row.get::<_, Option<String>>(2)?,
                source_type: row.get::<_, String>(3)?,
                law_agency: row.get::<_, Option<String>>(4)?,
                pickup_address: row.get::<_, String>(5)?,
                dropoff_address: row.get::<_, Option<String>>(6)?,
                status: row.get::<_, String>(7)?,
                status_updated_at: row.get::<_, String>(8)?,
                created_at: row.get::<_, String>(9)?,
                membership_level: row.get::<_, Option<String>>(10)?,
                contact_id: row.get::<_, Option<String>>(11)?,
                callback_phone: row.get::<_, Option<String>>(12)?,
                notes: row.get::<_, Option<String>>(13)?,
                pricing_total: row.get::<_, Option<f64>>(14)?,
                pricing_notes: row.get::<_, Option<String>>(15)?,
            },
        ))
    })?;
    for row in active_rows {
        let (driver_id, call_summary) = row?;
        active_calls.insert(driver_id, call_summary);
    }

    let mut queued_calls: HashMap<String, Vec<CallSummary>> = HashMap::new();
    let mut queued_stmt = conn.prepare(
        r#"
        SELECT
          ca.driver_id,
          ca.queue_position,
          ca.manual_sort_key,

          c.id,
          c.external_call_number,
          c.source_type,
          c.law_agency,
          c.pickup_address,
          c.dropoff_address,
          c.status,
          c.status_updated_at,
          c.created_at,
          c.membership_level,
          c.contact_id,
          c.callback_phone,
          c.notes,
          c.pricing_total,
          c.pricing_notes
        FROM call_assignments ca
        JOIN calls c ON c.id = ca.call_id
        WHERE ca.state = 'QUEUED'
          AND c.outcome IS NULL
        ORDER BY
          ca.driver_id,
          CASE WHEN ca.manual_sort_key IS NULL THEN 1 ELSE 0 END,
          ca.manual_sort_key ASC,
          ca.queue_position ASC
        "#,
    )?;
    let queued_rows = queued_stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            CallSummary {
                call_id: row.get::<_, String>(3)?,
                external_call_number: row.get::<_, Option<String>>(4)?,
                source_type: row.get::<_, String>(5)?,
                law_agency: row.get::<_, Option<String>>(6)?,
                pickup_address: row.get::<_, String>(7)?,
                dropoff_address: row.get::<_, Option<String>>(8)?,
                status: row.get::<_, String>(9)?,
                status_updated_at: row.get::<_, String>(10)?,
                created_at: row.get::<_, String>(11)?,
                membership_level: row.get::<_, Option<String>>(12)?,
                contact_id: row.get::<_, Option<String>>(13)?,
                callback_phone: row.get::<_, Option<String>>(14)?,
                notes: row.get::<_, Option<String>>(15)?,
                pricing_total: row.get::<_, Option<f64>>(16)?,
                pricing_notes: row.get::<_, Option<String>>(17)?,
            },
        ))
    })?;
    for row in queued_rows {
        let (driver_id, call_summary) = row?;
        queued_calls
            .entry(driver_id)
            .or_default()
            .push(call_summary);
    }

    let mut unassigned_stmt = conn.prepare(
        r#"
        SELECT
          c.id,
          c.external_call_number,
          c.source_type,
          c.law_agency,
          c.pickup_address,
          c.dropoff_address,
          c.status,
          c.status_updated_at,
          c.created_at,
          c.membership_level,
          c.contact_id,
          c.callback_phone,
          c.notes,
          c.pricing_total,
          c.pricing_notes
        FROM calls c
        LEFT JOIN call_assignments ca
          ON ca.call_id = c.id
         AND ca.state IN ('QUEUED','ACTIVE')
        WHERE ca.call_id IS NULL
          AND c.outcome IS NULL
        ORDER BY
          CASE
            WHEN c.source_type = 'LAW_ENFORCEMENT' THEN 1
            WHEN c.source_type IN ('AAA','AAA_RAP') THEN 2
            ELSE 3
          END,
          c.status_updated_at ASC
        "#,
    )?;
    let unassigned_calls = unassigned_stmt
        .query_map([], |row| {
            Ok(CallSummary {
                call_id: row.get::<_, String>(0)?,
                external_call_number: row.get::<_, Option<String>>(1)?,
                source_type: row.get::<_, String>(2)?,
                law_agency: row.get::<_, Option<String>>(3)?,
                pickup_address: row.get::<_, String>(4)?,
                dropoff_address: row.get::<_, Option<String>>(5)?,
                status: row.get::<_, String>(6)?,
                status_updated_at: row.get::<_, String>(7)?,
                created_at: row.get::<_, String>(8)?,
                membership_level: row.get::<_, Option<String>>(9)?,
                contact_id: row.get::<_, Option<String>>(10)?,
                callback_phone: row.get::<_, Option<String>>(11)?,
                notes: row.get::<_, Option<String>>(12)?,
                pricing_total: row.get::<_, Option<f64>>(13)?,
                pricing_notes: row.get::<_, Option<String>>(14)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let settings = load_dashboard_settings(conn)?;

    let drivers = driver_rows
        .into_iter()
        .map(
            |(
                id,
                display_name,
                _is_active,
                availability_status,
                availability_updated_at,
                phone,
                capabilities,
                notes,
                last_location,
                last_location_updated_at,
                created_at,
                updated_at,
                today_shift_start,
            )| {
                DriverDashboardItem {
                    driver_id: id.clone(),
                    display_name,
                    availability_status,
                    availability_updated_at,
                    phone,
                    capabilities,
                    notes,
                    last_location,
                    last_location_updated_at,
                    created_at,
                    updated_at,
                    today_shift_start,
                    current_truck: current_trucks.get(&id).cloned(),
                    active_call: active_calls.get(&id).cloned(),
                    pending_queue: queued_calls.remove(&id).unwrap_or_default(),
                }
            },
        )
        .collect();

    Ok(DashboardSnapshot {
        drivers,
        unassigned_calls,
        settings,
    })
}

fn load_dashboard_settings(conn: &Connection) -> rusqlite::Result<DashboardSettings> {
    let mut settings = DashboardSettings::default();

    let mut stmt = conn.prepare(
        r#"
        SELECT key, value
        FROM settings_kv
        WHERE key IN ('ui.width_percent','ui.dock_side','ui.always_on_top','alerts.interval_minutes')
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    for row in rows {
        let (key, value) = row?;
        match key.as_str() {
            "ui.width_percent" => {
                settings.width_percent = value.parse::<i32>().ok();
            }
            "ui.dock_side" => {
                settings.dock_side = Some(value);
            }
            "ui.always_on_top" => {
                settings.always_on_top = value.parse::<i32>().ok().map(|v| v != 0);
                if settings.always_on_top.is_none() {
                    settings.always_on_top = value.parse::<bool>().ok();
                }
            }
            "alerts.interval_minutes" => {
                settings.alerts_interval_minutes = value.parse::<i32>().ok();
            }
            _ => {}
        }
    }

    Ok(settings)
}
