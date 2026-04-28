use crate::paths;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadFilePayload {
    #[serde(default, alias = "file_path")]
    pub(crate) file_path: Option<String>,
    #[serde(default, alias = "file_name")]
    pub(crate) file_name: Option<String>,
    #[serde(default, alias = "mime_type")]
    pub(crate) mime_type: Option<String>,
    #[serde(default, alias = "conversation_id")]
    pub(crate) conversation_id: Option<String>,
    #[serde(default, alias = "dataBase64", alias = "data_base64")]
    pub(crate) data: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadResult {
    pub(crate) file_id: String,
    pub(crate) file_name: String,
    pub(crate) file_type: String,
    pub(crate) mime_type: String,
    pub(crate) local_path: String,
    pub(crate) size: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadPathResult {
    pub(crate) local_path: String,
    pub(crate) folder: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadRawResult {
    pub(crate) file_id: String,
    pub(crate) mime_type: String,
    pub(crate) base64: String,
    pub(crate) size: u64,
}

fn workspace_root() -> Result<PathBuf, String> {
    paths::default_workspace_dir()
}

fn upload_file_name(source: &Path, override_name: Option<String>) -> Result<String, String> {
    if let Some(name) = override_name.filter(|name| !name.trim().is_empty()) {
        return Path::new(&name)
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_string)
            .ok_or_else(|| "Invalid file name".to_string());
    }

    source
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .ok_or_else(|| "Invalid file path".to_string())
}

fn sanitized_file_name(file_name: String) -> Result<String, String> {
    Path::new(&file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| "Invalid file name".to_string())
}

fn timestamped_file_name(file_name: &str) -> String {
    format!("{}-{}", chrono::Utc::now().timestamp_millis(), file_name)
}

fn decode_base64_payload(value: &str) -> Result<Vec<u8>, String> {
    let encoded = value
        .split_once(',')
        .filter(|(prefix, _)| prefix.contains("base64"))
        .map(|(_, data)| data)
        .unwrap_or(value);

    base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| error.to_string())
}

fn infer_mime_type(path: &Path) -> String {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("pdf") => "application/pdf",
        Some("txt") => "text/plain",
        Some("md") => "text/markdown",
        Some("json") => "application/json",
        Some("csv") => "text/csv",
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("js") | Some("mjs") | Some("cjs") => "text/javascript",
        Some("xml") => "application/xml",
        Some("yaml") | Some("yml") => "application/x-yaml",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn upload_type(mime_type: &str) -> String {
    if mime_type.starts_with("image/") {
        "image"
    } else if mime_type.starts_with("text/") {
        "text"
    } else {
        "document"
    }
    .to_string()
}

fn upload_dirs(conversation_id: Option<&str>) -> Result<Vec<PathBuf>, String> {
    let root = workspace_root()?;
    let mut dirs = Vec::new();
    let mut seen = HashSet::new();

    if let Some(conversation_id) = conversation_id.filter(|value| !value.trim().is_empty()) {
        let dir = root.join(conversation_id).join(".uploads");
        seen.insert(dir.clone());
        dirs.push(dir);
    }

    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let uploads_dir = entry.path().join(".uploads");
            if uploads_dir.exists() && seen.insert(uploads_dir.clone()) {
                dirs.push(uploads_dir);
            }
        }
    }

    Ok(dirs)
}

fn find_upload_file(file_id: &str, conversation_id: Option<&str>) -> Result<PathBuf, String> {
    for dir in upload_dirs(conversation_id)? {
        let exact = dir.join(file_id);
        if exact.exists() && exact.is_file() {
            return Ok(exact);
        }

        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
                    continue;
                };
                if name == file_id || name.contains(file_id) {
                    return Ok(path);
                }
            }
        }
    }

    Err("File not found".to_string())
}

pub(crate) fn upload_file(payload: UploadFilePayload) -> Result<UploadResult, String> {
    let source = payload
        .file_path
        .as_ref()
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from);
    if let Some(source) = &source {
        if !source.exists() || !source.is_file() {
            return Err("No file".to_string());
        }
    } else if payload.data.as_deref().unwrap_or("").is_empty() {
        return Err("No file".to_string());
    }

    let file_name = if let Some(source) = &source {
        upload_file_name(source, payload.file_name)?
    } else {
        sanitized_file_name(
            payload
                .file_name
                .ok_or_else(|| "Invalid file name".to_string())?,
        )?
    };
    let conversation_id = payload
        .conversation_id
        .filter(|conversation_id| !conversation_id.trim().is_empty())
        .unwrap_or_else(|| "temp".to_string());
    let upload_dir = workspace_root()?.join(conversation_id).join(".uploads");
    fs::create_dir_all(&upload_dir).map_err(|error| error.to_string())?;

    let destination = upload_dir.join(timestamped_file_name(&file_name));
    if let Some(source) = source {
        fs::copy(&source, &destination).map_err(|error| error.to_string())?;
    } else {
        let bytes = decode_base64_payload(&payload.data.unwrap_or_default())?;
        fs::write(&destination, bytes).map_err(|error| error.to_string())?;
    }
    let metadata = fs::metadata(&destination).map_err(|error| error.to_string())?;
    if metadata.len() == 0 {
        let _ = fs::remove_file(&destination);
        return Err("File upload incomplete (0 bytes on disk). Please retry.".to_string());
    }

    let mime_type = payload
        .mime_type
        .filter(|mime_type| !mime_type.trim().is_empty())
        .unwrap_or_else(|| infer_mime_type(&destination));
    let file_id = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid upload path".to_string())?
        .to_string();

    Ok(UploadResult {
        file_id,
        file_name,
        file_type: upload_type(&mime_type),
        mime_type,
        local_path: destination.to_string_lossy().to_string(),
        size: metadata.len(),
    })
}

pub(crate) fn get_upload_path(
    file_id: String,
    conversation_id: Option<String>,
) -> Result<UploadPathResult, String> {
    let path = find_upload_file(&file_id, conversation_id.as_deref())?;
    let folder = path
        .parent()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(UploadPathResult {
        local_path: path.to_string_lossy().to_string(),
        folder,
    })
}

pub(crate) fn read_upload_raw(
    file_id: String,
    conversation_id: Option<String>,
) -> Result<UploadRawResult, String> {
    let path = find_upload_file(&file_id, conversation_id.as_deref())?;
    let bytes = fs::read(&path).map_err(|error| error.to_string())?;
    let mime_type = infer_mime_type(&path);

    Ok(UploadRawResult {
        file_id,
        mime_type,
        base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        size: bytes.len() as u64,
    })
}

pub(crate) fn delete_upload(
    file_id: String,
    conversation_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let path = find_upload_file(&file_id, conversation_id.as_deref())?;
    fs::remove_file(path).map_err(|error| error.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}
