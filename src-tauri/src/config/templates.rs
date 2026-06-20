use std::path::Path;

use crate::youtube::types::{TemplateConfig, VideoMetadata};

pub fn title_from_filename(file_path: &Path) -> String {
    let name = file_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("video");
    Path::new(name)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(name)
        .to_string()
}

pub fn apply_template(base_title: &str, template: &TemplateConfig) -> VideoMetadata {
    let title = if let Some(title_template) = &template.title {
        title_template.replace("{{title}}", base_title)
    } else {
        base_title.to_string()
    };

    let description = template.description.replace("{{title}}", base_title);

    VideoMetadata {
        title,
        description,
        tags: template.tags.clone(),
        category_id: template.category_id.clone(),
        default_language: template.default_language.clone(),
    }
}

pub fn build_metadata(file_path: &Path, template: &TemplateConfig) -> VideoMetadata {
    let title = title_from_filename(file_path);
    apply_template(&title, template)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_title_placeholder() {
        let template = TemplateConfig {
            title: Some("【新曲】{{title}}".to_string()),
            description: "{{title}} をお楽しみください。".to_string(),
            tags: vec!["music".to_string()],
            category_id: "10".to_string(),
            default_language: "ja".to_string(),
        };

        let metadata = apply_template("My Song", &template);
        assert_eq!(metadata.title, "【新曲】My Song");
        assert_eq!(metadata.description, "My Song をお楽しみください。");
    }
}
