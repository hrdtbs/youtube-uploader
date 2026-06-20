use std::path::Path;

use reqwest::Client;
use serde::Deserialize;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};

use crate::config::oauth_credentials::load_oauth_config;
use crate::youtube::auth::{load_token_file, save_token_file};
use crate::youtube::types::{
    AuthenticatedChannel, ChannelVideo, PlaylistSummary, TokenFile, VideoCategory, VideoMetadata,
};

struct PlaylistVideoStub {
    id: String,
    title: String,
    uploaded_at: String,
}

struct VideoStatusInfo {
    privacy_status: String,
    publish_at: Option<String>,
}

pub struct YouTubeClient {
    http: Client,
    token: TokenFile,
    oauth: OAuthCredentials,
}

#[derive(Clone)]
struct OAuthCredentials {
    client_id: String,
    client_secret: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: i64,
    scope: Option<String>,
    token_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChannelsListResponse {
    items: Option<Vec<ChannelItem>>,
}

#[derive(Debug, Deserialize)]
struct ChannelItem {
    id: Option<String>,
    snippet: Option<ChannelSnippet>,
    #[serde(rename = "contentDetails")]
    content_details: Option<ChannelContentDetails>,
}

#[derive(Debug, Deserialize)]
struct ChannelSnippet {
    title: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChannelContentDetails {
    #[serde(rename = "relatedPlaylists")]
    related_playlists: Option<RelatedPlaylists>,
}

#[derive(Debug, Deserialize)]
struct RelatedPlaylists {
    uploads: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PlaylistItemsResponse {
    items: Option<Vec<PlaylistItem>>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PlaylistItem {
    snippet: Option<PlaylistItemSnippet>,
}

#[derive(Debug, Deserialize)]
struct PlaylistItemSnippet {
    title: Option<String>,
    #[serde(rename = "publishedAt")]
    published_at: Option<String>,
    #[serde(rename = "resourceId")]
    resource_id: Option<PlaylistResourceId>,
}

#[derive(Debug, Deserialize)]
struct PlaylistResourceId {
    #[serde(rename = "videoId")]
    video_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VideosListResponse {
    items: Option<Vec<VideoItem>>,
}

#[derive(Debug, Deserialize)]
struct VideoItem {
    id: Option<String>,
    status: Option<VideoStatus>,
}

#[derive(Debug, Deserialize)]
struct VideoStatus {
    #[serde(rename = "privacyStatus")]
    privacy_status: Option<String>,
    #[serde(rename = "publishAt")]
    publish_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VideoCategoriesResponse {
    items: Option<Vec<VideoCategoryItem>>,
}

#[derive(Debug, Deserialize)]
struct VideoCategoryItem {
    id: Option<String>,
    snippet: Option<VideoCategorySnippet>,
}

#[derive(Debug, Clone, Deserialize)]
struct VideoCategorySnippet {
    title: Option<String>,
    assignable: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct PlaylistsListResponse {
    items: Option<Vec<PlaylistItemSummary>>,
    #[serde(rename = "nextPageToken")]
    next_page_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PlaylistItemSummary {
    id: Option<String>,
    snippet: Option<PlaylistSummarySnippet>,
}

#[derive(Debug, Deserialize)]
struct PlaylistSummarySnippet {
    title: Option<String>,
}

impl YouTubeClient {
    pub async fn new() -> anyhow::Result<Self> {
        let oauth_config = load_oauth_config()?;
        let oauth = OAuthCredentials {
            client_id: oauth_config.client_id,
            client_secret: oauth_config.client_secret,
        };

        let mut token = load_token_file()
            .await?
            .ok_or_else(|| anyhow::anyhow!("ログインしていません。Google でログインしてください。"))?;

        if token.refresh_token.is_none() {
            anyhow::bail!("ログインしていません。Google でログインしてください。");
        }

        if should_refresh(&token) {
            token = refresh_access_token(&oauth, &token).await?;
            save_token_file(&token).await?;
        }

        Ok(Self {
            http: Client::new(),
            token,
            oauth,
        })
    }

    async fn access_token(&self) -> anyhow::Result<String> {
        self.token
            .access_token
            .clone()
            .ok_or_else(|| anyhow::anyhow!("Missing access token."))
    }

    pub async fn fetch_my_channels(&self) -> anyhow::Result<Vec<AuthenticatedChannel>> {
        let response = self
            .http
            .get("https://www.googleapis.com/youtube/v3/channels")
            .query(&[("part", "snippet"), ("mine", "true")])
            .bearer_auth(self.access_token().await?)
            .send()
            .await?
            .error_for_status()?
            .json::<ChannelsListResponse>()
            .await?;

        Ok(response
            .items
            .unwrap_or_default()
            .into_iter()
            .filter_map(|item| {
                Some(AuthenticatedChannel {
                    id: item.id?,
                    title: item.snippet?.title?,
                })
            })
            .collect())
    }

    pub async fn list_channel_videos(&self, limit: usize) -> anyhow::Result<Vec<ChannelVideo>> {
        let uploads_playlist_id = self.get_uploads_playlist_id().await?;
        let stubs = self
            .list_playlist_video_stubs(&uploads_playlist_id, limit)
            .await?;

        if stubs.is_empty() {
            return Ok(vec![]);
        }

        let video_ids: Vec<String> = stubs.iter().map(|stub| stub.id.clone()).collect();
        let statuses = self.fetch_video_statuses(&video_ids).await?;
        let playlist_map = self
            .build_video_playlist_map(&video_ids, Some(&uploads_playlist_id))
            .await?;

        Ok(stubs
            .into_iter()
            .map(|stub| {
                let status = statuses.get(&stub.id);
                ChannelVideo {
                    id: stub.id.clone(),
                    title: stub.title,
                    uploaded_at: stub.uploaded_at,
                    privacy_status: status
                        .map(|value| value.privacy_status.clone())
                        .unwrap_or_else(|| "unknown".to_string()),
                    playlists: playlist_map.get(&stub.id).cloned().unwrap_or_default(),
                    publish_at: status.and_then(|value| value.publish_at.clone()),
                }
            })
            .collect())
    }

    async fn build_video_playlist_map(
        &self,
        video_ids: &[String],
        exclude_playlist_id: Option<&str>,
    ) -> anyhow::Result<std::collections::HashMap<String, Vec<String>>> {
        use std::collections::{HashMap, HashSet};

        let target_ids: HashSet<&str> = video_ids.iter().map(|id| id.as_str()).collect();
        if target_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let mut map: HashMap<String, Vec<String>> = HashMap::new();
        let my_playlists = self.list_my_playlists().await?;

        for playlist in my_playlists {
            if exclude_playlist_id == Some(playlist.id.as_str()) {
                continue;
            }

            let contained_ids = self.list_all_playlist_video_ids(&playlist.id).await?;
            for video_id in contained_ids {
                if target_ids.contains(video_id.as_str()) {
                    map.entry(video_id)
                        .or_default()
                        .push(playlist.title.clone());
                }
            }
        }

        for titles in map.values_mut() {
            titles.sort();
            titles.dedup();
        }

        Ok(map)
    }

    async fn list_all_playlist_video_ids(&self, playlist_id: &str) -> anyhow::Result<Vec<String>> {
        let mut video_ids = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let mut query = vec![
                ("part", "snippet".to_string()),
                ("playlistId", playlist_id.to_string()),
                ("maxResults", "50".to_string()),
            ];
            if let Some(token) = &page_token {
                query.push(("pageToken", token.clone()));
            }

            let response = self
                .http
                .get("https://www.googleapis.com/youtube/v3/playlistItems")
                .query(&query)
                .bearer_auth(self.access_token().await?)
                .send()
                .await?
                .error_for_status()?
                .json::<PlaylistItemsResponse>()
                .await?;

            for item in response.items.unwrap_or_default() {
                if let Some(video_id) = item
                    .snippet
                    .and_then(|snippet| snippet.resource_id)
                    .and_then(|resource| resource.video_id)
                {
                    video_ids.push(video_id);
                }
            }

            page_token = response.next_page_token;
            if page_token.is_none() {
                break;
            }
        }

        Ok(video_ids)
    }

    async fn get_uploads_playlist_id(&self) -> anyhow::Result<String> {
        let response = self
            .http
            .get("https://www.googleapis.com/youtube/v3/channels")
            .query(&[("part", "contentDetails"), ("mine", "true")])
            .bearer_auth(self.access_token().await?)
            .send()
            .await?
            .error_for_status()?
            .json::<ChannelsListResponse>()
            .await?;

        response
            .items
            .and_then(|items| items.into_iter().next())
            .and_then(|item| item.content_details)
            .and_then(|details| details.related_playlists)
            .and_then(|playlists| playlists.uploads)
            .ok_or_else(|| {
                anyhow::anyhow!("No channel associated with the current token.")
            })
    }

    async fn list_playlist_video_stubs(
        &self,
        playlist_id: &str,
        limit: usize,
    ) -> anyhow::Result<Vec<PlaylistVideoStub>> {
        let mut stubs = Vec::new();
        let mut page_token: Option<String> = None;

        while stubs.len() < limit {
            let max_results = std::cmp::min(50, limit - stubs.len());
            let mut query = vec![
                ("part", "snippet".to_string()),
                ("playlistId", playlist_id.to_string()),
                ("maxResults", max_results.to_string()),
            ];
            if let Some(token) = &page_token {
                query.push(("pageToken", token.clone()));
            }

            let response = self
                .http
                .get("https://www.googleapis.com/youtube/v3/playlistItems")
                .query(&query)
                .bearer_auth(self.access_token().await?)
                .send()
                .await?
                .error_for_status()?
                .json::<PlaylistItemsResponse>()
                .await?;

            for item in response.items.unwrap_or_default() {
                let snippet = match item.snippet {
                    Some(value) => value,
                    None => continue,
                };
                let video_id = snippet.resource_id.and_then(|value| value.video_id);
                let title = snippet.title;
                let uploaded_at = snippet.published_at;
                if let (Some(id), Some(title), Some(uploaded_at)) = (video_id, title, uploaded_at) {
                    stubs.push(PlaylistVideoStub {
                        id,
                        title,
                        uploaded_at,
                    });
                    if stubs.len() >= limit {
                        break;
                    }
                }
            }

            page_token = response.next_page_token;
            if page_token.is_none() {
                break;
            }
        }

        Ok(stubs)
    }

    async fn fetch_video_statuses(
        &self,
        video_ids: &[String],
    ) -> anyhow::Result<std::collections::HashMap<String, VideoStatusInfo>> {
        let mut statuses = std::collections::HashMap::new();

        for chunk in video_ids.chunks(50) {
            let response = self
                .http
                .get("https://www.googleapis.com/youtube/v3/videos")
                .query(&[("part", "status"), ("id", &chunk.join(","))])
                .bearer_auth(self.access_token().await?)
                .send()
                .await?
                .error_for_status()?
                .json::<VideosListResponse>()
                .await?;

            for item in response.items.unwrap_or_default() {
                if let (Some(id), Some(status)) = (item.id, item.status) {
                    if let Some(privacy_status) = status.privacy_status {
                        statuses.insert(
                            id,
                            VideoStatusInfo {
                                privacy_status,
                                publish_at: status.publish_at,
                            },
                        );
                    }
                }
            }
        }

        Ok(statuses)
    }

    pub async fn list_my_playlists(&self) -> anyhow::Result<Vec<PlaylistSummary>> {
        let mut playlists = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let mut query = vec![
                ("part", "snippet".to_string()),
                ("mine", "true".to_string()),
                ("maxResults", "50".to_string()),
            ];
            if let Some(token) = &page_token {
                query.push(("pageToken", token.clone()));
            }

            let response = self
                .http
                .get("https://www.googleapis.com/youtube/v3/playlists")
                .query(&query)
                .bearer_auth(self.access_token().await?)
                .send()
                .await?
                .error_for_status()?
                .json::<PlaylistsListResponse>()
                .await?;

            for item in response.items.unwrap_or_default() {
                if let (Some(id), Some(title)) = (item.id, item.snippet.and_then(|s| s.title)) {
                    playlists.push(PlaylistSummary { id, title });
                }
            }

            page_token = response.next_page_token;
            if page_token.is_none() {
                break;
            }
        }

        playlists.sort_by(|a, b| a.title.cmp(&b.title));
        Ok(playlists)
    }

    pub async fn list_video_categories(
        &self,
        region_code: &str,
        hl: Option<&str>,
    ) -> anyhow::Result<Vec<VideoCategory>> {
        let mut query = vec![
            ("part", "snippet".to_string()),
            ("regionCode", region_code.to_string()),
        ];
        if let Some(hl) = hl {
            query.push(("hl", hl.to_string()));
        }

        let response = self
            .http
            .get("https://www.googleapis.com/youtube/v3/videoCategories")
            .query(&query)
            .bearer_auth(self.access_token().await?)
            .send()
            .await?
            .error_for_status()?
            .json::<VideoCategoriesResponse>()
            .await?;

        let mut categories = response
            .items
            .unwrap_or_default()
            .into_iter()
            .filter_map(|item| {
                let snippet = item.snippet?;
                Some(VideoCategory {
                    id: item.id?,
                    title: snippet.title?,
                    assignable: snippet.assignable.unwrap_or(false),
                })
            })
            .collect::<Vec<_>>();

        categories.sort_by_key(|category| category.id.parse::<u32>().unwrap_or(0));
        Ok(categories)
    }

    pub async fn add_video_to_playlist(
        &self,
        video_id: &str,
        playlist_id: &str,
    ) -> anyhow::Result<()> {
        #[derive(serde::Serialize)]
        struct Body<'a> {
            snippet: Snippet<'a>,
        }

        #[derive(serde::Serialize)]
        struct Snippet<'a> {
            playlistId: &'a str,
            resourceId: ResourceId<'a>,
        }

        #[derive(serde::Serialize)]
        struct ResourceId<'a> {
            kind: &'static str,
            videoId: &'a str,
        }

        self.http
            .post("https://www.googleapis.com/youtube/v3/playlistItems")
            .query(&[("part", "snippet")])
            .bearer_auth(self.access_token().await?)
            .json(&Body {
                snippet: Snippet {
                    playlistId: playlist_id,
                    resourceId: ResourceId {
                        kind: "youtube#video",
                        videoId: video_id,
                    },
                },
            })
            .send()
            .await?
            .error_for_status()?;

        Ok(())
    }

    pub async fn upload_scheduled_video<F>(
        &self,
        file_path: &str,
        metadata: &VideoMetadata,
        publish_at_utc: &str,
        mut on_progress: F,
    ) -> anyhow::Result<String>
    where
        F: FnMut(String),
    {
        #[derive(serde::Serialize)]
        struct RequestBody<'a> {
            snippet: Snippet<'a>,
            status: Status<'a>,
        }

        #[derive(serde::Serialize)]
        struct Snippet<'a> {
            title: &'a str,
            description: &'a str,
            tags: &'a [String],
            categoryId: &'a str,
            defaultLanguage: &'a str,
        }

