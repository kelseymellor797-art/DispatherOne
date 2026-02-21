use tauri::State;

use crate::db::DbState;
use crate::db::geocode_repo;
use crate::google_maps::{self, DistanceMatrixResult, GeocodeValidationResult};

#[tauri::command]
pub async fn google_geocode_validate(address: String) -> Result<GeocodeValidationResult, String> {
    google_maps::geocode_validate(&address)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn google_geocode_validate_store(
    db: State<'_, DbState>,
    address: String,
) -> Result<GeocodeValidationResult, String> {
    let result = google_maps::geocode_validate(&address)
        .await
        .map_err(|e| e.to_string())?;
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    geocode_repo::store_geocode_result(
        &conn,
        &address,
        &result.formatted_address,
        result.lat,
        result.lng,
        "GOOGLE",
    )
    .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn google_distance_matrix(
    _db: State<'_, DbState>,
    origin: String,
    destination: String,
    origin_lat: Option<f64>,
    origin_lng: Option<f64>,
    destination_lat: Option<f64>,
    destination_lng: Option<f64>,
) -> Result<DistanceMatrixResult, String> {
    let cache_key = if let (Some(olat), Some(olng), Some(dlat), Some(dlng)) = (
        origin_lat,
        origin_lng,
        destination_lat,
        destination_lng,
    ) {
        Some(format!("{:.6},{:.6}|{:.6},{:.6}", olat, olng, dlat, dlng))
    } else {
        None
    };

    google_maps::distance_matrix(&origin, &destination, cache_key)
        .await
        .map_err(|e| e.to_string())
}
