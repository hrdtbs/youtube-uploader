use crate::config::paths::{ensure_config_dir, settings_path};
use crate::youtube::types::AppSettings;

pub fn load_settings_sync() -> AppSettings {
    match std::fs::read_to_string(settings_path()) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => AppSettings::default(),
        Err(_) => AppSettings::default(),
    }
}

pub async fn load_settings() -> anyhow::Result<AppSettings> {
    let _ = ensure_config_dir().await?;
    match tokio::fs::read_to_string(settings_path()).await {
        Ok(raw) => Ok(serde_json::from_str(&raw).unwrap_or_default()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AppSettings::default()),
        Err(error) => Err(error.into()),
    }
}

pub async fn save_settings(settings: &AppSettings) -> anyhow::Result<()> {
    let _ = ensure_config_dir().await?;
    tokio::fs::write(settings_path(), serde_json::to_string_pretty(settings)?).await?;
    Ok(())
}

pub async fn default_upload_dir() -> anyhow::Result<String> {
    let settings = load_settings().await?;
    if let Some(dir) = settings.upload_dir {
        return Ok(dir);
    }

    Ok(std::env::var("YOUTUBE_UPLOAD_DIR").unwrap_or_else(|_| "./videos".to_string()))
}

pub async fn resolve_upload_dir(explicit: Option<&str>) -> anyhow::Result<String> {
    if let Some(dir) = explicit {
        return Ok(dir.to_string());
    }
    default_upload_dir().await
}

pub fn normalize_playlist_id(value: &str) -> String {
    let trimmed = value.trim();
    if let Some(captures) = regex::Regex::new(r"[?&]list=([^&]+)")
        .ok()
        .and_then(|re| re.captures(trimmed))
    {
        return captures
            .get(1)
            .map_or_else(|| trimmed.to_string(), |m| m.as_str().to_string());
    }
    trimmed.to_string()
}

pub fn validate_playlist_id(value: &str) -> anyhow::Result<String> {
    let playlist_id = normalize_playlist_id(value);
    let pattern = regex::Regex::new(r"^[\w-]+$")?;
    if !pattern.is_match(&playlist_id) {
        anyhow::bail!("playlist must be a playlist ID or a URL containing list=.");
    }
    Ok(playlist_id)
}

pub async fn resolve_playlist_id(
    explicit: Option<&str>,
    config_playlist_id: Option<&str>,
) -> anyhow::Result<String> {
    if let Some(value) = explicit {
        return validate_playlist_id(value);
    }
    if let Some(value) = config_playlist_id {
        return validate_playlist_id(value);
    }
    anyhow::bail!("playlist ID is required.")
}
