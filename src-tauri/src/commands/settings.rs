use tauri::State;

use crate::db::settings_repo;
use crate::db::DbState;

#[tauri::command]
pub fn settings_set(db: State<DbState>, key: String, value: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    settings_repo::settings_set(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_get(db: State<DbState>, keys: Vec<String>) -> Result<std::collections::HashMap<String, String>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    settings_repo::settings_get(&conn, &keys).map_err(|e| e.to_string())
}
