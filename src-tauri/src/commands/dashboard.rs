use tauri::State;

use crate::db::dashboard_repo;
use crate::db::DbState;
use crate::models::dashboard::DashboardSnapshot;

#[tauri::command]
pub fn dashboard_get(db: State<DbState>) -> Result<DashboardSnapshot, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    dashboard_repo::dashboard_get(&conn).map_err(|e| e.to_string())
}
