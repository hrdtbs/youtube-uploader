mod commands;
mod config;
mod youtube;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| Ok(()))
        .invoke_handler(tauri::generate_handler![
            commands::auth_login,
            commands::auth_status,
            commands::auth_channels,
            commands::videos_list,
            commands::categories_list,
            commands::playlists_add,
            commands::upload_preview_cmd,
            commands::upload_run_cmd,
            commands::config_load,
            commands::config_save,
            commands::settings_get,
            commands::settings_set,
            commands::init_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
