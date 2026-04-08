mod commands;
mod db;
mod google_maps;
mod models;

use tauri::Manager;
use tauri::Emitter;
use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
use tauri_plugin_global_shortcut::ShortcutState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut("CommandOrControl+Shift+G")
                .expect("invalid global shortcut")
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        println!(
                            "[shortcut] fired {} ({})",
                            shortcut.to_string(),
                            shortcut.id()
                        );
                        if let Err(error) = app.emit(
                            "global-shortcut-fired",
                            serde_json::json!({ "accelerator": shortcut.to_string() }),
                        ) {
                            eprintln!("[shortcut] emit failed: {error}");
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Set up window positioning
            let window = app.get_webview_window("main").unwrap();
            let file_menu = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &PredefinedMenuItem::close_window(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;
            let edit_menu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;
            let view_menu = Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &PredefinedMenuItem::fullscreen(app, None)?,
                    &PredefinedMenuItem::minimize(app, None)?,
                ],
            )?;
            let window_menu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                ],
            )?;
            let help_menu = Submenu::with_items(
                app,
                "Help",
                true,
                &[&PredefinedMenuItem::about(app, None, None)?],
            )?;
            let menu = Menu::with_items(
                app,
                &[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
            )?;
            let _ = window.set_menu(menu);
            
            // Get the primary monitor
            if let Some(monitor) = window.current_monitor()? {
                // Use LOGICAL size instead of physical size to handle DPI scaling
                let screen_size = monitor.size().to_logical::<f64>(monitor.scale_factor());
                
                // Calculate dimensions using logical pixels
                // Default to 40% of screen width (fully resizable by user)
                let width = screen_size.width * 0.40;
                let height = screen_size.height;
                
                // Position at left edge of screen (0, 0 in logical coordinates)
                let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
                    x: 0.0,
                    y: 0.0,
                }));
                
                // Set size using logical pixels
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                    width,
                    height,
                }));
                
                // No min/max constraints - fully resizable!
            }
            
            // Set up database
            let handle = app.handle();
            let (db_path, backups_dir) = db::resolve_db_path(&handle)?;
            let mut conn = db::open_connection(&db_path)?;
            db::run_migrations(&mut conn, &db_path, &backups_dir)?;
            app.manage(db::DbState {
                conn: std::sync::Mutex::new(conn),
                db_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::dashboard::dashboard_get,
            commands::assignments::queue_add,
            commands::assignments::queue_move,
            commands::assignments::call_activate,
            commands::assignments::call_active_reassign,
            commands::assignments::call_unassign,
            commands::calls::call_close,
            commands::calls::call_complete,
            commands::calls::call_cancel,
            commands::calls::call_create,
            commands::calls::call_status_set,
            commands::calls::call_get,
            commands::calls::aaa_calls_list,
            commands::calls::call_update,
            commands::calls::calls_history,
            commands::admin::app_reset,
            commands::calls::call_tow_distance,
            commands::google_maps::google_geocode_validate,
            commands::google_maps::google_geocode_validate_store,
            commands::google_maps::google_distance_matrix,
            commands::drivers::driver_list,
            commands::drivers::driver_list_archived,
            commands::drivers::driver_create,
            commands::drivers::driver_archive,
            commands::drivers::driver_restore,
            commands::drivers::driver_update,
            commands::drivers::driver_truck_assign,
            commands::drivers::driver_get,
            commands::reports::report_driver_calls,
            commands::nearby::call_nearby_drivers,
            commands::shifts::shift_list,
            commands::shifts::shift_create,
            commands::shifts::shift_update,
            commands::shifts::shift_delete,
            commands::search::search,
            commands::settings::settings_set,
            commands::settings::settings_get,
            commands::ocr::ocr_pick_image_path,
            commands::ocr::ocr_import_image_b64,
            commands::ocr::ocr_import_image_path,
            commands::ocr::ocr_capture_screenshot,
            commands::ocr::ocr_create_call,
            commands::ocr::ocr_attach_call,
            commands::events::event_log_list,
            commands::events::event_log_clear,
            commands::events::driver_pause_lunch_map,
            commands::events::driver_lunch_start_map,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
