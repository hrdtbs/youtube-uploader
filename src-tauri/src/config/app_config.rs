use std::path::Path;

use chrono::{DateTime, Utc};
use chrono_tz::Tz;

use crate::config::local_index::UploadIndex;
use crate::config::paths;
use crate::config::schedule;
use crate::config::settings;
use crate::config::templates;
use crate::config::video_files;
use crate::youtube::api::YouTubeClient;
use crate::youtube::types::{
    AppConfig, UploadPreviewItem, UploadProgressEvent, UploadSummary,
};

pub const START_DATE_AUTO: &str = "auto";

pub fn is_auto_start_date(start_date: &str) -> bool {
    start_date == START_DATE_AUTO
}

pub async fn resolve_start_date(
    upload_dir: &Path,
    schedule: &crate::youtube::types::ScheduleConfig,
    client: Option<&YouTubeClient>,
) -> anyhow::Result<String> {
    let timezone: Tz = schedule
        .timezone
        .parse()
        .map_err(|_| anyhow::anyhow!("Invalid schedule.timezone: {}", schedule.timezone))?;

    let mut latest_utc: Option<DateTime<Utc>> = None;

    let index = UploadIndex::load(upload_dir).await?;
    for record in index.get_all() {
        latest_utc = consider_latest(latest_utc, &record.publish_at);
    }

    if let Some(client) = client {
        let videos = client.list_channel_videos(50).await?;
        for video in videos {
            let effective = effective_publish_at(
                &video.privacy_status,
                video.publish_at.as_deref(),
                &video.uploaded_at,
            );
            latest_utc = consider_latest(latest_utc, &effective);
        }
    }

    if latest_utc.is_none() {
        return Ok(Utc::now().with_timezone(&timezone).format("%Y-%m-%d").to_string());
    }

    Ok(latest_utc
        .unwrap()
        .with_timezone(&timezone)
        .date_naive()
        .succ_opt()
        .map(|date| date.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| Utc::now().with_timezone(&timezone).format("%Y-%m-%d").to_string()))
}

fn effective_publish_at(
    privacy_status: &str,
    publish_at: Option<&str>,
    uploaded_at: &str,
) -> String {
    if privacy_status == "private" {
        if let Some(value) = publish_at {
            return value.to_string();
        }
    }
    uploaded_at.to_string()
}

fn consider_latest(
    latest_utc: Option<DateTime<Utc>>,
    iso: &str,
) -> Option<DateTime<Utc>> {
    if iso.is_empty() {
        return latest_utc;
    }
    let parsed = DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|value| value.with_timezone(&Utc))
        .or_else(|| iso.parse::<DateTime<Utc>>().ok())?;
    match latest_utc {
        None => Some(parsed),
        Some(current) if parsed > current => Some(parsed),
        Some(current) => Some(current),
    }
}

pub async fn ensure_default_config() -> anyhow::Result<()> {
    let path = paths::default_config_path();
    if path.exists() {
        return Ok(());
    }

    let _ = paths::ensure_config_dir().await?;
    let default = include_str!("../../resources/default-config.yaml");
    tokio::fs::write(path, default).await?;
    Ok(())
}

pub async fn load_app_config(path: &Path) -> anyhow::Result<AppConfig> {
    let raw = tokio::fs::read_to_string(path)
        .await
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                anyhow::anyhow!("Config file not found: {}", path.display())
            } else {
                error.into()
            }
        })?;

    let parsed: serde_yaml::Value = serde_yaml::from_str(&raw)?;
    validate_config(parsed)
}

pub async fn save_app_config(path: &Path, config: &AppConfig) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let yaml = serde_yaml::to_string(config)?;
    tokio::fs::write(path, yaml).await?;
    Ok(())
}

pub async fn load_config_yaml_text(path: &Path) -> anyhow::Result<String> {
    if !path.exists() {
        ensure_default_config().await?;
    }
    Ok(tokio::fs::read_to_string(path).await?)
}

