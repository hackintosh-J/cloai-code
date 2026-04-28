use crate::paths;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ConversationRecord {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) model: String,
    #[serde(alias = "workspacePath")]
    pub(crate) workspace_path: String,
    #[serde(alias = "createdAt")]
    pub(crate) created_at: String,
    #[serde(default)]
    pub(crate) research_mode: bool,
    #[serde(default)]
    pub(crate) project_id: Option<String>,
    #[serde(default)]
    pub(crate) claude_session_id: Option<String>,
    #[serde(default, rename = "pendingResumeAt", alias = "pending_resume_at")]
    pub(crate) pending_resume_at: Option<String>,
    #[serde(flatten)]
    pub(crate) extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct MessageRecord {
    id: String,
    #[serde(alias = "conversationId")]
    conversation_id: String,
    role: String,
    content: String,
    #[serde(alias = "createdAt")]
    created_at: String,
    #[serde(default)]
    attachments: Option<Value>,
    #[serde(default, rename = "toolCalls", alias = "tool_calls")]
    tool_calls: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    is_summary: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    is_compact_boundary: Option<bool>,
    #[serde(default, rename = "engineUuidSynced", alias = "engine_uuid_synced")]
    engine_uuid_synced: bool,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct ProjectRecord {
    id: String,
    name: String,
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
    project_files: Vec<Value>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ConversationWorkspacePayload {
    pub(crate) mode: String,
    #[serde(default, alias = "folderPath")]
    pub(crate) folder_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct CreateConversationPayload {
    pub(crate) title: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) project_id: Option<String>,
    pub(crate) research_mode: Option<bool>,
    pub(crate) workspace: Option<ConversationWorkspacePayload>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct UpdateConversationPayload {
    pub(crate) title: Option<String>,
    pub(crate) model: Option<String>,
    #[serde(default)]
    pub(crate) project_id: Option<Option<String>>,
    pub(crate) research_mode: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ConversationSummary {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) model: String,
    pub(crate) workspace_path: String,
    pub(crate) created_at: String,
    pub(crate) research_mode: bool,
    pub(crate) project_id: Option<String>,
    pub(crate) project_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ConversationDetail {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) model: String,
    pub(crate) workspace_path: String,
    pub(crate) created_at: String,
    pub(crate) research_mode: bool,
    pub(crate) project_id: Option<String>,
    pub(crate) claude_session_id: Option<String>,
    pub(crate) pending_resume_at: Option<String>,
    pub(crate) messages: Vec<Value>,
}

#[derive(Debug, Serialize)]
pub(crate) struct ConversationMutationResult {
    pub(crate) success: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct ContextSize {
    pub(crate) tokens: i64,
    pub(crate) limit: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreserveAttachmentsPayload {
    #[serde(default, alias = "preserve_attachment_ids")]
    pub(crate) preserve_attachment_ids: Vec<String>,
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

fn ensure_workspace_directory(path: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())?;
    Ok(path.to_path_buf())
}

fn effective_title(record: &ConversationRecord) -> String {
    if record.title.trim().is_empty() {
        "New Conversation".to_string()
    } else {
        record.title.clone()
    }
}

fn parse_message_content(raw: &str) -> String {
    if let Ok(parsed) = serde_json::from_str::<Value>(raw) {
        if let Some(items) = parsed.as_array() {
            return items
                .iter()
                .filter_map(|item| item.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("");
        }
        if let Some(text) = parsed.as_str() {
            return text.to_string();
        }
    }

    raw.to_string()
}

fn normalize_message(record: &MessageRecord) -> Value {
    let mut value = serde_json::json!({
        "id": record.id,
        "conversation_id": record.conversation_id,
        "role": record.role,
        "content": parse_message_content(&record.content),
        "created_at": record.created_at,
        "attachments": record.attachments,
        "toolCalls": record.tool_calls,
        "is_summary": record.is_summary,
        "is_compact_boundary": record.is_compact_boundary,
    });

    if let Value::Object(map) = &mut value {
        for (key, extra_value) in &record.extra {
            map.entry(key.clone())
                .or_insert_with(|| extra_value.clone());
        }
    }

    value
}

fn message_created_at_millis(message: &MessageRecord) -> i64 {
    chrono::DateTime::parse_from_rfc3339(&message.created_at)
        .map(|value| value.timestamp_millis())
        .unwrap_or(0)
}

fn queue_engine_rewind(
    conversation: &mut ConversationRecord,
    previous_message: Option<&MessageRecord>,
) {
    match previous_message {
        Some(message) if message.engine_uuid_synced => {
            conversation.pending_resume_at = Some(message.id.clone());
        }
        Some(_) | None => {
            conversation.pending_resume_at = None;
            conversation.claude_session_id = None;
        }
    }
}

fn preserve_attachments_noop(_db: &mut DesktopDb, _attachment_ids: &[String]) {
    // The legacy API accepted preserve_attachment_ids but did not mutate upload
    // files. Keep the payload for API compatibility without introducing new behavior.
}

fn estimate_token_count(text: &str) -> i64 {
    let char_estimate = ((text.chars().count() as f64) / 4.0).ceil() as i64;
    let word_estimate = text.split_whitespace().count() as i64;
    char_estimate.max(word_estimate).max(0)
}

pub(crate) fn list_conversations(
    project_id: Option<String>,
) -> Result<Vec<ConversationSummary>, String> {
    let db = read_db()?;
    let mut conversations: Vec<ConversationSummary> = db
        .conversations
        .iter()
        .filter(|conversation| match &project_id {
            Some(project_id) => conversation.project_id.as_deref() == Some(project_id.as_str()),
            None => true,
        })
        .map(|conversation| ConversationSummary {
            id: conversation.id.clone(),
            title: effective_title(conversation),
            model: conversation.model.clone(),
            workspace_path: conversation.workspace_path.clone(),
            created_at: conversation.created_at.clone(),
            research_mode: conversation.research_mode,
            project_id: conversation.project_id.clone(),
            project_name: conversation.project_id.as_ref().and_then(|project_id| {
                db.projects
                    .iter()
                    .find(|project| &project.id == project_id)
                    .map(|project| project.name.clone())
            }),
        })
        .collect();

    conversations.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(conversations)
}

pub(crate) fn get_conversation(id: String) -> Result<ConversationDetail, String> {
    let db = read_db()?;
    let conversation = db
        .conversations
        .iter()
        .find(|conversation| conversation.id == id)
        .cloned()
        .ok_or_else(|| "Conversation not found".to_string())?;

    let mut messages: Vec<MessageRecord> = db
        .messages
        .iter()
        .filter(|message| message.conversation_id == conversation.id)
        .cloned()
        .collect();
    messages.sort_by(|left, right| left.created_at.cmp(&right.created_at));
    let title = effective_title(&conversation);

    Ok(ConversationDetail {
        id: conversation.id,
        title,
        model: conversation.model,
        workspace_path: conversation.workspace_path,
        created_at: conversation.created_at,
        research_mode: conversation.research_mode,
        project_id: conversation.project_id,
        claude_session_id: conversation.claude_session_id,
        pending_resume_at: conversation.pending_resume_at,
        messages: messages.iter().map(normalize_message).collect(),
    })
}

pub(crate) fn create_conversation(
    _app: &AppHandle,
    payload: CreateConversationPayload,
) -> Result<ConversationSummary, String> {
    let id = Uuid::new_v4().to_string();

    let workspace_path = if let Some(workspace) = payload.workspace {
        if workspace.mode == "existing-folder" {
            let requested = workspace
                .folder_path
                .ok_or_else(|| "Workspace folder not found".to_string())?;
            let resolved = PathBuf::from(requested);
            if !resolved.exists() || !resolved.is_dir() {
                return Err("Workspace folder not found".to_string());
            }
            resolved
        } else {
            ensure_workspace_directory(&writable_workspace_root()?.join(&id))?
        }
    } else {
        ensure_workspace_directory(&writable_workspace_root()?.join(&id))?
    };

    let record = ConversationRecord {
        id: id.clone(),
        title: payload
            .title
            .unwrap_or_else(|| "New Conversation".to_string()),
        model: payload
            .model
            .unwrap_or_else(|| "claude-sonnet-4-6".to_string()),
        workspace_path: workspace_path.to_string_lossy().to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        research_mode: payload.research_mode.unwrap_or(false),
        project_id: payload.project_id,
        claude_session_id: None,
        pending_resume_at: None,
        extra: Map::new(),
    };

    with_db_mutation({
        let record = record.clone();
        move |db| {
            db.conversations.push(record);
            Ok(())
        }
    })?;
    let title = effective_title(&record);

    Ok(ConversationSummary {
        id: record.id,
        title,
        model: record.model,
        workspace_path: record.workspace_path,
        created_at: record.created_at,
        research_mode: record.research_mode,
        project_id: record.project_id,
        project_name: None,
    })
}

pub(crate) fn update_conversation(
    id: String,
    payload: UpdateConversationPayload,
) -> Result<ConversationSummary, String> {
    let (snapshot, project_name) = with_db_mutation(move |db| {
        let conversation = db
            .conversations
            .iter_mut()
            .find(|conversation| conversation.id == id)
            .ok_or_else(|| "Conversation not found".to_string())?;

        if let Some(title) = payload.title {
            conversation.title = title;
        }
        if let Some(model) = payload.model {
            conversation.model = model;
        }
        if let Some(project_id) = payload.project_id {
            conversation.project_id = project_id;
        }
        if let Some(research_mode) = payload.research_mode {
            conversation.research_mode = research_mode;
        }

        let snapshot = conversation.clone();
        let project_name = snapshot.project_id.as_ref().and_then(|project_id| {
            db.projects
                .iter()
                .find(|project| &project.id == project_id)
                .map(|project| project.name.clone())
        });
        Ok((snapshot, project_name))
    })?;
    let title = effective_title(&snapshot);

    Ok(ConversationSummary {
        id: snapshot.id,
        title,
        model: snapshot.model,
        workspace_path: snapshot.workspace_path,
        created_at: snapshot.created_at,
        research_mode: snapshot.research_mode,
        project_id: snapshot.project_id,
        project_name,
    })
}

pub(crate) fn delete_conversation(id: String) -> Result<Value, String> {
    let conversation = with_db_mutation(move |db| {
        let conversation = db
            .conversations
            .iter()
            .find(|conversation| conversation.id == id)
            .cloned()
            .ok_or_else(|| "Conversation not found".to_string())?;

        db.messages
            .retain(|message| message.conversation_id != conversation.id);
        db.conversations
            .retain(|record| record.id != conversation.id);
        Ok(conversation)
    })?;

    let workspace_root = writable_workspace_root()?;
    let workspace_path = PathBuf::from(&conversation.workspace_path);
    if workspace_path.starts_with(&workspace_root) {
        let _ = fs::remove_dir_all(workspace_path);
    }

    Ok(serde_json::json!({ "success": true }))
}

pub(crate) fn get_context_size(conversation_id: String) -> Result<ContextSize, String> {
    let db = read_db()?;
    let tokens = db
        .messages
        .iter()
        .filter(|message| message.conversation_id == conversation_id)
        .map(|message| estimate_token_count(&parse_message_content(&message.content)))
        .sum();

    Ok(ContextSize {
        tokens,
        limit: 200_000,
    })
}

pub(crate) fn delete_messages_from(
    conversation_id: String,
    message_id: String,
    payload: Option<PreserveAttachmentsPayload>,
) -> Result<ConversationMutationResult, String> {
    with_db_mutation(move |db| {
        let mut ordered_messages: Vec<MessageRecord> = db
            .messages
            .iter()
            .filter(|message| message.conversation_id == conversation_id)
            .cloned()
            .collect();
        ordered_messages.sort_by_key(message_created_at_millis);

        let ordered_index = ordered_messages
            .iter()
            .position(|message| message.id == message_id)
            .ok_or_else(|| "Message not found".to_string())?;
        let cutoff = message_created_at_millis(&ordered_messages[ordered_index]);
        let previous_message = ordered_index
            .checked_sub(1)
            .and_then(|index| ordered_messages.get(index))
            .cloned();

        db.messages.retain(|message| {
            message.conversation_id != conversation_id
                || message_created_at_millis(message) < cutoff
        });

        if let Some(conversation) = db
            .conversations
            .iter_mut()
            .find(|conversation| conversation.id == conversation_id)
        {
            queue_engine_rewind(conversation, previous_message.as_ref());
        }
        preserve_attachments_noop(
            db,
            &payload
                .map(|payload| payload.preserve_attachment_ids)
                .unwrap_or_default(),
        );
        Ok(())
    })?;

    Ok(ConversationMutationResult { success: true })
}

pub(crate) fn delete_messages_tail(
    conversation_id: String,
    count: i64,
    payload: Option<PreserveAttachmentsPayload>,
) -> Result<ConversationMutationResult, String> {
    if count <= 0 {
        return Err("Invalid count".to_string());
    }

    with_db_mutation(move |db| {
        let mut ordered_messages: Vec<MessageRecord> = db
            .messages
            .iter()
            .filter(|message| message.conversation_id == conversation_id)
            .cloned()
            .collect();
        ordered_messages.sort_by_key(message_created_at_millis);

        let count = count as usize;
        let previous_message = ordered_messages
            .len()
            .checked_sub(count + 1)
            .and_then(|index| ordered_messages.get(index))
            .cloned();

        if ordered_messages.len() <= count {
            db.messages
                .retain(|message| message.conversation_id != conversation_id);
        } else if let Some(cutoff_message) = ordered_messages.get(ordered_messages.len() - count) {
            let cutoff = message_created_at_millis(cutoff_message);
            db.messages.retain(|message| {
                message.conversation_id != conversation_id
                    || message_created_at_millis(message) < cutoff
            });
        }

        if let Some(conversation) = db
            .conversations
            .iter_mut()
            .find(|conversation| conversation.id == conversation_id)
        {
            queue_engine_rewind(conversation, previous_message.as_ref());
        }
        preserve_attachments_noop(
            db,
            &payload
                .map(|payload| payload.preserve_attachment_ids)
                .unwrap_or_default(),
        );
        Ok(())
    })?;

    Ok(ConversationMutationResult { success: true })
}
