use tauri::State;

use crate::db::calls_repo::{self, CallCreatePayload, CallUpdatePayload};
use crate::models::aaa::AaaMemberCall;
use crate::db::{distance_repo, geocode_repo, open_connection};
use crate::models::call::CallDetail;
use crate::db::DbState;

#[tauri::command]
pub fn call_close(db: State<DbState>, call_id: String, outcome: String) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    calls_repo::call_close(&mut conn, &call_id, &outcome).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn call_complete(db: State<DbState>, call_id: String) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    calls_repo::call_complete(&mut conn, &call_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn call_cancel(db: State<DbState>, call_id: String) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    calls_repo::call_cancel(&mut conn, &call_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn call_create(db: State<DbState>, payload: CallCreatePayload) -> Result<String, String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    calls_repo::call_create(&mut conn, payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn call_status_set(db: State<DbState>, call_id: String, status: String) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    calls_repo::call_status_set(&mut conn, &call_id, &status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn call_get(db: State<DbState>, call_id: String) -> Result<CallDetail, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    calls_repo::call_get(&conn, &call_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn aaa_calls_list(db: State<DbState>, limit: Option<i64>) -> Result<Vec<AaaMemberCall>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let capped = limit.unwrap_or(300).clamp(50, 1000);
    calls_repo::list_aaa_calls(&conn, capped).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn call_update(db: State<DbState>, call_id: String, payload: CallUpdatePayload) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    calls_repo::call_update(&mut conn, &call_id, payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn call_tow_distance(
    db: State<'_, DbState>,
    pickup_address: String,
    dropoff_address: String,
) -> Result<f64, String> {
    let pickup = pickup_address.clone();
    let dropoff = dropoff_address.clone();
    let db_path = db.db_path.clone();
    let (p_lat, p_lon, d_lat, d_lon) = tauri::async_runtime::spawn_blocking(move || {
        let conn = open_connection(&db_path).map_err(|e| e.to_string())?;
        let (p_lat, p_lon) =
            geocode_repo::geocode_address_blocking(&conn, &pickup).map_err(|e| e.to_string())?;
        let (d_lat, d_lon) =
            geocode_repo::geocode_address_blocking(&conn, &dropoff).map_err(|e| e.to_string())?;
        Ok::<(f64, f64, f64, f64), String>((p_lat, p_lon, d_lat, d_lon))
    })
    .await
    .map_err(|_| "Geocode task failed".to_string())??;
    let meters = distance_repo::osrm_route_distance_meters((p_lat, p_lon), (d_lat, d_lon))
        .await
        .map_err(|e| e.to_string())?;
    let miles = meters * 0.000_621_371;
    Ok(miles)
}

#[tauri::command]
pub fn calls_history(
    db: State<DbState>,
    filters: calls_repo::CallHistoryFilters,
) -> Result<Vec<calls_repo::CallHistoryItem>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    calls_repo::list_calls_history(&conn, filters).map_err(|e| e.to_string())
}
