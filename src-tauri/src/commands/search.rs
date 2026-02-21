use tauri::State;

use crate::db::search_repo;
use crate::db::DbState;
use crate::models::search::SearchResults;

#[tauri::command]
pub fn search(db: State<DbState>, query: String, limit: Option<i32>) -> Result<SearchResults, String> {
    let conn = db.conn.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let cap = limit.unwrap_or(20).clamp(1, 100);
    search_repo::search(&conn, &query, cap).map_err(|e| e.to_string())
}
