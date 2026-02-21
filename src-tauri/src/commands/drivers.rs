use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::drivers_repo::{self, DriverUpdate};
use crate::db::DbState;
use crate::models::driver::{DriverDetail, DriverRecord};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DriverUpdateDto {
    pub display_name: Option<String>,
    pub availability_status: Option<String>,
    pub phone: Option<String>,
    pub capabilities: Option<String>,
    pub notes: Option<String>,
    pub last_location: Option<String>,
}

#[tauri::command]
pub fn driver_list(db: State<DbState>) -> Result<Vec<DriverRecord>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    drivers_repo::driver_list_active(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn driver_list_archived(db: State<DbState>) -> Result<Vec<DriverRecord>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    drivers_repo::driver_list_archived(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn driver_create(db: State<DbState>, display_name: String) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    drivers_repo::driver_create(&conn, &display_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn driver_archive(db: State<DbState>, driver_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    drivers_repo::driver_archive(&conn, &driver_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn driver_restore(db: State<DbState>, driver_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    drivers_repo::driver_restore(&conn, &driver_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn driver_update(db: State<DbState>, driver_id: String, payload: DriverUpdateDto) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let update = DriverUpdate {
        display_name: payload.display_name,
        availability_status: payload.availability_status,
        phone: payload.phone,
        capabilities: payload.capabilities,
        notes: payload.notes,
        last_location: payload.last_location,
    };
    drivers_repo::driver_update(&conn, &driver_id, update).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn driver_truck_assign(
    db: State<DbState>,
    driver_id: String,
    truck_number: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    drivers_repo::driver_truck_assign(&conn, &driver_id, truck_number.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn driver_get(db: State<DbState>, driver_id: String) -> Result<DriverDetail, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    drivers_repo::driver_get(&conn, &driver_id).map_err(|e| e.to_string())
}