pub async fn save_config_yaml_text(path: &Path, yaml: &str) -> anyhow::Result<AppConfig> {
    let parsed: serde_yaml::Value = serde_yaml::from_str(yaml)?;
    let config = validate_config(parsed)?;
    tokio::fs::write(path, yaml).await?;
    Ok(config)
}

fn validate_config(raw: serde_yaml::Value) -> anyhow::Result<AppConfig> {
    let data = raw
        .as_mapping()
        .ok_or_else(|| anyhow::anyhow!("Config must be a YAML object."))?;

    let template = data
        .get("template")
        .ok_or_else(|| anyhow::anyhow!("template section is required."))?;
    let schedule = data
        .get("schedule")
        .ok_or_else(|| anyhow::anyhow!("schedule section is required."))?;

    let template_map = template
        .as_mapping()
        .ok_or_else(|| anyhow::anyhow!("template section is required."))?;
    let schedule_map = schedule
        .as_mapping()
        .ok_or_else(|| anyhow::anyhow!("schedule section is required."))?;

    let description = template_map
        .get("description")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("template.description is required."))?;

    let tags = template_map
        .get("tags")
        .and_then(|value| value.as_sequence())
        .ok_or_else(|| anyhow::anyhow!("template.tags must be an array."))?
        .iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect::<Vec<_>>();

    let timezone = schedule_map
        .get("timezone")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("schedule.timezone is required (IANA name, e.g. Asia/Tokyo)."))?;

    let start_date = schedule_map
        .get("startDate")
        .or_else(|| schedule_map.get("start_date"))
        .and_then(|value| value.as_str())
        .ok_or_else(|| anyhow::anyhow!("schedule.startDate is required (YYYY-MM-DD or auto)."))?;

    if start_date != START_DATE_AUTO && !regex::Regex::new(r"^\d{4}-\d{2}-\d{2}$")?.is_match(start_date) {
        anyhow::bail!("schedule.startDate must be YYYY-MM-DD or auto.");
    }

    let slots_value = schedule_map
        .get("slots")
        .and_then(|value| value.as_sequence())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow::anyhow!("schedule.slots must be a non-empty array."))?;

    let slots = parse_schedule_slots(slots_value)?;

    let title = template_map
        .get("title")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string);

    let mut upload_config = None;
    if let Some(upload) = data.get("upload").and_then(|value| value.as_mapping()) {
        if let Some(raw_playlist_id) = upload.get("playlistId").or_else(|| upload.get("playlist_id")) {
            if let Some(value) = raw_playlist_id.as_str() {
                let playlist_id = settings::validate_playlist_id(value)?;
                upload_config = Some(crate::youtube::types::UploadConfig {
                    playlist_id: Some(playlist_id),
                });
            }
        }
    }

    let config = AppConfig {
        template: crate::youtube::types::TemplateConfig {
            title,
            description: description.to_string(),
            tags,
            category_id: template_map
                .get("categoryId")
                .or_else(|| template_map.get("category_id"))
                .and_then(|value| value.as_str())
                .unwrap_or("22")
                .to_string(),
            default_language: template_map
                .get("defaultLanguage")
                .or_else(|| template_map.get("default_language"))
                .and_then(|value| value.as_str())
                .unwrap_or("ja")
                .to_string(),
        },
        schedule: crate::youtube::types::ScheduleConfig {
            timezone: timezone.trim().to_string(),
            start_date: start_date.to_string(),
            slots,
        },
        upload: upload_config,
    };

    config
        .schedule
        .timezone
        .parse::<Tz>()
        .map_err(|_| anyhow::anyhow!("Invalid schedule.timezone: {}", config.schedule.timezone))?;

    Ok(config)
}

