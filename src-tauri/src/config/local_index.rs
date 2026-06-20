use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::config::paths::INDEX_FILENAME;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadRecord {
    pub filename: String,
    pub relative_path: String,
    pub video_id: String,
    pub publish_at: String,
    pub uploaded_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct IndexData {
    #[serde(default)]
    uploads: Vec<UploadRecord>,
}

fn index_path(upload_dir: &Path) -> PathBuf {
    upload_dir.join(INDEX_FILENAME)
}

pub struct UploadIndex {
    records: HashMap<String, UploadRecord>,
}

impl UploadIndex {
    pub async fn load(upload_dir: &Path) -> anyhow::Result<Self> {
        let path = index_path(upload_dir);
        let data = match tokio::fs::read_to_string(&path).await {
            Ok(raw) => serde_json::from_str::<IndexData>(&raw).unwrap_or_default(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => IndexData::default(),
            Err(error) => return Err(error.into()),
        };

        let mut records = HashMap::new();
        for record in data.uploads {
            records.insert(record.relative_path.clone(), record);
        }

        Ok(Self { records })
    }

    pub fn has(&self, relative_path: &str) -> bool {
        self.records.contains_key(relative_path)
    }

    pub fn get_all(&self) -> Vec<UploadRecord> {
        let mut records: Vec<_> = self.records.values().cloned().collect();
        records.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
        records
    }

    pub async fn mark_uploaded(
        &mut self,
        upload_dir: &Path,
        record: UploadRecord,
    ) -> anyhow::Result<()> {
        self.records.insert(record.relative_path.clone(), record);
        let mut uploads = self.get_all();
        uploads.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
        let data = IndexData { uploads };
        tokio::fs::write(index_path(upload_dir), serde_json::to_string_pretty(&data)?).await?;
        Ok(())
    }
}