        #[derive(serde::Serialize)]
        struct Status<'a> {
            privacyStatus: &'static str,
            publishAt: &'a str,
            selfDeclaredMadeForKids: bool,
        }

        let body = RequestBody {
            snippet: Snippet {
                title: &metadata.title,
                description: &metadata.description,
                tags: &metadata.tags,
                categoryId: &metadata.category_id,
                defaultLanguage: &metadata.default_language,
            },
            status: Status {
                privacyStatus: "private",
                publishAt: publish_at_utc,
                selfDeclaredMadeForKids: false,
            },
        };

        let init_response = self
            .http
            .post("https://www.googleapis.com/upload/youtube/v3/videos")
            .query(&[("uploadType", "resumable"), ("part", "snippet,status")])
            .bearer_auth(self.access_token().await?)
            .header("X-Upload-Content-Type", "video/*")
            .json(&body)
            .send()
            .await?
            .error_for_status()?;

        let upload_url = init_response
            .headers()
            .get("location")
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| anyhow::anyhow!("YouTube upload URL was not returned."))?
            .to_string();

        let mut file = File::open(Path::new(file_path)).await?;
        let total_size = file.metadata().await?.len();
        file.seek(SeekFrom::Start(0)).await?;

        let mut uploaded = 0u64;
        let chunk_size = 8 * 1024 * 1024;
        let mut buffer = vec![0u8; chunk_size as usize];