fn parse_schedule_slots(
    slots: &serde_yaml::Sequence,
) -> anyhow::Result<Vec<crate::youtube::types::ScheduleSlot>> {
    let time_pattern = regex::Regex::new(r"^([01]\d|2[0-3]):([0-5]\d)$")?;
    let mut parsed_slots = Vec::new();

    for (index, slot) in slots.iter().enumerate() {
        let slot_map = slot
            .as_mapping()
            .ok_or_else(|| anyhow::anyhow!("schedule.slots[{index}] must be an object."))?;

        let time = slot_map
            .get("time")
            .and_then(|value| value.as_str())
            .ok_or_else(|| anyhow::anyhow!("schedule.slots[{index}].time must be HH:mm (24-hour)."))?;

        if !time_pattern.is_match(time) {
            anyhow::bail!("schedule.slots[{index}].time must be HH:mm (24-hour).");
        }

        let is_daily = slot_map
            .get("daily")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        let has_weekday = slot_map.contains_key("weekday");

        if is_daily && has_weekday {
            anyhow::bail!("schedule.slots[{index}]: use either daily or weekday, not both.");
        }
        if !is_daily && !has_weekday {
            anyhow::bail!("schedule.slots[{index}]: weekday (0-6) or daily: true is required.");
        }

        if is_daily {
            for weekday in 0..=6 {
                parsed_slots.push(crate::youtube::types::ScheduleSlot {
                    weekday,
                    time: time.to_string(),
                });
            }
            continue;
        }

        let weekday = slot_map
            .get("weekday")
            .and_then(|value| value.as_u64())
            .ok_or_else(|| anyhow::anyhow!("schedule.slots[{index}].weekday must be 0-6 (0=Sunday)."))?
            as u8;

        if weekday > 6 {
            anyhow::bail!("schedule.slots[{index}].weekday must be 0-6 (0=Sunday).");
        }

        parsed_slots.push(crate::youtube::types::ScheduleSlot {
            weekday,
            time: time.to_string(),
        });
    }

    Ok(parsed_slots)
}

pub async fn upload_preview(
    upload_dir: &str,
    config_path: Option<&str>,
    recursive: bool,
    force: bool,
) -> anyhow::Result<Vec<UploadPreviewItem>> {
    ensure_default_config().await?;
    let upload_path = Path::new(upload_dir);
    let config_path = if let Some(path) = config_path {
        PathBuf::from(path)
    } else {
        paths::resolve_config_path(upload_path, None).await
    };

    let mut config = load_app_config(&config_path).await?;
    let videos = video_files::list_video_files(upload_path, recursive)?;
    let index = UploadIndex::load(upload_path).await?;
    let pending: Vec<_> = if force {
        videos
    } else {
        videos
            .into_iter()
            .filter(|video| !index.has(&video.relative_path))
            .collect()
    };

    if is_auto_start_date(&config.schedule.start_date) {
        let client = crate::youtube::auth::get_authorized_client().await.ok();
        let resolved = resolve_start_date(upload_path, &config.schedule, client.as_ref()).await?;
        config.schedule.start_date = resolved;
    }

    let slots = schedule::create_schedule_slots(&config.schedule, pending.len())?;
    let playlist_id = config.upload.as_ref().and_then(|value| value.playlist_id.clone());

    Ok(pending
        .into_iter()
        .zip(slots.into_iter())
        .map(|(video, slot)| {
            let metadata = templates::build_metadata(Path::new(&video.absolute_path), &config.template);
            UploadPreviewItem {
                relative_path: video.relative_path,
                title: metadata.title,
                description: metadata.description,
                publish_at_local: slot.publish_at_local,
                publish_at_utc: slot.publish_at_utc,
                playlist_id: playlist_id.clone(),
            }
        })
        .collect())
}

use std::path::PathBuf;

use tauri::{AppHandle, Emitter};

