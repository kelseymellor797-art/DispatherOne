use tauri::State;

use crate::db::nearby_repo;
use crate::db::DbState;

#[tauri::command]
pub async fn call_nearby_drivers(
    db: State<'_, DbState>,
    call_id: String,
) -> Result<Vec<nearby_repo::NearbyDriver>, String> {
    let db_path = db.db_path.clone();
    let call_id = call_id.clone();
    let handle = tauri::async_runtime::spawn_blocking(move || {
        let conn = crate::db::open_connection(&db_path).map_err(|e| e.to_string())?;
        tauri::async_runtime::block_on(nearby_repo::call_nearby_drivers(&conn, &call_id))
            .map_err(|e| e.to_string())
    });
    handle.await.map_err(|e| e.to_string())?
}
