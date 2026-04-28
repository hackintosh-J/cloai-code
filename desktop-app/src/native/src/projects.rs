use crate::conversations::ConversationRecord;
use crate::paths;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ProjectRecord {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) instructions: String,
    #[serde(alias = "workspacePath")]
    pub(crate) workspace_path: String,
    #[serde(alias = "isArchived")]
    pub(crate) is_archived: i64,
    #[serde(alias = "createdAt")]
    pub(crate) created_at: String,
    #[serde(alias = "updatedAt")]
    pub(crate) updated_at: String,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ProjectFileRecord {
    pub(crate) id: String,
    #[serde(alias = "projectId")]
    pub(crate) project_id: String,
    #[serde(alias = "fileName")]
    pub(crate) file_name: String,
    #[serde(alias = "filePath")]
    pub(crate) file_path: String,
    #[serde(alias = "fileSize")]
    pub(crate) file_size: i64,
    #[serde(alias = "mimeType")]
    pub(crate) mime_type: String,
    #[serde(default)]
    pub(crate) extracted_text: Option<String>,
    #[serde(alias = "createdAt")]
    pub(crate) created_at: String,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct MessageRecord {
    #[serde(default)]
    #[serde(alias = "conversationId")]
    conversation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct DesktopDb {
    #[serde(default)]
    conversations: Vec<ConversationRecord>,
    #[serde(default)]
    messages: Vec<MessageRecord>,
    #[serde(default)]
    projects: Vec<ProjectRecord>,
    #[serde(default)]
    project_files: Vec<ProjectFileRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ProjectSummary {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) instructions: String,
    pub(crate) workspace_path: String,
    pub(crate) is_archived: i64,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    pub(crate) file_count: usize,
    pub(crate) chat_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ProjectDetail {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) instructions: String,
    pub(crate) workspace_path: String,
    pub(crate) is_archived: i64,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    pub(crate) files: Vec<ProjectFileRecord>,
    pub(crate) conversations: Vec<ConversationRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateProjectPayload {
    pub(crate) name: String,
    pub(crate) description: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateProjectPayload {
    pub(crate) name: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) instructions: Option<String>,
    pub(crate) is_archived: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateProjectConversationPayload {
    pub(crate) title: Option<String>,
    pub(crate) model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadProjectFilePayload {
    #[serde(default, alias = "file_path")]
    pub(crate) file_path: Option<String>,
    #[serde(default, alias = "file_name")]
    pub(crate) file_name: Option<String>,
    #[serde(default, alias = "mime_type")]
    pub(crate) mime_type: Option<String>,
    #[serde(default, alias = "dataBase64", alias = "data_base64")]
    pub(crate) data: Option<String>,
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

fn write_db_unlocked(db: &DesktopDb) -> Result<(), String> {
    let body = serde_json::to_string_pretty(db).map_err(|error| error.to_string())?;
    paths::safe_write_file(&db_path()?, &body)?;
    Ok(())
}

fn with_db_mutation<T, F>(mutation: F) -> Result<T, String>
where
    F: FnOnce(&mut DesktopDb) -> Result<T, String>,
{
    let _guard = paths::desktop_db_lock()?;
    let mut db = read_db()?;
    let result = mutation(&mut db)?;
    write_db_unlocked(&db)?;
    Ok(result)
}

fn writable_workspace_root() -> Result<PathBuf, String> {
    Ok(paths::desktop_config_root()?.join("workspaces"))
}

fn ensure_project_dir(project_id: &str) -> Result<PathBuf, String> {
    let path = writable_workspace_root()?.join(format!("project-{}", project_id));
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn text_extension(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("txt")
            | Some("md")
            | Some("json")
            | Some("xml")
            | Some("yaml")
            | Some("yml")
            | Some("csv")
            | Some("html")
            | Some("css")
            | Some("js")
            | Some("ts")
            | Some("tsx")
            | Some("jsx")
            | Some("py")
            | Some("java")
            | Some("c")
            | Some("cpp")
            | Some("h")
            | Some("go")
            | Some("rs")
            | Some("rb")
            | Some("php")
            | Some("sql")
            | Some("sh")
            | Some("lua")
            | Some("r")
    )
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
        Some("ts") | Some("tsx") | Some("jsx") => "text/plain",
        Some("xml") => "application/xml",
        Some("yaml") | Some("yml") => "application/x-yaml",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn upload_file_name(source: &Path, override_name: Option<String>) -> Result<String, String> {
    if let Some(name) = override_name.filter(|name| !name.trim().is_empty()) {
        let file_name = Path::new(&name)
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Invalid file name".to_string())?
            .to_string();
        return Ok(file_name);
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

fn public_project_file(record: &ProjectFileRecord) -> ProjectFileRecord {
    ProjectFileRecord {
        extracted_text: None,
        ..record.clone()
    }
}

fn project_summary(db: &DesktopDb, project: &ProjectRecord) -> ProjectSummary {
    ProjectSummary {
        id: project.id.clone(),
        name: project.name.clone(),
        description: project.description.clone(),
        instructions: project.instructions.clone(),
        workspace_path: project.workspace_path.clone(),
        is_archived: project.is_archived,
        created_at: project.created_at.clone(),
        updated_at: project.updated_at.clone(),
        file_count: db
            .project_files
            .iter()
            .filter(|file| file.project_id == project.id)
            .count(),
        chat_count: db
            .conversations
            .iter()
            .filter(|conversation| conversation.project_id.as_deref() == Some(project.id.as_str()))
            .count(),
    }
}

pub(crate) fn list_projects() -> Result<Vec<ProjectSummary>, String> {
    let db = read_db()?;
    let mut projects: Vec<ProjectSummary> = db
        .projects
        .iter()
        .filter(|project| project.is_archived == 0)
        .map(|project| project_summary(&db, project))
        .collect();
    projects.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(projects)
}

pub(crate) fn create_project(payload: CreateProjectPayload) -> Result<ProjectRecord, String> {
    if payload.name.trim().is_empty() {
        return Err("Name required".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let workspace_path = ensure_project_dir(&id)?;
    let now = chrono::Utc::now().to_rfc3339();

    let project = ProjectRecord {
        id,
        name: payload.name.trim().to_string(),
        description: payload.description.unwrap_or_default().trim().to_string(),
        instructions: String::new(),
        workspace_path: workspace_path.to_string_lossy().to_string(),
        is_archived: 0,
        created_at: now.clone(),
        updated_at: now,
        extra: Map::new(),
    };

    with_db_mutation({
        let project = project.clone();
        move |db| {
            db.projects.push(project);
            Ok(())
        }
    })?;
    Ok(project)
}

pub(crate) fn get_project(id: String) -> Result<ProjectDetail, String> {
    let db = read_db()?;
    let project = db
        .projects
        .iter()
        .find(|project| project.id == id)
        .cloned()
        .ok_or_else(|| "Project not found".to_string())?;

    let mut files: Vec<ProjectFileRecord> = db
        .project_files
        .iter()
        .filter(|file| file.project_id == project.id)
        .cloned()
        .collect();
    files.sort_by(|left, right| right.created_at.cmp(&left.created_at));

    let mut conversations: Vec<ConversationRecord> = db
        .conversations
        .iter()
        .filter(|conversation| conversation.project_id.as_deref() == Some(project.id.as_str()))
        .cloned()
        .collect();
    conversations.sort_by(|left, right| right.created_at.cmp(&left.created_at));

    Ok(ProjectDetail {
        id: project.id,
        name: project.name,
        description: project.description,
        instructions: project.instructions,
        workspace_path: project.workspace_path,
        is_archived: project.is_archived,
        created_at: project.created_at,
        updated_at: project.updated_at,
        files,
        conversations,
    })
}

pub(crate) fn update_project(
    id: String,
    payload: UpdateProjectPayload,
) -> Result<ProjectRecord, String> {
    with_db_mutation(move |db| {
        let project = db
            .projects
            .iter_mut()
            .find(|project| project.id == id)
            .ok_or_else(|| "Project not found".to_string())?;

        if let Some(name) = payload.name {
            project.name = name.trim().to_string();
        }
        if let Some(description) = payload.description {
            project.description = description;
        }
        if let Some(instructions) = payload.instructions {
            project.instructions = instructions;
        }
        if let Some(is_archived) = payload.is_archived {
            project.is_archived = is_archived;
        }
        project.updated_at = chrono::Utc::now().to_rfc3339();

        Ok(project.clone())
    })
}

pub(crate) fn upload_project_file(
    project_id: String,
    payload: UploadProjectFilePayload,
) -> Result<ProjectFileRecord, String> {
    let project_workspace = {
        let db = read_db()?;
        db.projects
            .iter()
            .find(|project| project.id == project_id)
            .map(|project| project.workspace_path.clone())
            .ok_or_else(|| "Project not found".to_string())?
    };

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
        upload_file_name(source, payload.file_name.clone())?
    } else {
        sanitized_file_name(
            payload
                .file_name
                .clone()
                .ok_or_else(|| "Invalid file name".to_string())?,
        )?
    };
    let files_dir = PathBuf::from(&project_workspace).join("files");
    fs::create_dir_all(&files_dir).map_err(|error| error.to_string())?;
    let destination = files_dir.join(timestamped_file_name(&file_name));

    if let Some(source) = source {
        fs::copy(&source, &destination).map_err(|error| error.to_string())?;
    } else {
        let bytes = decode_base64_payload(&payload.data.unwrap_or_default())?;
        fs::write(&destination, bytes).map_err(|error| error.to_string())?;
    }
    let metadata = fs::metadata(&destination).map_err(|error| error.to_string())?;

    let extracted_text = if text_extension(Path::new(&file_name)) {
        fs::read_to_string(&destination).ok()
    } else {
        None
    };
    let mime_type = payload
        .mime_type
        .filter(|mime_type| !mime_type.trim().is_empty())
        .unwrap_or_else(|| infer_mime_type(Path::new(&file_name)));
    let now = chrono::Utc::now().to_rfc3339();

    let file_entry = ProjectFileRecord {
        id: Uuid::new_v4().to_string(),
        project_id: project_id.clone(),
        file_name,
        file_path: destination.to_string_lossy().to_string(),
        file_size: metadata.len() as i64,
        mime_type,
        extracted_text,
        created_at: now.clone(),
        extra: Map::new(),
    };

    with_db_mutation({
        let file_entry = file_entry.clone();
        let project_id = project_id.clone();
        let now = now.clone();
        move |db| {
            let project = db
                .projects
                .iter_mut()
                .find(|project| project.id == project_id)
                .ok_or_else(|| "Project not found".to_string())?;
            db.project_files.push(file_entry);
            project.updated_at = now;
            Ok(())
        }
    })?;
    Ok(public_project_file(&file_entry))
}

pub(crate) fn delete_project_file(project_id: String, file_id: String) -> Result<Value, String> {
    let file = with_db_mutation(move |db| {
        let file = db
            .project_files
            .iter()
            .find(|file| file.id == file_id && file.project_id == project_id)
            .cloned()
            .ok_or_else(|| "File not found".to_string())?;

        db.project_files.retain(|record| record.id != file.id);

        if let Some(project) = db
            .projects
            .iter_mut()
            .find(|project| project.id == project_id)
        {
            project.updated_at = chrono::Utc::now().to_rfc3339();
        }
        Ok(file)
    })?;
    if !file.file_path.is_empty() {
        let _ = fs::remove_file(&file.file_path);
    }
    Ok(serde_json::json!({ "success": true }))
}

pub(crate) fn delete_project(id: String) -> Result<Value, String> {
    let workspace_root = writable_workspace_root()?;
    let (files, conversation_ids) = with_db_mutation({
        let id = id.clone();
        move |db| {
            let files: Vec<ProjectFileRecord> = db
                .project_files
                .iter()
                .filter(|file| file.project_id == id)
                .cloned()
                .collect();
            db.project_files.retain(|file| file.project_id != id);

            let conversation_ids: Vec<String> = db
                .conversations
                .iter()
                .filter(|conversation| conversation.project_id.as_deref() == Some(id.as_str()))
                .map(|conversation| conversation.id.clone())
                .collect();
            db.messages
                .retain(|message| !conversation_ids.contains(&message.conversation_id));
            db.conversations
                .retain(|conversation| conversation.project_id.as_deref() != Some(id.as_str()));
            db.projects.retain(|project| project.id != id);
            Ok((files, conversation_ids))
        }
    })?;

    for file in &files {
        if !file.file_path.is_empty() {
            let _ = fs::remove_file(&file.file_path);
        }
    }
    for conversation_id in &conversation_ids {
        let _ = fs::remove_dir_all(workspace_root.join(conversation_id));
    }
    let _ = fs::remove_dir_all(workspace_root.join(format!("project-{}", id)));

    Ok(serde_json::json!({ "success": true }))
}

pub(crate) fn get_project_conversations(id: String) -> Result<Vec<ConversationRecord>, String> {
    let db = read_db()?;
    let mut conversations: Vec<ConversationRecord> = db
        .conversations
        .iter()
        .filter(|conversation| conversation.project_id.as_deref() == Some(id.as_str()))
        .cloned()
        .collect();
    conversations.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(conversations)
}

pub(crate) fn create_project_conversation(
    project_id: String,
    payload: CreateProjectConversationPayload,
) -> Result<ConversationRecord, String> {
    let db = read_db()?;
    let project = db
        .projects
        .iter()
        .find(|project| project.id == project_id)
        .cloned()
        .ok_or_else(|| "Project not found".to_string())?;

    let id = Uuid::new_v4().to_string();
    let workspace_path = writable_workspace_root()?.join(&id);
    fs::create_dir_all(&workspace_path).map_err(|error| error.to_string())?;

    let project_files: Vec<ProjectFileRecord> = db
        .project_files
        .iter()
        .filter(|file| file.project_id == project.id)
        .cloned()
        .collect();
    for file in project_files {
        let source = PathBuf::from(&file.file_path);
        if source.exists() {
            let _ = fs::copy(source, workspace_path.join(&file.file_name));
        }
    }

    let conversation = ConversationRecord {
        id,
        title: payload
            .title
            .unwrap_or_else(|| "New Conversation".to_string()),
        model: payload
            .model
            .unwrap_or_else(|| "claude-sonnet-4-6".to_string()),
        workspace_path: workspace_path.to_string_lossy().to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        research_mode: false,
        project_id: Some(project.id.clone()),
        claude_session_id: None,
        pending_resume_at: None,
        extra: Map::new(),
    };

    with_db_mutation({
        let project_id = project.id.clone();
        let conversation = conversation.clone();
        move |db| {
            db.conversations.push(conversation);
            if let Some(project) = db
                .projects
                .iter_mut()
                .find(|project| project.id == project_id)
            {
                project.updated_at = chrono::Utc::now().to_rfc3339();
            }
            Ok(())
        }
    })?;
    Ok(conversation)
}
