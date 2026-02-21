use tauri::State;

use crate::db::reports_repo;
use crate::db::DbState;
use crate::models::report::DriverCallReportItem;

#[tauri::command]
pub fn report_driver_calls(
    db: State<DbState>,
    start_date: String,
    end_date: String,
) -> Result<Vec<DriverCallReportItem>, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    reports_repo::driver_call_report(&conn, &start_date, &end_date).map_err(|e| e.to_string())
}
