use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::assignments_repo::{self, Owner};
use crate::db::DbState;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OwnerDto {
    Unassigned,
    Driver { driver_id: String },
}

impl OwnerDto {
    fn into_owner(self) -> Owner {
        match self {
            OwnerDto::Unassigned => Owner::Unassigned,
            OwnerDto::Driver { driver_id } => Owner::Driver(driver_id),
        }
    }
}

#[tauri::command]
pub fn queue_add(
    db: State<DbState>,
    call_id: String,
    driver_id: String,
    position: Option<i32>,
) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    assignments_repo::call_queue_add(&mut conn, &call_id, &driver_id, position)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn queue_move(
    db: State<DbState>,
    call_id: String,
    from_owner: OwnerDto,
    to_owner: OwnerDto,
    new_position: i32,
) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    assignments_repo::call_queue_move(
        &mut conn,
        &call_id,
        from_owner.into_owner(),
        to_owner.into_owner(),
        new_position,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn call_activate(
    db: State<DbState>,
    call_id: String,
    driver_id: String,
) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    assignments_repo::call_activate(&mut conn, &call_id, &driver_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn call_unassign(db: State<DbState>, call_id: String) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    assignments_repo::call_unassign(&mut conn, &call_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn call_active_reassign(
    db: State<DbState>,
    call_id: String,
    from_driver_id: String,
    to_driver_id: Option<String>,
) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    assignments_repo::call_active_reassign(
        &mut conn,
        &call_id,
        &from_driver_id,
        to_driver_id.as_deref(),
    )
    .map_err(|e| e.to_string())
}
