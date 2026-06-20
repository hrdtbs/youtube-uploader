use std::path::{Path, PathBuf};

pub const APP_NAME: &str = "youtube-uploader";
pub const CONFIG_FILENAME: &str = "config.yaml";
pub const TOKEN_FILENAME: &str = "token.json";
pub const INDEX_FILENAME: &str = ".youtube-uploader-index.json";
pub const SETTINGS_FILENAME: &str = "settings.json";
pub const OAUTH_FILENAME: &str = "oauth.json";

pub const YOUTUBE_SCOPE: &str = "https://www.googleapis.com/auth/youtube.force-ssl";

pub fn config_dir() -> PathBuf {
    if cfg!(windows) {
        if let Some(app_data) = std::env::var_os("APPDATA") {
            return PathBuf::from(app_data).join(APP_NAME);
        }
    }

    if let Some(xdg) = std::env::var_os("XDG_CONFIG_HOME") {
        return PathBuf::from(xdg).join(APP_NAME);
    }

    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join(APP_NAME)
}

pub fn token_path() -> PathBuf {
    config_dir().join(TOKEN_FILENAME)
}

pub fn default_config_path() -> PathBuf {
    config_dir().join(CONFIG_FILENAME)
}

pub fn settings_path() -> PathBuf {
    config_dir().join(SETTINGS_FILENAME)
}

pub async fn ensure_config_dir() -> anyhow::Result<PathBuf> {
    let dir = config_dir();
    tokio::fs::create_dir_all(&dir).await?;
    Ok(dir)
}

pub fn default_oauth_credentials_path() -> PathBuf {
    config_dir().join(OAUTH_FILENAME)
}

pub async fn resolve_config_path(upload_dir: &Path, explicit: Option<&Path>) -> PathBuf {
    if let Some(path) = explicit {
        return path.to_path_buf();
    }

    let cwd_config = std::env::current_dir()
        .unwrap_or_default()
        .join(CONFIG_FILENAME);
    if cwd_config.exists() {
        return cwd_config;
    }

    let upload_config = upload_dir.join(CONFIG_FILENAME);
    if upload_config.exists() {
        return upload_config;
    }

    default_config_path()
}
