use crate::paths;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ArtifactRecord {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) file_path: String,
    pub(crate) conversation_id: String,
    pub(crate) conversation_title: String,
    pub(crate) message_id: String,
    pub(crate) created_at: String,
    pub(crate) content_length: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArtifactContent {
    pub(crate) content: String,
    pub(crate) format: String,
    pub(crate) title: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct ConversationRecord {
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    #[serde(alias = "workspacePath")]
    workspace_path: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct MessageRecord {
    #[serde(default)]
    id: String,
    #[serde(default)]
    #[serde(alias = "conversationId")]
    conversation_id: String,
    #[serde(default)]
    #[serde(alias = "createdAt")]
    created_at: String,
    #[serde(default)]
    #[serde(rename = "toolCalls", alias = "tool_calls")]
    tool_calls: Option<Value>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct DesktopDb {
    #[serde(default)]
    conversations: Vec<ConversationRecord>,
    #[serde(default)]
    messages: Vec<MessageRecord>,
}

fn db_path() -> Result<PathBuf, String> {
    Ok(paths::desktop_config_root()?.join("cloai-desktop.json"))
}

fn read_db() -> Result<DesktopDb, String> {
    let db_path = db_path()?;
    if !db_path.exists() {
        return Ok(DesktopDb::default());
    }

    let raw = fs::read_to_string(&db_path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn artifact_tool_calls(message: &MessageRecord) -> Vec<Value> {
    message
        .tool_calls
        .as_ref()
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn is_renderable_html(content: &str) -> bool {
    let trimmed = content
        .trim_start()
        .chars()
        .take(100)
        .collect::<String>()
        .to_lowercase();
    trimmed.contains("<!doctype")
        || trimmed.contains("<html")
        || trimmed.contains("<head")
        || trimmed.contains("<body")
}

fn allowed_workspace_roots(app: &AppHandle, db: &DesktopDb) -> Result<Vec<PathBuf>, String> {
    let mut roots = vec![paths::resolve_workspace_dir(app)?];
    for conversation in &db.conversations {
        if !conversation.workspace_path.trim().is_empty() {
            roots.push(PathBuf::from(&conversation.workspace_path));
        }
    }
    Ok(roots)
}

fn path_is_within_roots(path: &Path, roots: &[PathBuf]) -> bool {
    let Ok(resolved) = path.canonicalize() else {
        return false;
    };

    roots.iter().any(|root| {
        root.canonicalize()
            .map(|canonical_root| resolved.starts_with(canonical_root))
            .unwrap_or(false)
    })
}

pub(crate) fn get_artifacts(_app: &AppHandle) -> Result<Vec<ArtifactRecord>, String> {
    let db = read_db()?;
    let mut artifacts = Vec::new();

    for message in &db.messages {
        if message.conversation_id.trim().is_empty() {
            continue;
        }
        for tool_call in artifact_tool_calls(message) {
            let Some(name) = tool_call.get("name").and_then(Value::as_str) else {
                continue;
            };
            if name != "Write" {
                continue;
            }
            if tool_call.get("status").and_then(Value::as_str) == Some("error") {
                continue;
            }

            let file_path = tool_call
                .get("input")
                .and_then(|value| value.get("file_path"))
                .and_then(Value::as_str);
            let Some(file_path) = file_path else {
                continue;
            };

            let path = PathBuf::from(file_path);
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };
            if !is_renderable_html(&content) {
                continue;
            }

            let conversation_title = db
                .conversations
                .iter()
                .find(|conversation| conversation.id == message.conversation_id)
                .map(|conversation| {
                    if conversation.title.trim().is_empty() {
                        "Untitled".to_string()
                    } else {
                        conversation.title.clone()
                    }
                })
                .unwrap_or_else(|| "Untitled".to_string());

            artifacts.push(ArtifactRecord {
                id: tool_call
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                title: path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("artifact.html")
                    .to_string(),
                file_path: path.to_string_lossy().to_string(),
                conversation_id: message.conversation_id.clone(),
                conversation_title,
                message_id: message.id.clone(),
                created_at: message.created_at.clone(),
                content_length: content.len(),
            });
        }
    }

    artifacts.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    let mut seen = std::collections::BTreeSet::new();
    artifacts.retain(|artifact| seen.insert(artifact.file_path.clone()));
    Ok(artifacts)
}

pub(crate) fn get_artifact_content(
    app: &AppHandle,
    file_path: String,
) -> Result<ArtifactContent, String> {
    if file_path.trim().is_empty() {
        return Err("Missing path".to_string());
    }

    let db = read_db()?;
    let roots = allowed_workspace_roots(app, &db)?;
    let path = PathBuf::from(&file_path);
    if !path_is_within_roots(&path, &roots) {
        return Err("Access denied".to_string());
    }

    let content = fs::read_to_string(&path).map_err(|_| "File not found".to_string())?;
    Ok(ArtifactContent {
        content,
        format: "html".to_string(),
        title: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("artifact.html")
            .to_string(),
    })
}
