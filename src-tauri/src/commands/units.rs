use tauri::{Emitter, State};

use crate::db::units_repo;
use crate::db::DbState;
use crate::models::unit::UnitPosition;

#[tauri::command]
pub fn unit_list(db: State<DbState>) -> Result<Vec<UnitPosition>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    units_repo::unit_list(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unit_position_set(
    app: tauri::AppHandle,
    db: State<DbState>,
    unit_id: String,
    lat: f64,
    lng: f64,
    speed: f64,
    heading: f64,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    units_repo::unit_position_set(&conn, &unit_id, lat, lng, speed, heading)
        .map_err(|e| e.to_string())?;

    // Emit event for real-time updates
    let _ = app.emit(
        "unit-position-updated",
        serde_json::json!({
            "unit_id": unit_id,
            "lat": lat,
            "lng": lng,
            "speed": speed,
            "heading": heading,
        }),
    );

    Ok(())
}