        while uploaded < total_size {
            let to_read = std::cmp::min(chunk_size, total_size - uploaded) as usize;
            let read = file.read(&mut buffer[..to_read]).await?;
            if read == 0 {
                break;
            }

            let start = uploaded;
            let end = uploaded + read as u64 - 1;
            let content_range = format!("bytes {start}-{end}/{total_size}");

            let response = if end + 1 >= total_size {
                self.http
                    .put(&upload_url)
                    .header("Content-Length", read.to_string())
                    .header("Content-Range", content_range)
                    .body(buffer[..read].to_vec())
                    .send()
                    .await?
            } else {
                self.http
                    .put(&upload_url)
                    .header("Content-Length", read.to_string())
                    .header("Content-Range", content_range)
                    .body(buffer[..read].to_vec())
                    .send()
                    .await?
            };

            uploaded += read as u64;
            let percent = ((uploaded as f64 / total_size as f64) * 100.0) as u32;
            on_progress(format!("Upload progress: {percent}%"));

            if response.status().is_success() {
                #[derive(Deserialize)]
                struct UploadResult {
                    id: Option<String>,
                }

                let result = response.json::<UploadResult>().await?;
                return result
                    .id
                    .ok_or_else(|| anyhow::anyhow!("YouTube API did not return a video ID."));
            }

            if response.status().as_u16() != 308 {
                let text = response.text().await.unwrap_or_default();
                anyhow::bail!("Upload failed: {text}");
            }
        }

        anyhow::bail!("Upload did not complete.")
    }
}

fn should_refresh(token: &TokenFile) -> bool {
    match token.expiry_date {
        Some(expiry) => expiry <= chrono::Utc::now().timestamp_millis() + 60_000,
        None => true,
    }
}

async fn refresh_access_token(
    oauth: &OAuthCredentials,
    token: &TokenFile,
) -> anyhow::Result<TokenFile> {
    let refresh_token = token
        .refresh_token
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Missing refresh token."))?;

    let client = Client::new();
    let response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", oauth.client_id.as_str()),
            ("client_secret", oauth.client_secret.as_str()),
            ("refresh_token", refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await?
        .error_for_status()?
        .json::<TokenResponse>()
        .await?;

    Ok(TokenFile {
        access_token: Some(response.access_token),
        refresh_token: token.refresh_token.clone(),
        scope: response.scope.or_else(|| token.scope.clone()),
        token_type: response.token_type.or_else(|| token.token_type.clone()),
        expiry_date: Some(
            chrono::Utc::now().timestamp_millis() + response.expires_in * 1000,
        ),
    })
}
