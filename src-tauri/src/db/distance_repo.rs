use anyhow::Result;

use crate::google_maps;

fn haversine_meters(a: (f64, f64), b: (f64, f64)) -> f64 {
    let (lat1, lon1) = (a.0.to_radians(), a.1.to_radians());
    let (lat2, lon2) = (b.0.to_radians(), b.1.to_radians());
    let dlat = lat2 - lat1;
    let dlon = lon2 - lon1;
    let h = (dlat / 2.0).sin().powi(2)
        + lat1.cos() * lat2.cos() * (dlon / 2.0).sin().powi(2);
    let c = 2.0 * h.sqrt().asin();
    6_371_000.0 * c
}

fn fallback_table(dist_points: &[(f64, f64)], pickup: (f64, f64)) -> Vec<(f64, Option<f64>)> {
    dist_points
        .iter()
        .map(|p| (haversine_meters(*p, pickup), None))
        .collect()
}

pub async fn osrm_table_driver_to_pickup(
    driver_points: &[(f64, f64)],
    pickup: (f64, f64),
) -> Result<Vec<(f64, Option<f64>)>> {
    if driver_points.is_empty() {
        return Ok(vec![]);
    }
    let mut out = Vec::with_capacity(driver_points.len());
    for (lat, lon) in driver_points {
        let origin = format!("{},{}", lat, lon);
        let dest = format!("{},{}", pickup.0, pickup.1);
        let cache_key = Some(format!("{:.6},{:.6}|{:.6},{:.6}", lat, lon, pickup.0, pickup.1));
        let value = match google_maps::distance_matrix(&origin, &dest, cache_key).await {
            Ok(result) => (result.meters, result.seconds),
            Err(_) => (haversine_meters((*lat, *lon), pickup), None),
        };
        out.push(value);
    }
    Ok(out)
}

pub async fn osrm_route_distance_meters(
    from: (f64, f64),
    to: (f64, f64),
) -> Result<f64> {
    let origin = format!("{},{}", from.0, from.1);
    let dest = format!("{},{}", to.0, to.1);
    let cache_key = Some(format!("{:.6},{:.6}|{:.6},{:.6}", from.0, from.1, to.0, to.1));
    let result = google_maps::distance_matrix(&origin, &dest, cache_key).await?;
    Ok(result.meters)
}

pub fn osrm_table_driver_to_pickup_blocking(
    driver_points: &[(f64, f64)],
    pickup: (f64, f64),
) -> Result<Vec<(f64, Option<f64>)>> {
    tauri::async_runtime::block_on(osrm_table_driver_to_pickup(driver_points, pickup))
}
