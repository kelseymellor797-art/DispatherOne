use tauri::State;

use crate::db::admin_repo;
use crate::db::DbState;

#[tauri::command]
pub fn app_reset(db: State<DbState>) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    admin_repo::reset_app_data(&mut conn).map_err(|e| e.to_string())
}
