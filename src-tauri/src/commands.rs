use std::path::PathBuf;

use tauri::AppHandle;

use crate::config::app_config::{
    ensure_default_config, load_app_config_dto, load_config_yaml_text, save_app_config_dto,
    save_config_yaml_text, upload_preview, upload_run,
};
use crate::config::paths::{default_config_path, resolve_config_path};
use crate::config::settings::{
    load_settings, resolve_playlist_id, resolve_upload_dir, save_settings,
};
use crate::youtube::auth::{get_auth_status, get_authorized_client, run_auth_login};
use crate::youtube::types::{
    AppConfigDto, AppSettings, AuthStatus, AuthenticatedChannel, ChannelVideo, UploadPreviewItem,
    UploadSummary, VideoCategory,
};

#[tauri::command]
pub async fn auth_login(app: AppHandle) -> Result<Vec<AuthenticatedChannel>, String> {
    run_auth_login(app).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn auth_status() -> Result<AuthStatus, String> {
    Ok(get_auth_status().await)
}

#[tauri::command]
pub async fn auth_channels() -> Result<Vec<AuthenticatedChannel>, String> {
    let client = get_authorized_client().await.map_err(|error| error.to_string())?;
    client.fetch_my_channels().await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn videos_list(limit: u32) -> Result<Vec<ChannelVideo>, String> {
    let limit = limit.clamp(1, 500) as usize;
    let client = get_authorized_client().await.map_err(|error| error.to_string())?;
    client
        .list_channel_videos(limit)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn categories_list(
    region: Option<String>,
    hl: Option<String>,
    include_all: Option<bool>,
) -> Result<Vec<VideoCategory>, String> {
    let region_code = region.unwrap_or_else(|| "JP".to_string()).to_uppercase();
    if region_code.len() != 2 || !region_code.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return Err("region must be an ISO 3166-1 alpha-2 code (e.g. JP, US).".to_string());
    }

    let client = get_authorized_client().await.map_err(|error| error.to_string())?;
    let mut categories = client
        .list_video_categories(&region_code, hl.as_deref())
        .await
        .map_err(|error| error.to_string())?;

    if !include_all.unwrap_or(false) {
        categories.retain(|category| category.assignable);
    }

    Ok(categories)
}

#[tauri::command]
pub async fn playlists_add(
    playlist: Option<String>,
    config_path: Option<String>,
    video_ids: Vec<String>,
) -> Result<String, String> {
    if video_ids.is_empty() {
        return Err("Select at least one video.".to_string());
    }

    ensure_default_config()
        .await
        .map_err(|error| error.to_string())?;

    let upload_dir = resolve_upload_dir(None)
        .await
        .map_err(|error| error.to_string())?;
    let resolved_config = if let Some(path) = config_path.as_deref() {
        PathBuf::from(path)
    } else {
        resolve_config_path(std::path::Path::new(&upload_dir), None).await
    };

    let config = crate::config::app_config::load_app_config(&resolved_config)
        .await
        .map_err(|error| error.to_string())?;
    let playlist_id = resolve_playlist_id(
        playlist.as_deref(),
        config.upload.as_ref().and_then(|value| value.playlist_id.as_deref()),
    )
    .await
    .map_err(|error| error.to_string())?;

    let client = get_authorized_client().await.map_err(|error| error.to_string())?;
    let mut added = 0u32;
    let mut failed = 0u32;

    for video_id in video_ids {
        match client.add_video_to_playlist(&video_id, &playlist_id).await {
            Ok(()) => added += 1,
            Err(_) => failed += 1,
        }
    }

    Ok(format!(
        "Summary - added: {added}, failed: {failed}, playlist: {playlist_id}"
    ))
}

#[tauri::command]
pub async fn upload_preview_cmd(
    dir: Option<String>,
    config: Option<String>,
    recursive: Option<bool>,
    force: Option<bool>,
) -> Result<Vec<UploadPreviewItem>, String> {
    let upload_dir = resolve_upload_dir(dir.as_deref())
        .await
        .map_err(|error| error.to_string())?;
    upload_preview(
        &upload_dir,
        config.as_deref(),
        recursive.unwrap_or(false),
        force.unwrap_or(false),
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn upload_run_cmd(
    app: AppHandle,
    dir: Option<String>,
    config: Option<String>,
    recursive: Option<bool>,
    force: Option<bool>,
    delay: Option<f64>,
) -> Result<UploadSummary, String> {
    let upload_dir = resolve_upload_dir(dir.as_deref())
        .await
        .map_err(|error| error.to_string())?;
    upload_run(
        &app,
        &upload_dir,
        config.as_deref(),
        recursive.unwrap_or(false),
        force.unwrap_or(false),
        delay.unwrap_or(10.0),
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn config_get() -> Result<AppConfigDto, String> {
    ensure_default_config()
        .await
        .map_err(|error| error.to_string())?;
    load_app_config_dto(&default_config_path())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn config_set(config: AppConfigDto) -> Result<(), String> {
    ensure_default_config()
        .await
        .map_err(|error| error.to_string())?;
    save_app_config_dto(&default_config_path(), &config)
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn config_load() -> Result<String, String> {
    ensure_default_config()
        .await
        .map_err(|error| error.to_string())?;
    load_config_yaml_text(&default_config_path())
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn config_save(yaml: String) -> Result<String, String> {
    ensure_default_config()
        .await
        .map_err(|error| error.to_string())?;
    save_config_yaml_text(&default_config_path(), &yaml)
        .await
        .map_err(|error| error.to_string())?;
    Ok(default_config_path().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn settings_get() -> Result<AppSettings, String> {
    load_settings()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn settings_set(settings: AppSettings) -> Result<(), String> {
    save_settings(&settings)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn init_app() -> Result<(), String> {
    ensure_default_config()
        .await
        .map_err(|error| error.to_string())
}
