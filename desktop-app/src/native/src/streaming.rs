use crate::{logging, paths, providers, runtime, uploads};
use base64::Engine as _;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const DEFAULT_CONTEXT_LIMIT: i64 = 200_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WarmEngineResult {
    pub(crate) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) cached: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) state: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StreamStatus {
    pub(crate) active: bool,
    pub(crate) event_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GenerationStatus {
    pub(crate) active: bool,
    pub(crate) status: String,
    pub(crate) text: String,
    pub(crate) thinking: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) thinking_summary: Option<String>,
    pub(crate) citations: Vec<Value>,
    pub(crate) search_logs: Vec<Value>,
    pub(crate) documents: Vec<Value>,
    pub(crate) document_drafts: Vec<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) document: Option<Value>,
    pub(crate) cross_process: bool,
    pub(crate) tool_calls: Vec<Value>,
    pub(crate) tool_order: Vec<String>,
    pub(crate) last_tool_text_offset: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StopGenerationResult {
    pub(crate) ok: bool,
    pub(crate) stopped: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AnswerUserQuestionResult {
    pub(crate) ok: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubmitCodeResultResponse {
    pub(crate) ok: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompactConversationResult {
    pub(crate) summary: String,
    pub(crate) tokens_saved: i64,
    pub(crate) messages_compacted: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartChatStreamResult {
    pub(crate) stream_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReconnectChatStreamResult {
    pub(crate) stream_id: Option<String>,
    pub(crate) events: Vec<Value>,
    pub(crate) done: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WarmEnginePayload {
    #[serde(default, alias = "env_token")]
    pub(crate) env_token: Option<String>,
    #[serde(default, alias = "env_base_url")]
    pub(crate) env_base_url: Option<String>,
    #[serde(default, alias = "user_profile")]
    pub(crate) user_profile: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AnswerUserQuestionPayload {
    #[serde(alias = "request_id")]
    pub(crate) request_id: String,
    #[serde(default, alias = "tool_use_id")]
    pub(crate) tool_use_id: Option<String>,
    #[serde(default)]
    pub(crate) answers: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodeResultPayload {
    #[serde(alias = "execution_id")]
    pub(crate) execution_id: String,
    #[serde(default)]
    pub(crate) stdout: String,
    #[serde(default)]
    pub(crate) stderr: String,
    #[serde(default)]
    pub(crate) images: Vec<String>,
    #[serde(default)]
    pub(crate) error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompactConversationPayload {
    #[serde(default)]
    pub(crate) instruction: Option<String>,
    #[serde(default, alias = "env_token")]
    pub(crate) env_token: Option<String>,
    #[serde(default, alias = "env_base_url")]
    pub(crate) env_base_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GenerateConversationTitlePayload {
    #[serde(default, alias = "env_token")]
    pub(crate) env_token: Option<String>,
    #[serde(default, alias = "env_base_url")]
    pub(crate) env_base_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartChatStreamPayload {
    #[serde(alias = "conversation_id")]
    pub(crate) conversation_id: String,
    pub(crate) message: String,
    #[serde(default)]
    pub(crate) attachments: Option<Vec<Value>>,
    #[serde(default, alias = "env_token")]
    pub(crate) env_token: Option<String>,
    #[serde(default, alias = "env_base_url")]
    pub(crate) env_base_url: Option<String>,
    #[serde(default, alias = "user_profile")]
    pub(crate) user_profile: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct ConversationRecord {
    id: String,
    title: String,
    model: String,
    #[serde(alias = "workspacePath")]
    workspace_path: String,
    #[serde(alias = "createdAt")]
    created_at: String,
    #[serde(default)]
    research_mode: bool,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    claude_session_id: Option<String>,
    #[serde(default, rename = "pendingResumeAt", alias = "pending_resume_at")]
    pending_resume_at: Option<String>,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct MessageRecord {
    #[serde(default)]
    id: String,
    #[serde(default)]
    #[serde(alias = "conversationId")]
    conversation_id: String,
    #[serde(default)]
    role: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    #[serde(alias = "createdAt")]
    created_at: String,
    #[serde(default)]
    attachments: Option<Value>,
    #[serde(default, rename = "toolCalls", alias = "tool_calls")]
    tool_calls: Option<Value>,
    #[serde(default)]
    thinking: Option<String>,
    #[serde(default, rename = "engineUuidSynced", alias = "engine_uuid_synced")]
    engine_uuid_synced: bool,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
struct DesktopDb {
    #[serde(default)]
    conversations: Vec<ConversationRecord>,
    #[serde(default)]
    messages: Vec<MessageRecord>,
    #[serde(default)]
    projects: Vec<Value>,
    #[serde(default)]
    project_files: Vec<Value>,
}

#[derive(Debug, Clone, Default)]
struct NativeStreamState {
    stream_id: Option<String>,
    active: bool,
    done: bool,
    events: Vec<Value>,
    assistant_uuid: Option<String>,
    text: String,
    thinking: String,
    thinking_summary: Option<String>,
    citations: Vec<Value>,
    search_logs: Vec<Value>,
    documents: Vec<Value>,
    document_drafts: Vec<Value>,
    document: Option<Value>,
    cross_process: bool,
    tool_calls: BTreeMap<String, Value>,
    tool_order: Vec<String>,
    pending_work_text: String,
    last_tool_text_offset: usize,
    pending_request_id: Option<String>,
    pending_tool_use_id: Option<String>,
    pending_ask_input: Option<Value>,
    user_message: String,
    title_provider: Option<providers::ImportedProvider>,
    title_model_id: Option<String>,
    title_env_token: Option<String>,
    title_env_base_url: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct MaterializedAttachmentContext {
    copied_files: Vec<String>,
    image_file_names: Vec<String>,
    image_blocks: Vec<Value>,
}

#[derive(Debug, Clone)]
struct TitleGenerationContext {
    conversation: ConversationRecord,
    user_message: String,
    assistant_message: String,
    provider: Option<providers::ImportedProvider>,
    model_id: Option<String>,
    env_token: Option<String>,
    env_base_url: Option<String>,
    force: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopTitleHelperResponse {
    ok: bool,
    title: Option<String>,
    error: Option<String>,
}

static STREAMS: Lazy<Mutex<BTreeMap<String, NativeStreamState>>> =
    Lazy::new(|| Mutex::new(BTreeMap::new()));
static ACTIVE_CHILDREN: Lazy<Mutex<BTreeMap<String, Arc<Mutex<Child>>>>> =
    Lazy::new(|| Mutex::new(BTreeMap::new()));
static ACTIVE_STDIN: Lazy<Mutex<BTreeMap<String, Arc<Mutex<ChildStdin>>>>> =
    Lazy::new(|| Mutex::new(BTreeMap::new()));

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn resolve_engine_runtime(app: &AppHandle) -> Result<(PathBuf, Option<String>, PathBuf), String> {
    let runtime_path = runtime::resolve_runtime_path(app)?.ok_or_else(|| {
        "Claude Code runtime 未配置。请先在 Settings 中选择 runtime 路径。".to_string()
    })?;
    let engine_cli = runtime_path.join("src").join("bootstrap-entry.ts");
    if !engine_cli.exists() {
        return Err(
            "Claude Code runtime 未配置。请先在 Settings 中选择 runtime 路径。".to_string(),
        );
    }
    let engine_env = runtime_path.join(".env");
    let engine_env_arg = engine_env
        .exists()
        .then(|| format!("--env-file={}", engine_env.to_string_lossy()));
    let bun_path = runtime::resolve_bun_path(app)?
        .ok_or_else(|| "Bun 未配置。请先在 Settings 中选择 Bun 路径。".to_string())?;
    Ok((bun_path, engine_env_arg, engine_cli))
}

fn read_engine_env_vars(runtime_root: &PathBuf) -> BTreeMap<String, String> {
    let env_path = runtime_root.join(".env");
    let Ok(content) = fs::read_to_string(&env_path) else {
        return BTreeMap::new();
    };

    let mut vars = BTreeMap::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            vars.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    vars
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

fn estimate_token_count(text: &str) -> i64 {
    let char_estimate = ((text.chars().count() as f64) / 4.0).ceil() as i64;
    let word_estimate = text.split_whitespace().count() as i64;
    char_estimate.max(word_estimate).max(0)
}

fn message_has_visible_content(message: &MessageRecord) -> bool {
    !message.role.trim().is_empty()
        || !message.content.trim().is_empty()
        || message.attachments.is_some()
        || message.tool_calls.is_some()
        || message.thinking.is_some()
}

fn append_context_size_event(
    conversation_id: &str,
    state: &mut NativeStreamState,
) -> Result<(), String> {
    let db = read_db()?;
    let tokens = db
        .messages
        .iter()
        .filter(|message| message.conversation_id == conversation_id)
        .filter(|message| message_has_visible_content(message))
        .map(|message| estimate_token_count(&parse_message_content(&message.content)))
        .sum::<i64>();
    state.events.push(serde_json::json!({
        "type": "system",
        "event": "context_size",
        "tokens": tokens,
        "limit": DEFAULT_CONTEXT_LIMIT,
    }));
    Ok(())
}

fn emit_stream_event(app: &AppHandle, conversation_id: &str, event: Value) {
    let payload = serde_json::json!({
        "conversationId": conversation_id,
        "event": event,
    });
    let _ = app.emit("chat_stream_event", payload);
}

fn emit_stream_done(app: &AppHandle, conversation_id: &str) {
    let _ = app.emit(
        "chat_stream_done",
        serde_json::json!({ "conversationId": conversation_id }),
    );
}

fn emit_stream_error(app: &AppHandle, conversation_id: &str, error: &str) {
    let _ = app.emit(
        "chat_stream_error",
        serde_json::json!({ "conversationId": conversation_id, "error": error }),
    );
}

fn normalize_base_url(url: &str) -> String {
    url.trim()
        .trim_end_matches('/')
        .replace("/chat/completions", "")
        .replace("/messages", "")
        .trim_end_matches('/')
        .to_string()
}

fn is_claude_family_model(model_id: &str) -> bool {
    model_id.trim().to_ascii_lowercase().starts_with("claude-")
}

fn parse_conversation_model(raw_model: &str) -> (String, Option<String>, String) {
    let model_value = if raw_model.trim().is_empty() {
        "claude-sonnet-4-6".to_string()
    } else {
        raw_model.trim().to_string()
    };
    if let Some((provider_id, model_id)) = model_value.clone().split_once(':') {
        let provider_id = provider_id.trim().to_string();
        let decoded_provider_id = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(&provider_id)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
            .filter(|value| value.contains("::"))
            .unwrap_or(provider_id);
        return (
            model_value,
            Some(decoded_provider_id),
            model_id.trim().trim_end_matches("-thinking").to_string(),
        );
    }
    (
        model_value.clone(),
        None,
        model_value.trim_end_matches("-thinking").to_string(),
    )
}

fn find_provider_for_model(
    raw_model: &str,
) -> Result<(Option<String>, Option<providers::ImportedProvider>, String), String> {
    let (_raw, provider_id, model_id) = parse_conversation_model(raw_model);
    let providers_list = providers::get_providers()?;
    let provider = if let Some(provider_id) = provider_id.clone() {
        providers_list.into_iter().find(|provider| {
            provider.enabled
                && providers::provider_matches_ref(provider, &provider_id)
                && provider
                    .models
                    .iter()
                    .any(|model| model.enabled && model.id == model_id)
        })
    } else {
        providers_list.into_iter().find(|provider| {
            provider.enabled
                && provider
                    .models
                    .iter()
                    .any(|model| model.enabled && model.id == model_id)
        })
    };

    if provider.is_none() && !is_claude_family_model(&model_id) {
        return Err(format!(
            "No enabled self-hosted provider found for model \"{}\".",
            model_id
        ));
    }

    Ok((provider_id, provider, model_id))
}

fn load_custom_system_prompt() -> String {
    let prompt_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("system-prompt.txt");
    let Ok(content) = fs::read_to_string(prompt_path) else {
        return String::new();
    };
    content
        .replace(
            &content
                .lines()
                .skip_while(|line| !line.contains("<override_instructions>"))
                .take_while(|line| !line.contains("</override_instructions>"))
                .collect::<Vec<_>>()
                .join("\n"),
            "",
        )
        .replace(
            &content
                .lines()
                .skip_while(|line| !line.contains("<identity>"))
                .take_while(|line| !line.contains("</identity>"))
                .collect::<Vec<_>>()
                .join("\n"),
            "",
        )
}

fn build_system_prompt(
    conversation: &ConversationRecord,
    db: &DesktopDb,
    user_profile: Option<&Value>,
) -> String {
    let mut prompt = load_custom_system_prompt();

    if let Some(profile) = user_profile {
        let mut parts = Vec::new();
        if let Some(work_function) = profile.get("work_function").and_then(Value::as_str) {
            if !work_function.trim().is_empty() {
                parts.push(format!("Occupation: {}", work_function.trim()));
            }
        }
        if let Some(personal_preferences) =
            profile.get("personal_preferences").and_then(Value::as_str)
        {
            if !personal_preferences.trim().is_empty() {
                parts.push(format!("User preferences: {}", personal_preferences.trim()));
            }
        }
        if !parts.is_empty() {
            prompt.push_str("\n\n<user_profile>\n");
            prompt.push_str(&parts.join("\n"));
            prompt.push_str("\n</user_profile>");
        }
    }

    if let Some(project_id) = conversation.project_id.as_ref() {
        if let Some(project) = db
            .projects
            .iter()
            .find(|project| project.get("id").and_then(Value::as_str) == Some(project_id.as_str()))
        {
            if let Some(instructions) = project.get("instructions").and_then(Value::as_str) {
                if !instructions.trim().is_empty() {
                    prompt.push_str("\n\n<project_instructions>\n");
                    prompt.push_str(instructions.trim());
                    prompt.push_str("\n</project_instructions>");
                }
            }
        }
    }

    prompt
}

fn append_user_message(
    conversation_id: &str,
    message: &str,
    attachments: Option<Vec<Value>>,
) -> Result<String, String> {
    let user_message_id = Uuid::new_v4().to_string();
    with_db_mutation({
        let user_message_id = user_message_id.clone();
        let conversation_id = conversation_id.to_string();
        let message = message.to_string();
        move |db| {
            db.messages.push(MessageRecord {
                id: user_message_id.clone(),
                conversation_id,
                role: "user".to_string(),
                content: serde_json::json!([{ "type": "text", "text": message }]).to_string(),
                created_at: chrono::Utc::now().to_rfc3339(),
                attachments: attachments.map(Value::Array),
                tool_calls: None,
                thinking: None,
                engine_uuid_synced: true,
                extra: Map::new(),
            });
            Ok(())
        }
    })?;
    Ok(user_message_id)
}

fn is_image_attachment(attachment: &Value, file_name: &str) -> bool {
    let mime_type = attachment
        .get("mimeType")
        .or_else(|| attachment.get("mime_type"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_ascii_lowercase();
    if mime_type.starts_with("image/") {
        return true;
    }

    matches!(
        Path::new(file_name)
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp")
    )
}

fn image_mime_type(attachment: &Value, file_name: &str) -> String {
    attachment
        .get("mimeType")
        .or_else(|| attachment.get("mime_type"))
        .and_then(Value::as_str)
        .filter(|value| value.starts_with("image/"))
        .map(str::to_string)
        .unwrap_or_else(|| {
            match Path::new(file_name)
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.to_ascii_lowercase())
                .as_deref()
            {
                Some("jpg" | "jpeg") => "image/jpeg",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                _ => "image/png",
            }
            .to_string()
        })
}

fn unique_workspace_file_name(workspace: &Path, requested_name: &str) -> String {
    let safe_name = Path::new(requested_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(requested_name)
        .trim();
    let safe_name = if safe_name.is_empty() {
        "attachment"
    } else {
        safe_name
    };
    let candidate_path = workspace.join(safe_name);
    if !candidate_path.exists() {
        return safe_name.to_string();
    }

    let path = Path::new(safe_name);
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.is_empty())
        .unwrap_or("attachment");
    let extension = path.extension().and_then(|extension| extension.to_str());
    for index in 2..1000 {
        let candidate = match extension {
            Some(extension) if !extension.is_empty() => format!("{}-{}.{}", stem, index, extension),
            _ => format!("{}-{}", stem, index),
        };
        if !workspace.join(&candidate).exists() {
            return candidate;
        }
    }

    format!("{}-{}", stem, Uuid::new_v4())
}

fn materialize_attachments_into_workspace(
    conversation: &ConversationRecord,
    attachments: &[Value],
) -> Result<MaterializedAttachmentContext, String> {
    let workspace = PathBuf::from(&conversation.workspace_path);
    fs::create_dir_all(&workspace).map_err(|error| error.to_string())?;
    let mut context = MaterializedAttachmentContext::default();

    for attachment in attachments {
        let source = attachment
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let file_type = attachment
            .get("fileType")
            .or_else(|| attachment.get("file_type"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        if source == "github" || file_type == "github" {
            continue;
        }

        let file_id = attachment
            .get("fileId")
            .or_else(|| attachment.get("id"))
            .and_then(Value::as_str)
            .unwrap_or_default();
        let file_name = attachment
            .get("fileName")
            .or_else(|| attachment.get("file_name"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(file_id);
        if file_id.trim().is_empty() || file_name.trim().is_empty() {
            continue;
        }

        let source_path: Option<PathBuf> =
            uploads::get_upload_path(file_id.to_string(), Some(conversation.id.clone()))
                .or_else(|_| uploads::get_upload_path(file_id.to_string(), None))
                .map(|result| PathBuf::from(result.local_path))
                .or_else(|_| {
                    attachment
                        .get("localPath")
                        .or_else(|| attachment.get("local_path"))
                        .and_then(Value::as_str)
                        .map(PathBuf::from)
                        .ok_or_else(|| "No local path".to_string())
                })
                .ok();
        let Some(source_path) = source_path else {
            continue;
        };
        if !source_path.exists() {
            continue;
        }

        let target_name = unique_workspace_file_name(&workspace, file_name);
        let destination = workspace.join(&target_name);
        fs::copy(&source_path, &destination).map_err(|error| error.to_string())?;
        context.copied_files.push(target_name.clone());

        if is_image_attachment(attachment, &target_name) {
            let bytes = fs::read(&source_path).map_err(|error| error.to_string())?;
            if bytes.len() > 100 {
                context.image_file_names.push(target_name);
                context.image_blocks.push(serde_json::json!({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": image_mime_type(attachment, file_name),
                        "data": base64::engine::general_purpose::STANDARD.encode(bytes),
                    }
                }));
            }
        }
    }

    Ok(context)
}

fn build_github_context_prompt(workspace: &str) -> String {
    let meta_path = PathBuf::from(workspace).join(".github-context.json");
    let Ok(raw) = fs::read_to_string(meta_path) else {
        return String::new();
    };
    let Ok(meta) = serde_json::from_str::<Value>(&raw) else {
        return String::new();
    };
    let Some(repos) = meta
        .get("repos")
        .and_then(Value::as_array)
        .filter(|repos| !repos.is_empty())
    else {
        return String::new();
    };

    let mut block = String::from("\n\n[GitHub content available in this workspace:]\n");
    for repo in repos {
        let repo_name = repo.get("repo").and_then(Value::as_str).unwrap_or_default();
        if repo_name.trim().is_empty() {
            continue;
        }
        let branch = repo.get("ref").and_then(Value::as_str).unwrap_or("main");
        let root_dir = repo
            .get("rootDir")
            .and_then(Value::as_str)
            .unwrap_or("./github");
        block.push_str(&format!(
            "\nRepository: {} (branch: {}) - located at {}/\n",
            repo_name, branch, root_dir
        ));
        let files = repo
            .get("files")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        if !files.is_empty() {
            let shown_count = files.len().min(80);
            block.push_str(&format!("Files ({} total):\n", files.len()));
            for file in files.iter().take(shown_count) {
                if let Some(path) = file.get("path").and_then(Value::as_str) {
                    block.push_str(&format!("- {}/{}\n", root_dir, path));
                }
            }
            if files.len() > shown_count {
                block.push_str(&format!(
                    "- ... and {} more (use Glob to list all)\n",
                    files.len() - shown_count
                ));
            }
        }
    }
    block.push_str("\nUse Glob / Grep / FileRead / Bash to explore these files as needed. Binary files (images, PDFs, archives) are preserved as-is on disk.\n");
    block
}

fn build_runtime_user_content(final_message: String, image_blocks: &[Value]) -> Value {
    if image_blocks.is_empty() {
        return Value::String(final_message);
    }
    let mut content = Vec::with_capacity(image_blocks.len() + 1);
    content.push(serde_json::json!({ "type": "text", "text": final_message }));
    content.extend(image_blocks.iter().cloned());
    Value::Array(content)
}

fn title_is_placeholder(title: &str) -> bool {
    let trimmed = title.trim();
    trimmed.is_empty() || trimmed == "New Conversation" || trimmed == "New Chat"
}

fn clean_generated_title(value: &str) -> Option<String> {
    let title = value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .lines()
        .next()
        .unwrap_or_default()
        .trim()
        .trim_end_matches('.')
        .to_string();
    if title_is_placeholder(&title) || title.is_empty() {
        None
    } else {
        Some(title.chars().take(80).collect())
    }
}

fn set_auto_title_attempted(conversation_id: &str) -> Result<(), String> {
    let conversation_id = conversation_id.to_string();
    with_db_mutation(move |db| {
        if let Some(conversation) = db
            .conversations
            .iter_mut()
            .find(|conversation| conversation.id == conversation_id)
        {
            conversation.extra.insert(
                "auto_title_attempted_at".to_string(),
                Value::String(chrono::Utc::now().to_rfc3339()),
            );
        }
        Ok(())
    })
}

fn should_retry_auto_title(extra: &Map<String, Value>) -> bool {
    let attempted_at = extra
        .get("auto_title_attempted_at")
        .and_then(Value::as_str)
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.timestamp_millis());
    let title_failure = extra
        .get("auto_title_failed_at")
        .and_then(Value::as_str)
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.timestamp_millis());
    let now = chrono::Utc::now().timestamp_millis();
    let stale_failure = title_failure
        .map(|ts| now - ts > 10 * 60 * 1000)
        .unwrap_or(false);
    let stale_attempt = attempted_at
        .map(|ts| now - ts > 10 * 60 * 1000)
        .unwrap_or(false);
    stale_failure || stale_attempt
}

fn mark_auto_title_failure(conversation_id: &str, reason: &str) -> Result<(), String> {
    let conversation_id = conversation_id.to_string();
    let reason = reason.to_string();
    with_db_mutation(move |db| {
        if let Some(conversation) = db
            .conversations
            .iter_mut()
            .find(|conversation| conversation.id == conversation_id)
        {
            conversation.extra.insert(
                "auto_title_failed_at".to_string(),
                Value::String(chrono::Utc::now().to_rfc3339()),
            );
            conversation.extra.insert(
                "auto_title_failure_reason".to_string(),
                Value::String(reason),
            );
        }
        Ok(())
    })
}

fn persist_generated_title(conversation_id: &str, title: &str) -> Result<(), String> {
    let conversation_id = conversation_id.to_string();
    let title = title.to_string();
    with_db_mutation(move |db| {
        if let Some(conversation) = db
            .conversations
            .iter_mut()
            .find(|conversation| conversation.id == conversation_id)
        {
            conversation.title = title;
            conversation.extra.remove("auto_title_failed_at");
            conversation.extra.remove("auto_title_failure_reason");
        }
        Ok(())
    })
}

fn build_engine_environment(
    runtime_root: &PathBuf,
    provider: Option<&providers::ImportedProvider>,
    model_id: &str,
    env_token: Option<String>,
    env_base_url: Option<String>,
) -> Result<BTreeMap<String, String>, String> {
    let mut env_vars: BTreeMap<String, String> = std::env::vars().collect();
    for (key, value) in read_engine_env_vars(runtime_root) {
        env_vars.insert(key, value);
    }
    env_vars.insert(
        "CLAUDE_CONFIG_DIR".to_string(),
        paths::cloai_config_dir()?.to_string_lossy().to_string(),
    );
    env_vars.insert(
        "CLAUDE_CODE_ENTRYPOINT".to_string(),
        "claude-desktop".to_string(),
    );
    env_vars.insert(
        "CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS".to_string(),
        "80000".to_string(),
    );
    if let Some(provider) = provider {
        providers::sync_active_provider_selection(
            providers::get_provider_ref(provider),
            model_id.to_string(),
        )?;
        env_vars.insert(
            "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST".to_string(),
            "1".to_string(),
        );
        // Provider/model routing lives in cloai-code storage. Keep these env vars
        // out of the subprocess so stale desktop or shell env cannot override
        // activeProviderKey and collapse OpenAI/Gemini/Anthropic providers.
        env_vars.remove("CLAUDE_CODE_COMPATIBLE_API_PROVIDER");
        env_vars.remove("CLOAI_API_KEY");
        env_vars.remove("ANTHROPIC_BASE_URL");
        env_vars.remove("ANTHROPIC_MODEL");
    } else {
        env_vars.remove("CLAUDE_CODE_COMPATIBLE_API_PROVIDER");
        if let Some(env_token) = env_token.filter(|value| !value.trim().is_empty()) {
            env_vars.insert("CLOAI_API_KEY".to_string(), env_token);
        }
        if let Some(env_base_url) = env_base_url.filter(|value| !value.trim().is_empty()) {
            env_vars.insert(
                "ANTHROPIC_BASE_URL".to_string(),
                normalize_base_url(&env_base_url),
            );
        }
    }
    Ok(env_vars)
}

fn generate_title_with_engine(
    app: &AppHandle,
    context: &TitleGenerationContext,
    provider: Option<&providers::ImportedProvider>,
    model_id: &str,
    description: &str,
) -> Result<Option<String>, String> {
    let (bun_path, engine_env_arg, engine_cli) = resolve_engine_runtime(app)?;
    let runtime_root = engine_cli
        .parent()
        .and_then(|src| src.parent())
        .map(PathBuf::from)
        .ok_or_else(|| "Invalid runtime layout".to_string())?;
    let env_vars = build_engine_environment(
        &runtime_root,
        provider,
        model_id,
        context.env_token.clone(),
        context.env_base_url.clone(),
    )?;

    let mut cli_args = Vec::<String>::new();
    if let Some(engine_env_arg) = engine_env_arg {
        cli_args.push(engine_env_arg);
    }
    cli_args.push(engine_cli.to_string_lossy().to_string());
    cli_args.push("--desktop-generate-title".to_string());

    let mut command = Command::new(&bun_path);
    command
        .args(&cli_args)
        .current_dir(&context.conversation.workspace_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .envs(&env_vars);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Engine title helper stdin unavailable".to_string())?;
        let request = serde_json::json!({
            "description": description,
            "model": model_id,
            "timeoutMs": 30_000,
        });
        stdin
            .write_all(request.to_string().as_bytes())
            .map_err(|error| error.to_string())?;
        stdin.flush().map_err(|error| error.to_string())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = stdout
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str::<DesktopTitleHelperResponse>(line.trim()).ok());

    let Some(response) = parsed else {
        return Err(if stderr.trim().is_empty() {
            format!(
                "Engine title helper failed with exit code {}",
                output.status.code().unwrap_or(-1)
            )
        } else {
            stderr.trim().to_string()
        });
    };
    if !response.ok {
        return Err(response
            .error
            .unwrap_or_else(|| "Engine title helper returned an error".to_string()));
    }
    Ok(response.title.as_deref().and_then(clean_generated_title))
}

fn generate_conversation_title_once(
    app: &AppHandle,
    context: &TitleGenerationContext,
) -> Result<Option<String>, String> {
    if !title_is_placeholder(&context.conversation.title) {
        return Ok(Some(context.conversation.title.clone()));
    }
    if !context.force
        && context
            .conversation
            .extra
            .get("auto_title_attempted_at")
            .is_some()
        && !should_retry_auto_title(&context.conversation.extra)
    {
        return Ok(None);
    }
    if context.user_message.trim().is_empty() || context.assistant_message.trim().is_empty() {
        return Ok(None);
    }

    let provider_and_model = if let (Some(provider), Some(model_id)) =
        (context.provider.clone(), context.model_id.clone())
    {
        (Some(provider), model_id)
    } else {
        let (_provider_id, provider, model_id) =
            find_provider_for_model(&context.conversation.model)?;
        (provider, model_id)
    };
    set_auto_title_attempted(&context.conversation.id)?;
    let description = format!(
        "User: {}\n\nAssistant: {}",
        context.user_message.trim(),
        context.assistant_message.trim()
    );

    let title = generate_title_with_engine(
        app,
        context,
        provider_and_model.0.as_ref(),
        &provider_and_model.1,
        &description,
    )?;

    if let Some(title) = title.as_deref() {
        persist_generated_title(&context.conversation.id, title)?;
    } else {
        mark_auto_title_failure(&context.conversation.id, "Title response was empty")?;
    }
    Ok(title)
}

fn set_stream_state<F>(conversation_id: &str, updater: F) -> Result<(), String>
where
    F: FnOnce(&mut NativeStreamState),
{
    let mut streams = STREAMS.lock().map_err(|error| error.to_string())?;
    let state = streams.entry(conversation_id.to_string()).or_default();
    updater(state);
    Ok(())
}

fn push_stream_event(app: &AppHandle, conversation_id: &str, event: Value) -> Result<(), String> {
    set_stream_state(conversation_id, |state| {
        state.events.push(event.clone());
        if let Some(text) = event
            .get("delta")
            .and_then(|delta| delta.get("text"))
            .and_then(Value::as_str)
        {
            state.text.push_str(text);
        }
        if let Some(thinking) = event
            .get("delta")
            .and_then(|delta| delta.get("thinking"))
            .and_then(Value::as_str)
        {
            state.thinking.push_str(thinking);
        }
    })?;
    emit_stream_event(app, conversation_id, event);
    Ok(())
}

fn clear_runtime_state(conversation_id: &str) {
    if let Ok(mut children) = ACTIVE_CHILDREN.lock() {
        children.remove(conversation_id);
    }
    if let Ok(mut stdin_map) = ACTIVE_STDIN.lock() {
        stdin_map.remove(conversation_id);
    }
}

fn finalize_stream(
    app: &AppHandle,
    conversation_id: &str,
    error: Option<String>,
) -> Result<(), String> {
    let was_active = {
        let mut streams = STREAMS.lock().map_err(|error| error.to_string())?;
        let Some(state) = streams.get_mut(conversation_id) else {
            return Ok(());
        };
        if !state.active && state.done {
            return Ok(());
        }
        let active = state.active;
        state.active = false;
        state.done = true;
        active
    };

    if !was_active {
        return Ok(());
    }

    let title_candidate = persist_assistant_message(conversation_id)?;
    if error.is_none() {
        if let Some(context) = title_candidate {
            match generate_conversation_title_once(app, &context) {
                Ok(Some(title)) => {
                    let title_event = serde_json::json!({
                        "type": "system",
                        "event": "conversation_title",
                        "title": title,
                        "conversation_id": conversation_id,
                    });
                    let _ = push_stream_event(app, conversation_id, title_event);
                }
                Ok(None) => {}
                Err(error) => logging::log_error(format!("[NativeTitle] {}", error)),
            }
        }
    }
    match error {
        Some(message) => emit_stream_error(app, conversation_id, &message),
        None => emit_stream_done(app, conversation_id),
    }
    clear_runtime_state(conversation_id);
    Ok(())
}

fn persist_assistant_message(
    conversation_id: &str,
) -> Result<Option<TitleGenerationContext>, String> {
    let snapshot = {
        let streams = STREAMS.lock().map_err(|error| error.to_string())?;
        streams.get(conversation_id).cloned()
    };
    let Some(state) = snapshot else {
        return Ok(None);
    };
    if state.text.is_empty()
        && state.thinking.is_empty()
        && state.tool_order.is_empty()
        && state.search_logs.is_empty()
    {
        return Ok(None);
    }

    with_db_mutation(|db| {
        let conversation = db
            .conversations
            .iter()
            .find(|conversation| conversation.id == conversation_id)
            .cloned();
        let already_saved = state
            .assistant_uuid
            .as_ref()
            .map(|assistant_uuid| {
                db.messages.iter().any(|message| {
                    message.id == *assistant_uuid && message.conversation_id == conversation_id
                })
            })
            .unwrap_or(false);
        if already_saved {
            return Ok(None);
        }

        let tool_calls = if state.tool_order.is_empty() {
            None
        } else {
            Some(Value::Array(
                state
                    .tool_order
                    .iter()
                    .filter_map(|id| state.tool_calls.get(id).cloned())
                    .collect(),
            ))
        };
        let mut extra = Map::new();
        if state.last_tool_text_offset > 0 {
            extra.insert(
                "toolTextEndOffset".to_string(),
                Value::from(state.last_tool_text_offset as i64),
            );
        }
        if !state.search_logs.is_empty() {
            extra.insert(
                "searchLogs".to_string(),
                Value::Array(state.search_logs.clone()),
            );
        }

        db.messages.push(MessageRecord {
            id: state
                .assistant_uuid
                .clone()
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            conversation_id: conversation_id.to_string(),
            role: "assistant".to_string(),
            content: serde_json::json!([{ "type": "text", "text": state.text.clone() }])
                .to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            attachments: None,
            tool_calls,
            thinking: (!state.thinking.is_empty()).then_some(state.thinking.clone()),
            engine_uuid_synced: state.assistant_uuid.is_some(),
            extra,
        });

        Ok(conversation.map(|conversation| TitleGenerationContext {
            conversation,
            user_message: state.user_message.clone(),
            assistant_message: state.text.clone(),
            provider: state.title_provider.clone(),
            model_id: state.title_model_id.clone(),
            env_token: state.title_env_token.clone(),
            env_base_url: state.title_env_base_url.clone(),
            force: false,
        }))
    })
}

fn idle_generation_status() -> GenerationStatus {
    GenerationStatus {
        active: false,
        status: "idle".to_string(),
        text: String::new(),
        thinking: String::new(),
        thinking_summary: None,
        citations: Vec::new(),
        search_logs: Vec::new(),
        documents: Vec::new(),
        document_drafts: Vec::new(),
        document: None,
        cross_process: false,
        tool_calls: Vec::new(),
        tool_order: Vec::new(),
        last_tool_text_offset: 0,
    }
}

pub(crate) fn warm_engine(
    conversation_id: String,
    payload: Option<WarmEnginePayload>,
) -> Result<WarmEngineResult, String> {
    let _ = payload.map(|payload| {
        (
            payload.env_token,
            payload.env_base_url,
            payload.user_profile,
        )
    });
    let mut streams = STREAMS.lock().map_err(|error| error.to_string())?;
    let state = streams.entry(conversation_id).or_default();
    Ok(WarmEngineResult {
        ok: true,
        cached: Some(state.active),
        state: Some(if state.active { "processing" } else { "idle" }.to_string()),
    })
}

pub(crate) fn get_stream_status(conversation_id: String) -> Result<StreamStatus, String> {
    let streams = STREAMS.lock().map_err(|error| error.to_string())?;
    let Some(state) = streams.get(&conversation_id) else {
        return Ok(StreamStatus {
            active: false,
            event_count: 0,
        });
    };

    Ok(StreamStatus {
        active: state.active,
        event_count: state.events.len(),
    })
}

pub(crate) fn get_generation_status(conversation_id: String) -> Result<GenerationStatus, String> {
    let streams = STREAMS.lock().map_err(|error| error.to_string())?;
    let Some(state) = streams.get(&conversation_id) else {
        return Ok(idle_generation_status());
    };

    if !state.active {
        return Ok(idle_generation_status());
    }

    Ok(GenerationStatus {
        active: true,
        status: "generating".to_string(),
        text: state.text.clone(),
        thinking: state.thinking.clone(),
        thinking_summary: state.thinking_summary.clone(),
        citations: state.citations.clone(),
        search_logs: state.search_logs.clone(),
        documents: state.documents.clone(),
        document_drafts: state.document_drafts.clone(),
        document: state.document.clone(),
        cross_process: state.cross_process,
        tool_calls: state
            .tool_order
            .iter()
            .filter_map(|id| state.tool_calls.get(id).cloned())
            .collect(),
        tool_order: state.tool_order.clone(),
        last_tool_text_offset: state.last_tool_text_offset,
    })
}

pub(crate) fn stop_generation(
    app: &AppHandle,
    conversation_id: String,
) -> Result<StopGenerationResult, String> {
    let stopped = {
        let mut children = ACTIVE_CHILDREN.lock().map_err(|error| error.to_string())?;
        if let Some(child) = children.remove(&conversation_id) {
            if let Ok(mut child) = child.lock() {
                let _ = child.kill();
            }
            true
        } else {
            false
        }
    };
    if let Ok(mut stdin_map) = ACTIVE_STDIN.lock() {
        stdin_map.remove(&conversation_id);
    }
    let _ = finalize_stream(app, &conversation_id, None);

    Ok(StopGenerationResult { ok: true, stopped })
}

pub(crate) fn answer_user_question(
    conversation_id: String,
    payload: AnswerUserQuestionPayload,
) -> Result<AnswerUserQuestionResult, String> {
    let stdin = {
        let stdin_map = ACTIVE_STDIN.lock().map_err(|error| error.to_string())?;
        stdin_map
            .get(&conversation_id)
            .cloned()
            .ok_or_else(|| "No active engine process".to_string())?
    };
    let original_input = {
        let streams = STREAMS.lock().map_err(|error| error.to_string())?;
        streams
            .get(&conversation_id)
            .and_then(|state| state.pending_ask_input.clone())
            .unwrap_or_else(|| Value::Object(Map::new()))
    };
    let mut updated_input = match original_input {
        Value::Object(map) => map,
        _ => Map::new(),
    };
    updated_input.insert(
        "answers".to_string(),
        serde_json::to_value(payload.answers).map_err(|error| error.to_string())?,
    );
    let response = serde_json::json!({
        "type": "control_response",
        "response": {
            "subtype": "success",
            "request_id": payload.request_id,
            "response": {
                "toolUseID": payload.tool_use_id.clone().unwrap_or_default(),
                "behavior": "allow",
                "updatedInput": Value::Object(updated_input)
            }
        }
    });

    let mut stdin = stdin.lock().map_err(|error| error.to_string())?;
    stdin
        .write_all(format!("{}\n", response).as_bytes())
        .map_err(|error| error.to_string())?;
    stdin.flush().map_err(|error| error.to_string())?;
    let _ = set_stream_state(&conversation_id, |state| {
        state.pending_request_id = None;
        state.pending_tool_use_id = None;
        state.pending_ask_input = None;
    });
    Ok(AnswerUserQuestionResult { ok: true })
}

pub(crate) fn submit_code_result(
    app: AppHandle,
    conversation_id: String,
    payload: CodeResultPayload,
) -> Result<SubmitCodeResultResponse, String> {
    let pending = {
        let streams = STREAMS.lock().map_err(|error| error.to_string())?;
        streams.get(&conversation_id).map(|state| {
            (
                state.pending_request_id.clone(),
                state.pending_tool_use_id.clone(),
                state.pending_ask_input.clone(),
            )
        })
    };
    let event = serde_json::json!({
        "type": "code_result",
        "executionId": payload.execution_id,
        "execution_id": payload.execution_id,
        "stdout": payload.stdout,
        "stderr": payload.stderr,
        "images": payload.images,
        "error": payload.error,
    });

    let Some((Some(request_id), tool_use_id, original_input)) = pending else {
        push_stream_event(&app, &conversation_id, event)?;
        return Ok(SubmitCodeResultResponse { ok: true });
    };

    let stdin = {
        let stdin_map = ACTIVE_STDIN.lock().map_err(|error| error.to_string())?;
        stdin_map
            .get(&conversation_id)
            .cloned()
            .ok_or_else(|| "No active engine process".to_string())?
    };
    let mut updated_input = match original_input {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    };
    updated_input.insert("result".to_string(), event.clone());
    updated_input.insert(
        "stdout".to_string(),
        event
            .get("stdout")
            .cloned()
            .unwrap_or(Value::String(String::new())),
    );
    updated_input.insert(
        "stderr".to_string(),
        event
            .get("stderr")
            .cloned()
            .unwrap_or(Value::String(String::new())),
    );
    updated_input.insert(
        "images".to_string(),
        event
            .get("images")
            .cloned()
            .unwrap_or(Value::Array(Vec::new())),
    );
    updated_input.insert(
        "error".to_string(),
        event.get("error").cloned().unwrap_or(Value::Null),
    );
    let response = serde_json::json!({
        "type": "control_response",
        "response": {
            "subtype": "success",
            "request_id": request_id,
            "response": {
                "toolUseID": tool_use_id.unwrap_or_default(),
                "behavior": "allow",
                "updatedInput": Value::Object(updated_input)
            }
        }
    });

    {
        let mut stdin = stdin.lock().map_err(|error| error.to_string())?;
        stdin
            .write_all(format!("{}\n", response).as_bytes())
            .map_err(|error| error.to_string())?;
        stdin.flush().map_err(|error| error.to_string())?;
    }

    let _ = set_stream_state(&conversation_id, |state| {
        state.pending_request_id = None;
        state.pending_tool_use_id = None;
        state.pending_ask_input = None;
    });
    push_stream_event(&app, &conversation_id, event)?;
    Ok(SubmitCodeResultResponse { ok: true })
}

pub(crate) fn compact_conversation(
    app: AppHandle,
    conversation_id: String,
    payload: Option<CompactConversationPayload>,
) -> Result<CompactConversationResult, String> {
    let payload = payload.unwrap_or(CompactConversationPayload {
        instruction: None,
        env_token: None,
        env_base_url: None,
    });
    let (bun_path, engine_env_arg, engine_cli) = resolve_engine_runtime(&app)?;
    let runtime_root = engine_cli
        .parent()
        .and_then(|src| src.parent())
        .map(PathBuf::from)
        .ok_or_else(|| "Invalid runtime layout".to_string())?;
    let db = read_db()?;
    let conversation = db
        .conversations
        .iter()
        .find(|conversation| conversation.id == conversation_id)
        .cloned()
        .ok_or_else(|| "Conversation not found".to_string())?;
    let session_id = conversation
        .claude_session_id
        .clone()
        .filter(|session_id| !session_id.trim().is_empty())
        .ok_or_else(|| {
            "No engine session to compact (conversation has no history in engine)".to_string()
        })?;
    let messages_before_compact = db
        .messages
        .iter()
        .filter(|message| message.conversation_id == conversation_id)
        .filter(|message| message_has_visible_content(message))
        .count();
    let (_provider_id, provider, model_id) = find_provider_for_model(&conversation.model)?;
    let env_vars = build_engine_environment(
        &runtime_root,
        provider.as_ref(),
        &model_id,
        payload.env_token,
        payload.env_base_url,
    )?;

    let compact_prompt = payload
        .instruction
        .filter(|instruction| !instruction.trim().is_empty())
        .map(|instruction| format!("/compact {}", instruction.trim()))
        .unwrap_or_else(|| "/compact".to_string());
    let mut cli_args = Vec::<String>::new();
    if let Some(engine_env_arg) = engine_env_arg {
        cli_args.push(engine_env_arg);
    }
    cli_args.push(engine_cli.to_string_lossy().to_string());
    cli_args.push("-p".to_string());
    cli_args.push(compact_prompt);
    cli_args.push("--output-format".to_string());
    cli_args.push("stream-json".to_string());
    cli_args.push("--verbose".to_string());
    cli_args.push("--bare".to_string());
    cli_args.push("--permission-mode".to_string());
    cli_args.push("bypassPermissions".to_string());
    cli_args.push("--model".to_string());
    cli_args.push(model_id);
    cli_args.push("--resume".to_string());
    cli_args.push(session_id);

    let mut command = Command::new(&bun_path);
    command
        .args(&cli_args)
        .current_dir(&conversation.workspace_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .envs(&env_vars);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command.output().map_err(|error| error.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    let mut summary = String::new();
    let mut compact_metadata = Value::Null;
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(event) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        if event.get("type").and_then(Value::as_str) == Some("system")
            && event.get("subtype").and_then(Value::as_str) == Some("compact_boundary")
        {
            compact_metadata = event
                .get("compact_metadata")
                .cloned()
                .unwrap_or(Value::Null);
        }
        if event.get("type").and_then(Value::as_str) == Some("assistant") {
            if let Some(blocks) = event
                .get("message")
                .and_then(|message| message.get("content"))
                .and_then(Value::as_array)
            {
                for block in blocks {
                    if block.get("type").and_then(Value::as_str) == Some("text") {
                        if let Some(text) = block.get("text").and_then(Value::as_str) {
                            summary.push_str(text);
                        }
                    }
                }
            }
        }
        if event.get("type").and_then(Value::as_str) == Some("stream_event") {
            if let Some(text) = event
                .get("event")
                .and_then(|stream_event| stream_event.get("delta"))
                .and_then(|delta| delta.get("text"))
                .and_then(Value::as_str)
            {
                summary.push_str(text);
            }
        }
        if event.get("type").and_then(Value::as_str) == Some("result") && summary.trim().is_empty()
        {
            if let Some(result) = event.get("result").and_then(Value::as_str) {
                summary.push_str(result);
            }
        }
    }

    if !output.status.success() && compact_metadata.is_null() {
        return Err(if stderr.trim().is_empty() {
            format!(
                "Engine compact failed with exit code {}",
                output.status.code().unwrap_or(-1)
            )
        } else {
            stderr.trim().to_string()
        });
    }

    let summary = if summary.trim().is_empty() {
        "Conversation compacted.".to_string()
    } else {
        summary.trim().to_string()
    };
    let tokens_saved = compact_metadata
        .get("pre_tokens")
        .and_then(Value::as_i64)
        .map(|tokens| (tokens as f64 * 0.7).round() as i64)
        .unwrap_or((messages_before_compact as i64) * 500);
    with_db_mutation({
        let conversation_id = conversation_id.clone();
        let summary = summary.clone();
        move |db| {
            db.messages.push(MessageRecord {
                id: Uuid::new_v4().to_string(),
                conversation_id,
                role: "system".to_string(),
                content: serde_json::json!([{ "type": "text", "text": summary }]).to_string(),
                created_at: chrono::Utc::now().to_rfc3339(),
                attachments: None,
                tool_calls: None,
                thinking: None,
                engine_uuid_synced: false,
                extra: {
                    let mut extra = Map::new();
                    extra.insert("is_compact_boundary".to_string(), Value::Bool(true));
                    extra
                },
            });
            Ok(())
        }
    })?;
    clear_runtime_state(&conversation_id);

    Ok(CompactConversationResult {
        summary,
        tokens_saved,
        messages_compacted: messages_before_compact,
    })
}

pub(crate) fn generate_conversation_title(
    app: AppHandle,
    conversation_id: String,
    payload: Option<GenerateConversationTitlePayload>,
) -> Result<Value, String> {
    let payload = payload.unwrap_or(GenerateConversationTitlePayload {
        env_token: None,
        env_base_url: None,
    });
    let db = read_db()?;
    let conversation = db
        .conversations
        .iter()
        .find(|conversation| conversation.id == conversation_id)
        .cloned()
        .ok_or_else(|| "Conversation not found".to_string())?;
    let mut messages: Vec<MessageRecord> = db
        .messages
        .iter()
        .filter(|message| message.conversation_id == conversation.id)
        .filter(|message| message_has_visible_content(message))
        .cloned()
        .collect();
    messages.sort_by(|left, right| left.created_at.cmp(&right.created_at));

    let latest_user_message = messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
        .map(|message| parse_message_content(&message.content))
        .unwrap_or_default();
    let latest_assistant_message = messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant")
        .map(|message| parse_message_content(&message.content))
        .unwrap_or_default();

    if latest_user_message.trim().is_empty() || latest_assistant_message.trim().is_empty() {
        return Err("Conversation does not have enough content to generate a title".to_string());
    }

    let (_provider_id, provider, model_id) = find_provider_for_model(&conversation.model)?;
    let title = generate_conversation_title_once(&app, &TitleGenerationContext {
        conversation,
        user_message: latest_user_message,
        assistant_message: latest_assistant_message,
        provider,
        model_id: Some(model_id),
        env_token: payload.env_token,
        env_base_url: payload.env_base_url,
        force: true,
    })?;

    match title {
        Some(title) => Ok(serde_json::json!({ "ok": true, "title": title })),
        None => Err("Title generation returned no result".to_string()),
    }
}

pub(crate) fn start_chat_stream(
    app: AppHandle,
    payload: StartChatStreamPayload,
) -> Result<StartChatStreamResult, String> {
    let (bun_path, engine_env_arg, engine_cli) = resolve_engine_runtime(&app)?;
    let runtime_root = engine_cli
        .parent()
        .and_then(|src| src.parent())
        .map(PathBuf::from)
        .ok_or_else(|| "Invalid runtime layout".to_string())?;
    let db = read_db()?;
    let conversation_snapshot = db
        .conversations
        .iter()
        .find(|conversation| conversation.id == payload.conversation_id)
        .cloned()
        .ok_or_else(|| "Conversation not found".to_string())?;

    let (_provider_id, provider, model_id) = find_provider_for_model(&conversation_snapshot.model)?;
    let system_prompt =
        build_system_prompt(&conversation_snapshot, &db, payload.user_profile.as_ref());
    let attachment_context = materialize_attachments_into_workspace(
        &conversation_snapshot,
        payload.attachments.as_deref().unwrap_or(&[]),
    )?;
    let mut final_message = payload.message.clone();
    final_message.push_str(&build_github_context_prompt(
        &conversation_snapshot.workspace_path,
    ));
    if !attachment_context.copied_files.is_empty() {
        if !attachment_context.image_file_names.is_empty() {
            final_message.push_str("\n\n[The user attached image(s): ");
            final_message.push_str(&attachment_context.image_file_names.join(", "));
            final_message.push_str(
                ". The image(s) are included in this message - you can see them directly.]",
            );
            let non_images: Vec<&String> = attachment_context
                .copied_files
                .iter()
                .filter(|file_name| !attachment_context.image_file_names.contains(file_name))
                .collect();
            if !non_images.is_empty() {
                final_message.push_str("\n[Other attached files - read only when needed:]\n");
                for file_name in non_images {
                    final_message.push_str(&format!("- ./{}\n", file_name));
                }
            }
        } else {
            final_message.push_str("\n\n[Attached files in workspace - read only when needed:]\n");
            for file_name in &attachment_context.copied_files {
                final_message.push_str(&format!("- ./{}\n", file_name));
            }
        }
    }
    let runtime_user_content =
        build_runtime_user_content(final_message, &attachment_context.image_blocks);
    let user_message_id = append_user_message(
        &payload.conversation_id,
        &payload.message,
        payload.attachments.clone(),
    )?;
    let stream_id = Uuid::new_v4().to_string();
    let resume_session_id = conversation_snapshot.claude_session_id.clone();
    let resume_at = if resume_session_id.is_some() {
        conversation_snapshot.pending_resume_at.clone()
    } else {
        None
    };
    if resume_at.is_some() {
        let conversation_id = payload.conversation_id.clone();
        with_db_mutation(move |db| {
            if let Some(conversation) = db
                .conversations
                .iter_mut()
                .find(|conversation| conversation.id == conversation_id)
            {
                conversation.pending_resume_at = None;
            }
            Ok(())
        })?;
    }

    let mut cli_args = Vec::<String>::new();
    if let Some(engine_env_arg) = engine_env_arg {
        cli_args.push(engine_env_arg);
    }
    cli_args.push(engine_cli.to_string_lossy().to_string());
    cli_args.push("-p".to_string());
    cli_args.push("--input-format=stream-json".to_string());
    cli_args.push("--output-format=stream-json".to_string());
    cli_args.push("--verbose".to_string());
    cli_args.push("--include-partial-messages".to_string());
    cli_args.push("--replay-user-messages".to_string());
    cli_args.push("--permission-mode".to_string());
    cli_args.push("bypassPermissions".to_string());
    cli_args.push("--model".to_string());
    cli_args.push(model_id.clone());
    if !system_prompt.trim().is_empty() {
        cli_args.push("--append-system-prompt".to_string());
        cli_args.push(system_prompt);
    }
    if let Some(session_id) = resume_session_id.clone() {
        cli_args.push("--resume".to_string());
        cli_args.push(session_id);
        if let Some(resume_at) = resume_at.clone() {
            cli_args.push("--resume-session-at".to_string());
            cli_args.push(resume_at);
        }
    }

    let env_vars = build_engine_environment(
        &runtime_root,
        provider.as_ref(),
        &model_id,
        payload.env_token.clone(),
        payload.env_base_url.clone(),
    )?;

    let mut command = Command::new(&bun_path);
    command
        .args(&cli_args)
        .current_dir(&conversation_snapshot.workspace_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command.envs(&env_vars);

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Engine stdin unavailable".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Engine stdout unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Engine stderr unavailable".to_string())?;

    let child_handle = Arc::new(Mutex::new(child));
    let stdin_handle = Arc::new(Mutex::new(stdin));
    ACTIVE_CHILDREN
        .lock()
        .map_err(|error| error.to_string())?
        .insert(payload.conversation_id.clone(), Arc::clone(&child_handle));
    ACTIVE_STDIN
        .lock()
        .map_err(|error| error.to_string())?
        .insert(payload.conversation_id.clone(), Arc::clone(&stdin_handle));

    set_stream_state(&payload.conversation_id, |state| {
        *state = NativeStreamState {
            stream_id: Some(stream_id.clone()),
            active: true,
            done: false,
            events: Vec::new(),
            assistant_uuid: None,
            text: String::new(),
            thinking: String::new(),
            thinking_summary: None,
            citations: Vec::new(),
            search_logs: Vec::new(),
            documents: Vec::new(),
            document_drafts: Vec::new(),
            document: None,
            cross_process: false,
            tool_calls: BTreeMap::new(),
            tool_order: Vec::new(),
            pending_work_text: String::new(),
            last_tool_text_offset: 0,
            pending_request_id: None,
            pending_tool_use_id: None,
            pending_ask_input: None,
            user_message: payload.message.clone(),
            title_provider: provider.clone(),
            title_model_id: Some(model_id.clone()),
            title_env_token: payload.env_token.clone(),
            title_env_base_url: payload.env_base_url.clone(),
        };
    })?;

    push_stream_event(
        &app,
        &payload.conversation_id,
        serde_json::json!({
            "type": "system",
            "event": "metadata",
            "user_message_id": user_message_id,
        }),
    )?;
    {
        let mut streams = STREAMS.lock().map_err(|error| error.to_string())?;
        let state = streams
            .get_mut(&payload.conversation_id)
            .ok_or_else(|| "Stream state missing".to_string())?;
        append_context_size_event(&payload.conversation_id, state)?;
    }

    let conversation_id = payload.conversation_id.clone();
    let app_for_stdout = app.clone();
    let conversation_id_for_stdout = conversation_id.clone();
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            let bytes = reader.read_line(&mut line).unwrap_or(0);
            if bytes == 0 {
                break;
            }
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let Ok(event) = serde_json::from_str::<Value>(trimmed) else {
                continue;
            };
            if let Some(session_id) = event.get("session_id").and_then(Value::as_str) {
                let _ = set_stream_state(&conversation_id_for_stdout, |state| {
                    state.events.push(serde_json::json!({
                        "type": "system",
                        "event": "native_session",
                        "session_id": session_id,
                    }));
                });
                let session_id = session_id.to_string();
                let conversation_id = conversation_id_for_stdout.clone();
                let _ = with_db_mutation(move |db| {
                    if let Some(conversation) = db
                        .conversations
                        .iter_mut()
                        .find(|conversation| conversation.id == conversation_id)
                    {
                        if conversation.claude_session_id.as_deref() != Some(session_id.as_str()) {
                            conversation.claude_session_id = Some(session_id);
                        }
                    }
                    Ok(())
                });
            }
            match event.get("type").and_then(Value::as_str) {
                Some("stream_event") => {
                    if let Some(stream_event) = event.get("event").cloned() {
                        if let Some(text_delta) = stream_event
                            .get("delta")
                            .and_then(|delta| delta.get("text"))
                            .and_then(Value::as_str)
                        {
                            let text_delta = text_delta.to_string();
                            let _ = set_stream_state(&conversation_id_for_stdout, |state| {
                                state.pending_work_text.push_str(&text_delta);
                            });
                        }
                        let _ = push_stream_event(
                            &app_for_stdout,
                            &conversation_id_for_stdout,
                            stream_event,
                        );
                    }
                }
                Some("assistant") => {
                    if let Some(uuid) = event.get("uuid").and_then(Value::as_str) {
                        let _ = set_stream_state(&conversation_id_for_stdout, |state| {
                            if state.assistant_uuid.is_none() {
                                state.assistant_uuid = Some(uuid.to_string());
                            }
                        });
                    }
                    if let Some(blocks) = event
                        .get("message")
                        .and_then(|message| message.get("content"))
                        .and_then(Value::as_array)
                    {
                        for block in blocks {
                            if block.get("type").and_then(Value::as_str) != Some("tool_use") {
                                continue;
                            }
                            let tool_use_id = block
                                .get("id")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            let tool_name = block
                                .get("name")
                                .and_then(Value::as_str)
                                .unwrap_or("unknown");
                            let tool_input = block
                                .get("input")
                                .cloned()
                                .unwrap_or(Value::Object(Map::new()));
                            let mut should_emit_start = false;
                            let mut text_before = String::new();
                            let _ = set_stream_state(&conversation_id_for_stdout, |state| {
                                if !state.tool_calls.contains_key(&tool_use_id) {
                                    text_before = state.pending_work_text.trim().to_string();
                                    state.pending_work_text.clear();
                                    state.tool_order.push(tool_use_id.clone());
                                    state.tool_calls.insert(
                                        tool_use_id.clone(),
                                        serde_json::json!({
                                            "id": tool_use_id,
                                            "name": tool_name,
                                            "input": tool_input,
                                            "status": "running",
                                            "textBefore": text_before,
                                        }),
                                    );
                                    should_emit_start = true;
                                } else if let Some(existing) =
                                    state.tool_calls.get_mut(&tool_use_id)
                                {
                                    if let Some(existing_map) = existing.as_object_mut() {
                                        existing_map
                                            .insert("input".to_string(), tool_input.clone());
                                    }
                                }
                            });
                            if should_emit_start {
                                let _ = push_stream_event(
                                    &app_for_stdout,
                                    &conversation_id_for_stdout,
                                    serde_json::json!({
                                        "type": "tool_use_start",
                                        "tool_use_id": tool_use_id,
                                        "tool_name": tool_name,
                                        "tool_input": tool_input,
                                        "textBefore": text_before,
                                    }),
                                );
                            } else {
                                let _ = push_stream_event(
                                    &app_for_stdout,
                                    &conversation_id_for_stdout,
                                    serde_json::json!({
                                        "type": "tool_use_input",
                                        "tool_use_id": tool_use_id,
                                        "tool_input": tool_input,
                                    }),
                                );
                            }
                        }
                    }
                }
                Some("user") => {
                    if let Some(blocks) = event
                        .get("message")
                        .and_then(|message| message.get("content"))
                        .and_then(Value::as_array)
                    {
                        for block in blocks {
                            if block.get("type").and_then(Value::as_str) != Some("tool_result") {
                                continue;
                            }
                            let tool_use_id = block
                                .get("tool_use_id")
                                .and_then(Value::as_str)
                                .unwrap_or_default();
                            let result_text =
                                if let Some(text) = block.get("content").and_then(Value::as_str) {
                                    text.to_string()
                                } else if let Some(items) =
                                    block.get("content").and_then(Value::as_array)
                                {
                                    items
                                        .iter()
                                        .filter_map(|item| item.get("text").and_then(Value::as_str))
                                        .collect::<Vec<_>>()
                                        .join("")
                                } else {
                                    String::new()
                                };
                            let offset = {
                                let mut current_offset = 0usize;
                                let _ = set_stream_state(&conversation_id_for_stdout, |state| {
                                    current_offset = state.text.len();
                                    state.last_tool_text_offset = current_offset;
                                    if !state.tool_calls.contains_key(tool_use_id) {
                                        state.tool_order.push(tool_use_id.to_string());
                                        state.tool_calls.insert(
                                            tool_use_id.to_string(),
                                            serde_json::json!({
                                                "id": tool_use_id,
                                                "name": "unknown",
                                                "input": {},
                                                "status": "running",
                                                "textBefore": "",
                                            }),
                                        );
                                    }
                                    if let Some(tool_call) = state.tool_calls.get_mut(tool_use_id) {
                                        if let Some(tool_call_map) = tool_call.as_object_mut() {
                                            tool_call_map.insert(
                                                "status".to_string(),
                                                Value::String(
                                                    if block
                                                        .get("is_error")
                                                        .and_then(Value::as_bool)
                                                        .unwrap_or(false)
                                                    {
                                                        "error".to_string()
                                                    } else {
                                                        "done".to_string()
                                                    },
                                                ),
                                            );
                                            tool_call_map.insert(
                                                "result".to_string(),
                                                Value::String(result_text.clone()),
                                            );
                                        }
                                    }
                                });
                                current_offset
                            };
                            let _ = push_stream_event(
                                &app_for_stdout,
                                &conversation_id_for_stdout,
                                serde_json::json!({ "type": "tool_text_offset", "offset": offset }),
                            );
                            let _ = push_stream_event(
                                &app_for_stdout,
                                &conversation_id_for_stdout,
                                serde_json::json!({
                                    "type": "tool_use_done",
                                    "tool_use_id": tool_use_id,
                                    "content": result_text,
                                    "is_error": block.get("is_error").and_then(Value::as_bool).unwrap_or(false),
                                }),
                            );
                        }
                    }
                }
                Some("control_request") => {
                    let request_id = event
                        .get("request_id")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                    let tool_use_id = event
                        .get("request")
                        .and_then(|request| request.get("tool_use_id"))
                        .and_then(Value::as_str)
                        .map(str::to_string);
                    let input = event
                        .get("request")
                        .and_then(|request| request.get("input"))
                        .cloned();
                    let _ = set_stream_state(&conversation_id_for_stdout, |state| {
                        state.pending_request_id = request_id.clone();
                        state.pending_tool_use_id = tool_use_id.clone();
                        state.pending_ask_input = input.clone();
                    });
                    let is_ask_user = event
                        .get("request")
                        .and_then(|request| request.get("tool_name"))
                        .and_then(Value::as_str)
                        == Some("AskUserQuestion");
                    if is_ask_user {
                        let _ = push_stream_event(
                            &app_for_stdout,
                            &conversation_id_for_stdout,
                            serde_json::json!({
                                "type": "ask_user",
                                "request_id": request_id,
                                "tool_use_id": tool_use_id,
                                "questions": input
                                    .as_ref()
                                    .and_then(|input| input.get("questions"))
                                    .cloned()
                                    .unwrap_or_else(|| Value::Array(Vec::new())),
                            }),
                        );
                    } else if let Some(stdin) = ACTIVE_STDIN
                        .lock()
                        .ok()
                        .and_then(|stdin_map| stdin_map.get(&conversation_id_for_stdout).cloned())
                    {
                        let request_id_for_response = request_id.clone().unwrap_or_default();
                        let tool_use_id_for_response = tool_use_id.clone().unwrap_or_default();
                        let updated_input =
                            input.clone().unwrap_or_else(|| Value::Object(Map::new()));
                        if let Ok(mut stdin) = stdin.lock() {
                            let response = serde_json::json!({
                                "type": "control_response",
                                "response": {
                                    "subtype": "success",
                                    "request_id": request_id_for_response,
                                    "response": {
                                        "toolUseID": tool_use_id_for_response,
                                        "behavior": "allow",
                                        "updatedInput": updated_input
                                    }
                                }
                            });
                            let _ = stdin.write_all(format!("{}\n", response).as_bytes());
                            let _ = stdin.flush();
                        }
                    }
                }
                Some("system")
                    if event.get("subtype").and_then(Value::as_str) == Some("compact_boundary") =>
                {
                    let _ = push_stream_event(
                        &app_for_stdout,
                        &conversation_id_for_stdout,
                        serde_json::json!({
                            "type": "compact_boundary",
                            "compact_metadata": event.get("compact_metadata").cloned().unwrap_or(Value::Null),
                        }),
                    );
                }
                Some("system")
                    if matches!(
                        event.get("subtype").and_then(Value::as_str),
                        Some("task_started" | "task_progress" | "task_notification")
                    ) =>
                {
                    let _ = push_stream_event(
                        &app_for_stdout,
                        &conversation_id_for_stdout,
                        serde_json::json!({
                            "type": "task_event",
                            "subtype": event.get("subtype").cloned().unwrap_or(Value::Null),
                            "task_id": event.get("task_id").cloned().unwrap_or(Value::Null),
                            "description": event.get("description").cloned().unwrap_or(Value::Null),
                            "status": event.get("status").cloned().unwrap_or(Value::Null),
                            "summary": event.get("summary").cloned().unwrap_or(Value::Null),
                            "usage": event.get("usage").cloned().unwrap_or(Value::Null),
                            "last_tool_name": event.get("last_tool_name").cloned().unwrap_or(Value::Null),
                        }),
                    );
                }
                Some("tool") => {
                    let result_text =
                        if let Some(text) = event.get("content").and_then(Value::as_str) {
                            text.to_string()
                        } else if let Some(items) = event.get("content").and_then(Value::as_array) {
                            items
                                .iter()
                                .filter_map(|item| item.get("text").and_then(Value::as_str))
                                .collect::<Vec<_>>()
                                .join("")
                        } else {
                            String::new()
                        };
                    if event.get("tool_use_id").and_then(Value::as_str).is_some()
                        && result_text.contains("query:")
                        && result_text.contains("Links:")
                    {
                        let query = result_text
                            .split("query:")
                            .nth(1)
                            .and_then(|part| part.split('"').nth(1))
                            .map(str::to_string);
                        let links_json = result_text
                            .split("Links:")
                            .nth(1)
                            .and_then(|part| part.split('\n').next())
                            .map(str::trim)
                            .unwrap_or("");
                        if let (Some(query), Ok(Value::Array(items))) =
                            (query, serde_json::from_str::<Value>(links_json))
                        {
                            let sources: Vec<Value> = items
                                .into_iter()
                                .filter_map(|item| {
                                    let url = item.get("url")?.as_str()?.to_string();
                                    Some(serde_json::json!({
                                        "url": url,
                                        "title": item.get("title").and_then(Value::as_str).unwrap_or_default(),
                                    }))
                                })
                                .collect();
                            if !sources.is_empty() {
                                let _ = set_stream_state(&conversation_id_for_stdout, |state| {
                                    state.search_logs.push(serde_json::json!({
                                        "query": query,
                                        "results": sources,
                                    }));
                                });
                                let _ = push_stream_event(
                                    &app_for_stdout,
                                    &conversation_id_for_stdout,
                                    serde_json::json!({
                                        "type": "search_sources",
                                        "sources": sources,
                                        "query": query,
                                    }),
                                );
                            }
                        }
                    }
                    let tool_use_id = event
                        .get("tool_use_id")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    let offset = {
                        let mut current_offset = 0usize;
                        let _ = set_stream_state(&conversation_id_for_stdout, |state| {
                            current_offset = state.text.len();
                            state.last_tool_text_offset = current_offset;
                            if !tool_use_id.is_empty()
                                && !state.tool_calls.contains_key(tool_use_id)
                            {
                                state.tool_order.push(tool_use_id.to_string());
                                state.tool_calls.insert(
                                    tool_use_id.to_string(),
                                    serde_json::json!({
                                        "id": tool_use_id,
                                        "name": "unknown",
                                        "input": {},
                                        "status": "running",
                                        "textBefore": "",
                                    }),
                                );
                            }
                            if let Some(tool_call) = state.tool_calls.get_mut(tool_use_id) {
                                if let Some(tool_call_map) = tool_call.as_object_mut() {
                                    tool_call_map.insert(
                                        "status".to_string(),
                                        Value::String(
                                            if event
                                                .get("is_error")
                                                .and_then(Value::as_bool)
                                                .unwrap_or(false)
                                            {
                                                "error".to_string()
                                            } else {
                                                "done".to_string()
                                            },
                                        ),
                                    );
                                    tool_call_map.insert(
                                        "result".to_string(),
                                        Value::String(result_text.clone()),
                                    );
                                }
                            }
                        });
                        current_offset
                    };
                    let _ = push_stream_event(
                        &app_for_stdout,
                        &conversation_id_for_stdout,
                        serde_json::json!({ "type": "tool_text_offset", "offset": offset }),
                    );
                    let _ = push_stream_event(
                        &app_for_stdout,
                        &conversation_id_for_stdout,
                        serde_json::json!({
                            "type": "tool_use_done",
                            "tool_use_id": tool_use_id,
                            "content": result_text,
                            "is_error": event.get("is_error").and_then(Value::as_bool).unwrap_or(false),
                        }),
                    );
                }
                Some("result") => {
                    if let Some(result_text) = event.get("result").and_then(Value::as_str) {
                        let missing_text = {
                            let streams = STREAMS.lock().map_err(|error| error.to_string());
                            match streams {
                                Ok(streams) => streams
                                    .get(&conversation_id_for_stdout)
                                    .map(|state| {
                                        if state.text.is_empty() {
                                            result_text.to_string()
                                        } else {
                                            result_text
                                                .strip_prefix(&state.text)
                                                .unwrap_or_default()
                                                .to_string()
                                        }
                                    })
                                    .unwrap_or_else(|| result_text.to_string()),
                                Err(_) => String::new(),
                            }
                        };
                        if !missing_text.is_empty() {
                            let _ = push_stream_event(
                                &app_for_stdout,
                                &conversation_id_for_stdout,
                                serde_json::json!({
                                    "type": "content_block_delta",
                                    "delta": { "type": "text_delta", "text": missing_text }
                                }),
                            );
                        }
                    }
                    let _ = push_stream_event(
                        &app_for_stdout,
                        &conversation_id_for_stdout,
                        serde_json::json!({ "type": "message_stop" }),
                    );
                    let _ = finalize_stream(&app_for_stdout, &conversation_id_for_stdout, None);
                    break;
                }
                _ => {}
            }
        }
    });

    let app_for_stderr = app.clone();
    let conversation_id_for_stderr = conversation_id.clone();
    thread::spawn(move || {
        let mut stderr_reader = BufReader::new(stderr);
        let mut stderr_text = String::new();
        let _ = stderr_reader.read_to_string(&mut stderr_text);
        let trimmed = stderr_text.trim();
        if !trimmed.is_empty() {
            logging::log_error(format!("[NativeChat] {}", trimmed));
            let _ = finalize_stream(
                &app_for_stderr,
                &conversation_id_for_stderr,
                Some(trimmed.to_string()),
            );
        }
    });

    let app_for_close = app.clone();
    let conversation_id_for_close = conversation_id.clone();
    let child_for_close = Arc::clone(&child_handle);
    thread::spawn(move || {
        let exit_code = loop {
            let status = {
                let mut child = match child_for_close.lock() {
                    Ok(child) => child,
                    Err(_) => return,
                };
                child.try_wait()
            };
            match status {
                Ok(Some(status)) => break status.code(),
                Ok(None) => thread::sleep(Duration::from_millis(100)),
                Err(_) => break Some(-1),
            }
        };
        if exit_code.unwrap_or(0) == 0 {
            let _ = finalize_stream(&app_for_close, &conversation_id_for_close, None);
        } else {
            let _ = finalize_stream(
                &app_for_close,
                &conversation_id_for_close,
                Some(format!(
                    "Engine exited with code {}",
                    exit_code.unwrap_or(-1)
                )),
            );
        }
    });

    {
        let mut stdin = stdin_handle.lock().map_err(|error| error.to_string())?;
        let input = serde_json::json!({
            "type": "user",
            "session_id": resume_session_id.unwrap_or_default(),
            "parent_tool_use_id": null,
            "message": { "role": "user", "content": runtime_user_content },
            "uuid": user_message_id,
        });
        stdin
            .write_all(format!("{}\n", input).as_bytes())
            .map_err(|error| error.to_string())?;
        stdin.flush().map_err(|error| error.to_string())?;
    }

    Ok(StartChatStreamResult {
        stream_id: stream_id,
    })
}

pub(crate) fn reconnect_chat_stream(
    conversation_id: String,
) -> Result<ReconnectChatStreamResult, String> {
    let streams = STREAMS.lock().map_err(|error| error.to_string())?;
    let Some(state) = streams.get(&conversation_id) else {
        return Ok(ReconnectChatStreamResult {
            stream_id: None,
            events: Vec::new(),
            done: true,
        });
    };

    Ok(ReconnectChatStreamResult {
        stream_id: state.stream_id.clone(),
        events: state.events.clone(),
        done: state.done,
    })
}
