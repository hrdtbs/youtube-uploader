use std::path::Path;

use walkdir::WalkDir;

const VIDEO_EXTENSIONS: [&str; 4] = [".mp4", ".mov", ".mkv", ".webm"];

#[derive(Debug, Clone)]
pub struct VideoFile {
    pub absolute_path: String,
    pub relative_path: String,
}

fn is_video_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    VIDEO_EXTENSIONS.iter().any(|ext| lower.ends_with(ext))
}

pub fn list_video_files(root_dir: &Path, recursive: bool) -> anyhow::Result<Vec<VideoFile>> {
    if !root_dir.is_dir() {
        anyhow::bail!("Video directory not found: {}", root_dir.display());
    }

    let mut results = Vec::new();
    let walker = if recursive {
        WalkDir::new(root_dir)
    } else {
        WalkDir::new(root_dir).max_depth(1)
    };

    for entry in walker.into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !is_video_file(name) {
            continue;
        }

        let relative = path
            .strip_prefix(root_dir)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");

        results.push(VideoFile {
            absolute_path: path.to_string_lossy().to_string(),
            relative_path: relative,
        });
    }

    results.sort_by(|a, b| {
        a.relative_path
            .to_ascii_lowercase()
            .cmp(&b.relative_path.to_ascii_lowercase())
    });

    Ok(results)
}
