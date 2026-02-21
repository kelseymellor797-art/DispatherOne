use anyhow::{anyhow, Result};
use rusqlite::{params, Connection};
use serde::Serialize;

use crate::db::distance_repo;
use crate::db::geocode_repo;

fn now() -> String {
    chrono::Local::now().to_rfc3339()
}

#[derive(Debug, Clone, Serialize)]
pub struct NearbyDriver {
    pub driver_id: String,
    pub display_name: String,
    pub truck_number: Option<String>,
    pub availability_status: String,
    pub active_call_status: Option<String>,
    pub last_location_text: Option<String>,
    pub distance_miles: Option<f64>,
    pub distance_miles_rounded: Option<f64>,
    pub eta_minutes: Option<f64>,
    pub location_source: Option<String>,
    pub location_updated_at: Option<String>,
}

fn round_to_tenth(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

pub async fn call_nearby_drivers(conn: &Connection, call_id: &str) -> Result<Vec<NearbyDriver>> {
    let (pickup_addr, dropoff_addr): (Option<String>, Option<String>) = conn.query_row(
        "SELECT pickup_address, dropoff_address FROM calls WHERE id=?1 AND outcome IS NULL",
        [call_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    let origin_addr = pickup_addr
        .as_ref()
        .filter(|addr| !addr.trim().is_empty())
        .or_else(|| dropoff_addr.as_ref().filter(|addr| !addr.trim().is_empty()))
        .ok_or_else(|| anyhow!("Pickup address not geocoded"))?;

    let (p_lat, p_lon) = geocode_repo::geocode_address(conn, origin_addr).await?;

    struct Row {
        driver_id: String,
        display_name: String,
        status: String,
        truck_number: Option<String>,
        lat: Option<f64>,
        lon: Option<f64>,
        source: Option<String>,
        updated_at: Option<String>,
        last_location_text: Option<String>,
        last_location_text_updated_at: Option<String>,
        active_call_status: Option<String>,
    }

    let mut stmt = conn.prepare(
        r#"
        SELECT
          d.id,
          d.display_name,
          d.availability_status,
          t.truck_number,
          dll.lat,
          dll.lon,
          dll.source,
          dll.updated_at,
          d.last_location,
          d.last_location_updated_at,
          c.status
        FROM drivers d
        LEFT JOIN driver_truck_assignments dta
          ON dta.driver_id = d.id AND dta.end_time IS NULL
        LEFT JOIN trucks t
          ON t.id = dta.truck_id
        LEFT JOIN driver_last_location dll
          ON dll.driver_id = d.id
        LEFT JOIN call_assignments ca
          ON ca.driver_id = d.id AND ca.state = 'ACTIVE'
        LEFT JOIN calls c
          ON c.id = ca.call_id AND c.outcome IS NULL
        WHERE d.is_active = 1
          AND d.availability_status IN ('AVAILABLE','BUSY','ON_LUNCH')
        "#,
    )?;

    let mut rows: Vec<Row> = vec![];
    let iter = stmt.query_map([], |r| {
        Ok(Row {
            driver_id: r.get(0)?,
            display_name: r.get(1)?,
            status: r.get(2)?,
            truck_number: r.get(3)?,
            lat: r.get(4)?,
            lon: r.get(5)?,
            source: r.get(6)?,
            updated_at: r.get(7)?,
            last_location_text: r.get(8)?,
            last_location_text_updated_at: r.get(9)?,
            active_call_status: r.get(10)?,
        })
    })?;

    for it in iter {
        rows.push(it?);
    }

    if rows.is_empty() {
        return Ok(vec![]);
    }

    let mut out: Vec<NearbyDriver> = Vec::with_capacity(rows.len());
    let ts = now();

    for row in rows.into_iter() {
        let (distance_miles, distance_miles_rounded, eta_minutes, location_source, location_updated_at) =
            if let (Some(lat), Some(lon)) = (row.lat, row.lon) {
                let dist = distance_repo::osrm_table_driver_to_pickup(&[(lat, lon)], (p_lat, p_lon))
                    .await?
                    .get(0)
                    .copied()
                    .ok_or_else(|| anyhow!("Distance index mismatch"))?;
                let (meters, seconds_opt) = dist;
                let miles = meters * 0.000_621_371;
                let eta_minutes = seconds_opt.map(|s| s / 60.0);

                conn.execute(
                    r#"
                    INSERT INTO call_driver_distance_cache (
                      call_id, driver_id, distance_miles, duration_minutes,
                      pickup_geocode_at, driver_loc_at, updated_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                    ON CONFLICT(call_id, driver_id) DO UPDATE SET
                      distance_miles=excluded.distance_miles,
                      duration_minutes=excluded.duration_minutes,
                      pickup_geocode_at=excluded.pickup_geocode_at,
                      driver_loc_at=excluded.driver_loc_at,
                      updated_at=excluded.updated_at
                    "#,
                    params![
                        call_id,
                        row.driver_id,
                        miles,
                        eta_minutes,
                        ts,
                        row.updated_at,
                        ts
                    ],
                )?;
                (
                    Some(miles),
                    Some(round_to_tenth(miles)),
                    eta_minutes,
                    row.source,
                    row.updated_at,
                )
            } else if let Some(loc_text) = row.last_location_text.as_ref().filter(|s| !s.trim().is_empty()) {
                match geocode_repo::geocode_address_with_bias(conn, loc_text, Some((p_lat, p_lon))).await {
                    Ok((lat, lon)) => {
                        let dist = distance_repo::osrm_table_driver_to_pickup(&[(lat, lon)], (p_lat, p_lon))
                            .await?
                            .get(0)
                            .copied()
                            .ok_or_else(|| anyhow!("Distance index mismatch"))?;
                        let (meters, seconds_opt) = dist;
                        let miles = meters * 0.000_621_371;
                        let eta_minutes = seconds_opt.map(|s| s / 60.0);

                        conn.execute(
                            r#"
                            INSERT INTO call_driver_distance_cache (
                              call_id, driver_id, distance_miles, duration_minutes,
                              pickup_geocode_at, driver_loc_at, updated_at
                            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                            ON CONFLICT(call_id, driver_id) DO UPDATE SET
                              distance_miles=excluded.distance_miles,
                              duration_minutes=excluded.duration_minutes,
                              pickup_geocode_at=excluded.pickup_geocode_at,
                              driver_loc_at=excluded.driver_loc_at,
                              updated_at=excluded.updated_at
                            "#,
                            params![
                                call_id,
                                row.driver_id,
                                miles,
                                eta_minutes,
                                ts,
                                row.last_location_text_updated_at,
                                ts
                            ],
                        )?;
                        (
                            Some(miles),
                            Some(round_to_tenth(miles)),
                            eta_minutes,
                            Some("DRIVER_LAST_LOCATION".to_string()),
                            row.last_location_text_updated_at,
                        )
                    }
                    Err(_) => (
                        None,
                        None,
                        None,
                        Some("DRIVER_LAST_LOCATION".to_string()),
                        row.last_location_text_updated_at,
                    ),
                }
            } else {
                (None, None, None, None, None)
            };

        out.push(NearbyDriver {
            driver_id: row.driver_id,
            display_name: row.display_name,
            truck_number: row.truck_number,
            availability_status: row.status,
            active_call_status: row.active_call_status,
            last_location_text: row.last_location_text,
            distance_miles,
            distance_miles_rounded,
            eta_minutes,
            location_source,
            location_updated_at,
        });
    }

    fn status_rank(status: &str) -> i32 {
        match status {
            "AVAILABLE" => 0,
            "ON_LUNCH" => 1,
            "BUSY" => 2,
            _ => 3,
        }
    }

    out.sort_by(|a, b| {
        let rank_a = status_rank(&a.availability_status);
        let rank_b = status_rank(&b.availability_status);
        rank_a
            .cmp(&rank_b)
            .then_with(|| {
                a.distance_miles
                    .partial_cmp(&b.distance_miles)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    Ok(out)
}

pub fn update_driver_last_location_from_call(
    conn: &Connection,
    driver_id: &str,
    call_id: &str,
    source: &str,
) -> Result<()> {
    let dropoff: Option<String> = conn.query_row(
        "SELECT dropoff_address FROM calls WHERE id=?1",
        [call_id],
        |r| r.get(0),
    )?;

    let Some(dropoff_addr) = dropoff else {
        return Ok(());
    };

    let (lat, lon) = geocode_repo::geocode_address_blocking(conn, &dropoff_addr)?;
    let ts = now();

    conn.execute(
        r#"
        INSERT INTO driver_last_location (
          driver_id, lat, lon, source, source_call_id, source_address, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(driver_id) DO UPDATE SET
          lat=excluded.lat,
          lon=excluded.lon,
          source=excluded.source,
          source_call_id=excluded.source_call_id,
          source_address=excluded.source_address,
          updated_at=excluded.updated_at
        "#,
        params![driver_id, lat, lon, source, call_id, dropoff_addr, ts],
    )?;

    Ok(())
}
