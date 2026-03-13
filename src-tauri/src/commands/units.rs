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
    if !lat.is_finite() || !lng.is_finite() || !speed.is_finite() || !heading.is_finite() {
        return Err("Position values must be finite numbers".to_string());
    }
    if !(-90.0..=90.0).contains(&lat) {
        return Err("Latitude must be between -90 and 90".to_string());
    }
    if !(-180.0..=180.0).contains(&lng) {
        return Err("Longitude must be between -180 and 180".to_string());
    }
    if speed < 0.0 {
        return Err("Speed cannot be negative".to_string());
    }
    if !(0.0..=360.0).contains(&heading) {
        return Err("Heading must be between 0 and 360".to_string());
    }

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
