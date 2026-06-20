use std::sync::Arc;

use reqwest::Client;
use serde::Deserialize;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::Mutex;

use crate::config::oauth_credentials::load_oauth_config;
use crate::config::paths::{ensure_config_dir, token_path, YOUTUBE_SCOPE};
use crate::youtube::api::YouTubeClient;
use crate::youtube::types::{AuthStatus, AuthenticatedChannel, TokenFile};

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("{0}")]
    Message(String),
}

impl From<anyhow::Error> for AuthError {
    fn from(value: anyhow::Error) -> Self {
        Self::Message(value.to_string())
    }
}

pub async fn load_token_file() -> anyhow::Result<Option<TokenFile>> {
    match tokio::fs::read_to_string(token_path()).await {
        Ok(raw) => Ok(Some(serde_json::from_str(&raw)?)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub async fn save_token_file(token: &TokenFile) -> anyhow::Result<()> {
    let _ = ensure_config_dir().await?;
    tokio::fs::write(token_path(), serde_json::to_string_pretty(token)?).await?;
    Ok(())
}

pub async fn delete_token_file() -> anyhow::Result<()> {
    match tokio::fs::remove_file(token_path()).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub async fn run_auth_logout() -> anyhow::Result<()> {
    delete_token_file().await
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: i64,
    refresh_token: Option<String>,
    scope: Option<String>,
    token_type: Option<String>,
}

pub async fn run_auth_login(app: tauri::AppHandle) -> anyhow::Result<Vec<AuthenticatedChannel>> {
    let oauth = load_oauth_config()?;
    let server = tiny_http::Server::http("127.0.0.1:0")
        .map_err(|error| anyhow::anyhow!(error.to_string()))?;
    let port = server.server_addr().to_ip().map_or(0, |addr| addr.port());
    let redirect_uri = format!("http://127.0.0.1:{port}/");

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent%20select_account&include_granted_scopes=true",
        urlencoding_encode(&oauth.client_id),
        urlencoding_encode(&redirect_uri),
        urlencoding_encode(YOUTUBE_SCOPE),
    );

    let _ = app.opener().open_url(auth_url, None::<&str>);

    let code = Arc::new(Mutex::new(None::<String>));
    let code_for_server = code.clone();

    std::thread::spawn(move || {
        if let Some(request) = server
            .recv_timeout(std::time::Duration::from_mins(2))
            .ok()
            .flatten()
        {
            let url = request.url().to_string();
            let query = url.split('?').nth(1).unwrap_or("");
            let params: std::collections::HashMap<_, _> = query
                .split('&')
                .filter_map(|pair| {
                    let mut parts = pair.splitn(2, '=');
                    Some((parts.next()?.to_string(), parts.next()?.to_string()))
                })
                .collect();

            if let Some(auth_code) = params.get("code") {
                let html = "<html><body><p>Authorization complete. You can close this window and return to the app.</p></body></html>";
                let response = tiny_http::Response::from_string(html).with_header(
                    tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8")
                        .unwrap(),
                );
                let _ = request.respond(response);
                let mut guard = code_for_server.blocking_lock();
                *guard = Some(auth_code.clone());
            }
        }
    });

    let deadline = tokio::time::Instant::now() + std::time::Duration::from_mins(2);
    loop {
        if tokio::time::Instant::now() > deadline {
            anyhow::bail!("OAuth callback timed out. Try signing in again.");
        }
        if code.lock().await.is_some() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    let auth_code = code.lock().await.clone().unwrap();

    let client = Client::new();
    let token_response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", auth_code.as_str()),
            ("client_id", oauth.client_id.as_str()),
            ("client_secret", oauth.client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await?
        .error_for_status()?
        .json::<TokenResponse>()
        .await?;

    let refresh_token = token_response
        .refresh_token
        .ok_or_else(|| anyhow::anyhow!("No refresh token received. Revoke app access in Google Account settings and sign in again."))?;

    let token = TokenFile {
        access_token: Some(token_response.access_token),
        refresh_token: Some(refresh_token),
        scope: token_response.scope,
        token_type: token_response.token_type,
        expiry_date: Some(chrono::Utc::now().timestamp_millis() + token_response.expires_in * 1000),
    };

    save_token_file(&token).await?;
    let youtube = YouTubeClient::new().await?;
    youtube.fetch_my_channels().await
}

fn urlencoding_encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

pub async fn get_auth_status() -> AuthStatus {
    let path = token_path().to_string_lossy().to_string();
    let token = match load_token_file().await {
        Ok(token) => token,
        Err(error) => {
            return AuthStatus {
                authenticated: false,
                token_path: path,
                access_token_expires: None,
                refresh_token_present: false,
                channels: vec![],
                message: Some(error.to_string()),
            };
        }
    };

    let Some(token) = token else {
        return AuthStatus {
            authenticated: false,
            token_path: path,
            access_token_expires: None,
            refresh_token_present: false,
            channels: vec![],
            message: Some("ログインしていません。".to_string()),
        };
    };

    let access_token_expires = token.expiry_date.map(|value| {
        chrono::DateTime::<chrono::Utc>::from_timestamp_millis(value)
            .map_or_else(|| value.to_string(), |date| date.to_rfc3339())
    });

    match get_authorized_client().await {
        Ok(client) => match client.fetch_my_channels().await {
            Ok(channels) => AuthStatus {
                authenticated: true,
                token_path: path,
                access_token_expires,
                refresh_token_present: token.refresh_token.is_some(),
                channels,
                message: None,
            },
            Err(error) => AuthStatus {
                authenticated: true,
                token_path: path,
                access_token_expires,
                refresh_token_present: token.refresh_token.is_some(),
                channels: vec![],
                message: Some(error.to_string()),
            },
        },
        Err(error) => AuthStatus {
            authenticated: false,
            token_path: path,
            access_token_expires,
            refresh_token_present: token.refresh_token.is_some(),
            channels: vec![],
            message: Some(error.to_string()),
        },
    }
}

pub async fn get_authorized_client() -> Result<YouTubeClient, AuthError> {
    YouTubeClient::new().await.map_err(AuthError::from)
}
