use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::shifts_repo::{self, ShiftCreatePayload, ShiftUpdatePayload};
use crate::db::DbState;
use crate::models::shift::DriverShiftRecord;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShiftCreateDto {
    pub driver_id: String,
    pub shift_start: String,
    pub shift_end: String,
    pub lunch_start: Option<String>,
    pub lunch_end: Option<String>,
    pub shift_label: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShiftUpdateDto {
    pub shift_start: String,
    pub shift_end: String,
    pub lunch_start: Option<String>,
    pub lunch_end: Option<String>,
    pub shift_label: Option<String>,
}

#[tauri::command]
pub fn shift_list(
    db: State<DbState>,
    start_date: String,
    end_date: String,
) -> Result<Vec<DriverShiftRecord>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    shifts_repo::shift_list(&conn, &start_date, &end_date).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shift_create(db: State<DbState>, payload: ShiftCreateDto) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let create = ShiftCreatePayload {
        driver_id: payload.driver_id,
        shift_start: payload.shift_start,
        shift_end: payload.shift_end,
        lunch_start: payload.lunch_start,
        lunch_end: payload.lunch_end,
        shift_label: payload.shift_label,
    };
    shifts_repo::shift_create(&conn, create).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shift_update(
    db: State<DbState>,
    shift_id: String,
    payload: ShiftUpdateDto,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let update = ShiftUpdatePayload {
        shift_start: payload.shift_start,
        shift_end: payload.shift_end,
        lunch_start: payload.lunch_start,
        lunch_end: payload.lunch_end,
        shift_label: payload.shift_label,
    };
    shifts_repo::shift_update(&conn, &shift_id, update).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn shift_delete(db: State<DbState>, shift_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    shifts_repo::shift_delete(&conn, &shift_id).map_err(|e| e.to_string())
}
