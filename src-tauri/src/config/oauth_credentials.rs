use std::path::Path;

use serde::Deserialize;

use crate::config::paths::{default_oauth_credentials_path, ensure_config_dir, token_path};
use crate::config::settings::{load_settings, load_settings_sync, save_settings};
use crate::youtube::types::{AppSettings, OAuthCredentialsInfo};

#[derive(Debug, Clone)]
pub struct OAuthConfig {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Debug, Deserialize)]
struct ClientSecretInstalled {
    client_id: String,
    client_secret: String,
}

#[derive(Debug, Deserialize)]
struct ClientSecretFile {
    installed: Option<ClientSecretInstalled>,
    web: Option<ClientSecretInstalled>,
}

pub fn parse_oauth_config(raw: &str) -> anyhow::Result<OAuthConfig> {
    let data: ClientSecretFile = serde_json::from_str(raw)?;
    let source = data.installed.or(data.web).ok_or_else(|| {
        anyhow::anyhow!(
            "OAuth 資格情報ファイルが不正です。installed または web の Desktop OAuth クライアント情報が必要です。"
        )
    })?;

    Ok(OAuthConfig {
        client_id: source.client_id,
        client_secret: source.client_secret,
    })
}

pub fn load_oauth_config_from_path(path: &Path) -> anyhow::Result<OAuthConfig> {
    let raw = std::fs::read_to_string(path)?;
    parse_oauth_config(&raw)
}

pub fn resolve_oauth_credentials_path(settings: &AppSettings) -> Option<std::path::PathBuf> {
    if let Some(custom) = settings.oauth_credentials_path.as_deref() {
        let path = std::path::PathBuf::from(custom);
        if path.exists() {
            return Some(path);
        }
    }

    let default_path = default_oauth_credentials_path();
    if default_path.exists() {
        return Some(default_path);
    }

    None
}

fn mask_client_id(client_id: &str) -> String {
    if client_id.len() <= 12 {
        return client_id.to_string();
    }

    format!(
        "{}...{}",
        &client_id[..4.min(client_id.len())],
        &client_id[client_id.len().saturating_sub(4)..]
    )
}

pub fn get_oauth_credentials_info() -> anyhow::Result<Option<OAuthCredentialsInfo>> {
    let settings = load_settings_sync();
    let custom_path = settings.oauth_credentials_path.clone();

    let Some(effective_path) = resolve_oauth_credentials_path(&settings) else {
        return Ok(None);
    };

    let raw = std::fs::read_to_string(&effective_path)?;
    let config = parse_oauth_config(&raw)?;

    Ok(Some(OAuthCredentialsInfo {
        custom_path,
        effective_path: effective_path.to_string_lossy().to_string(),
        source: "user".to_string(),
        client_id: mask_client_id(&config.client_id),
    }))
}

async fn clear_token_file() -> anyhow::Result<()> {
    match tokio::fs::remove_file(token_path()).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub async fn set_oauth_credentials_path(path: Option<String>) -> anyhow::Result<()> {
    let mut settings = load_settings().await?;

    if let Some(source_path) = path.as_deref() {
        let file_path = Path::new(source_path);
        if !file_path.exists() {
            anyhow::bail!("OAuth 資格情報ファイルが見つかりません: {source_path}");
        }
        let raw = std::fs::read_to_string(file_path)?;
        let _ = parse_oauth_config(&raw)?;

        let _ = ensure_config_dir().await?;
        let dest = default_oauth_credentials_path();
        tokio::fs::write(&dest, raw).await?;

        settings.oauth_credentials_path = Some(dest.to_string_lossy().to_string());
    } else {
        let dest = default_oauth_credentials_path();
        if let Err(error) = tokio::fs::remove_file(&dest).await {
            if error.kind() != std::io::ErrorKind::NotFound {
                return Err(error.into());
            }
        }
        settings.oauth_credentials_path = None;
    }

    clear_token_file().await?;
    save_settings(&settings).await?;

    Ok(())
}

pub fn load_oauth_config() -> anyhow::Result<OAuthConfig> {
    let settings = load_settings_sync();

    let path = resolve_oauth_credentials_path(&settings).ok_or_else(|| {
        anyhow::anyhow!(
            "OAuth 資格情報が設定されていません。Google Cloud Console で作成した oauth.json をアップロードしてください。"
        )
    })?;

    load_oauth_config_from_path(&path)
}