pub async fn upload_run(
    app: &AppHandle,
    upload_dir: &str,
    config_path: Option<&str>,
    recursive: bool,
    force: bool,
    delay_seconds: f64,
) -> anyhow::Result<UploadSummary> {
    ensure_default_config().await?;
    let upload_path = Path::new(upload_dir);
    let config_path = if let Some(path) = config_path {
        PathBuf::from(path)
    } else {
        paths::resolve_config_path(upload_path, None).await
    };

    let mut config = load_app_config(&config_path).await?;
    let videos = video_files::list_video_files(upload_path, recursive)?;
    let mut index = UploadIndex::load(upload_path).await?;
    let pending: Vec<_> = if force {
        videos
    } else {
        videos
            .into_iter()
            .filter(|video| !index.has(&video.relative_path))
            .collect()
    };

    let skipped = (video_files::list_video_files(upload_path, recursive)?.len() as u32)
        .saturating_sub(pending.len() as u32);

    if pending.is_empty() {
        return Ok(UploadSummary {
            uploaded: 0,
            skipped,
            failed: 0,
        });
    }

    let client = crate::youtube::auth::get_authorized_client().await?;

    if is_auto_start_date(&config.schedule.start_date) {
        let resolved = resolve_start_date(upload_path, &config.schedule, Some(&client)).await?;
        config.schedule.start_date = resolved;
    }

    let slots = schedule::create_schedule_slots(&config.schedule, pending.len())?;
    let playlist_id = config.upload.as_ref().and_then(|value| value.playlist_id.clone());

    let mut summary = UploadSummary {
        uploaded: 0,
        skipped,
        failed: 0,
    };

    for (video, slot) in pending.into_iter().zip(slots.into_iter()) {
        let metadata = templates::build_metadata(Path::new(&video.absolute_path), &config.template);
        emit_progress(
            app,
            UploadProgressEvent {
                kind: "start".to_string(),
                relative_path: Some(video.relative_path.clone()),
                message: format!("Uploading: {}", video.relative_path),
                video_id: None,
            },
        );

        match client
            .upload_scheduled_video(
                &video.absolute_path,
                &metadata,
                &slot.publish_at_utc,
                |message| {
                    emit_progress(
                        app,
                        UploadProgressEvent {
                            kind: "progress".to_string(),
                            relative_path: Some(video.relative_path.clone()),
                            message,
                            video_id: None,
                        },
                    );
                },
            )
            .await
        {
            Ok(video_id) => {
                if let Some(ref playlist) = playlist_id {
                    if let Err(error) = client.add_video_to_playlist(&video_id, playlist).await {
                        emit_progress(
                            app,
                            UploadProgressEvent {
                                kind: "warning".to_string(),
                                relative_path: Some(video.relative_path.clone()),
                                message: format!(
                                    "Uploaded but failed to add to playlist: {error}"
                                ),
                                video_id: Some(video_id.clone()),
                            },
                        );
                    }
                }

                index
                    .mark_uploaded(
                        upload_path,
                        crate::config::local_index::UploadRecord {
                            filename: Path::new(&video.absolute_path)
                                .file_name()
                                .and_then(|value| value.to_str())
                                .unwrap_or("video")
                                .to_string(),
                            relative_path: video.relative_path.clone(),
                            video_id: video_id.clone(),
                            publish_at: slot.publish_at_utc.clone(),
                            uploaded_at: Utc::now().to_rfc3339(),
                        },
                    )
                    .await?;

                summary.uploaded += 1;
                emit_progress(
                    app,
                    UploadProgressEvent {
                        kind: "success".to_string(),
                        relative_path: Some(video.relative_path.clone()),
                        message: format!("Uploaded: {video_id}"),
                        video_id: Some(video_id),
                    },
                );
            }
            Err(error) => {
                summary.failed += 1;
                emit_progress(
                    app,
                    UploadProgressEvent {
                        kind: "error".to_string(),
                        relative_path: Some(video.relative_path.clone()),
                        message: error.to_string(),
                        video_id: None,
                    },
                );
            }
        }

        if delay_seconds > 0.0 {
            tokio::time::sleep(std::time::Duration::from_secs_f64(delay_seconds)).await;
        }
    }

    emit_progress(
        app,
        UploadProgressEvent {
            kind: "summary".to_string(),
            relative_path: None,
            message: format!(
                "Summary - uploaded: {}, skipped: {}, failed: {}",
                summary.uploaded, summary.skipped, summary.failed
            ),
            video_id: None,
        },
    );

    Ok(summary)
}

fn emit_progress(app: &AppHandle, event: UploadProgressEvent) {
    let _ = app.emit("upload-progress", event);
}
