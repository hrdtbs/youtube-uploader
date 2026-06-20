use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateConfig {
    #[serde(default)]
    pub title: Option<String>,
    pub description: String,
    pub tags: Vec<String>,
    #[serde(default = "default_category_id", rename = "categoryId")]
    pub category_id: String,
    #[serde(default = "default_language", rename = "defaultLanguage")]
    pub default_language: String,
}

fn default_category_id() -> String {
    "22".to_string()
}

fn default_language() -> String {
    "ja".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleSlot {
    pub weekday: u8,
    pub time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleSlotDef {
    pub daily: bool,
    pub weekday: Option<u8>,
    pub time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleConfigDto {
    pub timezone: String,
    #[serde(rename = "startDate")]
    pub start_date: String,
    pub slots: Vec<ScheduleSlotDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleConfig {
    pub timezone: String,
    #[serde(rename = "startDate")]
    pub start_date: String,
    pub slots: Vec<ScheduleSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadConfig {
    #[serde(default, rename = "playlistId")]
    pub playlist_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub template: TemplateConfig,
    pub schedule: ScheduleConfig,
    #[serde(default)]
    pub upload: Option<UploadConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfigDto {
    pub template: TemplateConfig,
    pub schedule: ScheduleConfigDto,
    #[serde(default)]
    pub upload: Option<UploadConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub category_id: String,
    pub default_language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledSlot {
    pub publish_at_utc: String,
    pub publish_at_local: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadSummary {
    pub uploaded: u32,
    pub skipped: u32,
    pub failed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadPreviewItem {
    pub relative_path: String,
    pub title: String,
    pub description: String,
    pub publish_at_local: String,
    pub publish_at_utc: String,
    pub playlist_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadProgressEvent {
    pub kind: String,
    pub relative_path: Option<String>,
    pub message: String,
    pub video_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelVideo {
    pub id: String,
    pub title: String,
    pub uploaded_at: String,
    pub privacy_status: String,
    #[serde(default)]
    pub playlists: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publish_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoCategory {
    pub id: String,
    pub title: String,
    pub assignable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticatedChannel {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistSummary {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenFile {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub scope: Option<String>,
    pub token_type: Option<String>,
    pub expiry_date: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    pub authenticated: bool,
    pub token_path: String,
    pub access_token_expires: Option<String>,
    pub refresh_token_present: bool,
    pub channels: Vec<AuthenticatedChannel>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub upload_dir: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self { upload_dir: None }
    }
}
