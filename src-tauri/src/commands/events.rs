use tauri::State;

use crate::db::events_repo;
use crate::db::DbState;
use crate::models::event::{EventLogFilters, EventLogItem};

#[tauri::command]
pub fn event_log_list(db: State<DbState>, filters: EventLogFilters) -> Result<Vec<EventLogItem>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    events_repo::event_log_list(&conn, filters).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn event_log_clear(db: State<DbState>) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    events_repo::event_log_clear(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn driver_pause_lunch_map(db: State<DbState>) -> Result<Vec<(String, String)>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    events_repo::driver_pause_lunch_map(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn driver_lunch_start_map(db: State<DbState>) -> Result<Vec<(String, String)>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    events_repo::driver_lunch_start_map(&conn).map_err(|e| e.to_string())
}
