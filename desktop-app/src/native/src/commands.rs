use crate::artifacts;
use crate::connectors;
use crate::conversations;
use crate::github;
use crate::paths;
use crate::preferences::{self, SetDesktopPreferencesPayload};
use crate::projects;
use crate::providers::{self, ProviderUpsertPayload};
use crate::runtime;
use crate::skills;
use crate::streaming;
use crate::uploads;
use crate::workspace;
use serde::Deserialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize)]
pub(crate) struct FileDialogFilter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct SetWorkspaceConfigPayload {
    dir: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetRuntimeConfigPayload {
    bun_path: Option<String>,
    runtime_path: Option<String>,
    workspaces_dir: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GetConversationsPayload {
    project_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceListPayload {
    root: String,
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceReadFilePayload {
    root: String,
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceWriteFilePayload {
    root: String,
    path: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceCreateEntryPayload {
    root: String,
    parent: Option<String>,
    name: String,
    kind: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceDeletePathPayload {
    root: String,
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceRenamePathPayload {
    root: String,
    path: String,
    new_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitRootPayload {
    root: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitDiffPayload {
    root: String,
    path: Option<String>,
    staged: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitStagePayload {
    root: String,
    path: String,
    staged: bool,
}

async fn run_workspace_blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("Workspace task failed: {error}"))?
}

#[tauri::command]
pub(crate) fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub(crate) fn get_app_path(app: AppHandle) -> Result<String, String> {
    Ok(paths::workspace_config_path(&app)?
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
pub(crate) async fn select_directory(app: AppHandle) -> Result<Option<String>, String> {
    let file_path = tauri_plugin_dialog::DialogExt::dialog(&app)
        .file()
        .blocking_pick_folder();

    Ok(file_path.map(|path| path.to_string()))
}

#[tauri::command]
pub(crate) async fn select_file(
    app: AppHandle,
    filters: Option<Vec<FileDialogFilter>>,
) -> Result<Option<String>, String> {
    let mut dialog = tauri_plugin_dialog::DialogExt::dialog(&app).file();
    if let Some(filters) = filters {
        for filter in filters {
            let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
            dialog = dialog.add_filter(&filter.name, &extensions);
        }
    }

    let selected = dialog.blocking_pick_file();
    Ok(selected.map(|path| path.to_string()))
}

#[tauri::command]
pub(crate) async fn select_bun_file(app: AppHandle) -> Result<Option<String>, String> {
    let selected = tauri_plugin_dialog::DialogExt::dialog(&app)
        .file()
        .blocking_pick_folder();

    Ok(selected
        .and_then(|path| path.into_path().ok())
        .and_then(|path| runtime::normalize_bun_path(&path))
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub(crate) fn open_folder(app: AppHandle, folder_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&folder_path);
    if !path.exists() {
        return Ok(false);
    }

    tauri_plugin_shell::ShellExt::shell(&app)
        .open(folder_path, None)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
pub(crate) fn show_item_in_folder(app: AppHandle, file_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Ok(false);
    }

    if let Some(parent) = path.parent() {
        tauri_plugin_shell::ShellExt::shell(&app)
            .open(parent.to_string_lossy().to_string(), None)
            .map_err(|error| error.to_string())?;
        return Ok(true);
    }

    Ok(false)
}

#[tauri::command]
pub(crate) async fn workspace_list_entries(
    payload: WorkspaceListPayload,
) -> Result<workspace::WorkspaceDirectoryListing, String> {
    run_workspace_blocking(move || workspace::list_entries(payload.root, payload.path)).await
}

#[tauri::command]
pub(crate) async fn workspace_read_file(
    payload: WorkspaceReadFilePayload,
) -> Result<workspace::WorkspaceFileContent, String> {
    run_workspace_blocking(move || workspace::read_file(payload.root, payload.path)).await
}

#[tauri::command]
pub(crate) async fn workspace_read_file_data_url(
    payload: WorkspaceReadFilePayload,
) -> Result<workspace::WorkspaceFileDataUrl, String> {
    run_workspace_blocking(move || workspace::read_file_data_url(payload.root, payload.path)).await
}

#[tauri::command]
pub(crate) async fn workspace_write_file(
    payload: WorkspaceWriteFilePayload,
) -> Result<workspace::WorkspaceFileContent, String> {
    run_workspace_blocking(move || workspace::write_file(payload.root, payload.path, payload.content))
        .await
}

#[tauri::command]
pub(crate) async fn workspace_create_entry(
    payload: WorkspaceCreateEntryPayload,
) -> Result<workspace::WorkspaceEntry, String> {
    run_workspace_blocking(move || {
        workspace::create_entry(payload.root, payload.parent, payload.name, payload.kind)
    })
    .await
}

#[tauri::command]
pub(crate) async fn workspace_delete_path(payload: WorkspaceDeletePathPayload) -> Result<bool, String> {
    run_workspace_blocking(move || workspace::delete_path(payload.root, payload.path)).await
}

#[tauri::command]
pub(crate) async fn workspace_rename_path(
    payload: WorkspaceRenamePathPayload,
) -> Result<workspace::WorkspaceEntry, String> {
    run_workspace_blocking(move || workspace::rename_path(payload.root, payload.path, payload.new_name))
        .await
}

#[tauri::command]
pub(crate) async fn workspace_git_status(
    payload: WorkspaceGitRootPayload,
) -> Result<workspace::WorkspaceGitStatus, String> {
    run_workspace_blocking(move || workspace::git_status(payload.root)).await
}

#[tauri::command]
pub(crate) async fn workspace_git_diff(
    payload: WorkspaceGitDiffPayload,
) -> Result<workspace::WorkspaceGitDiff, String> {
    run_workspace_blocking(move || {
        workspace::git_diff(payload.root, payload.path, payload.staged.unwrap_or(false))
    })
    .await
}

#[tauri::command]
pub(crate) async fn workspace_git_stage(payload: WorkspaceGitStagePayload) -> Result<bool, String> {
    run_workspace_blocking(move || workspace::git_stage(payload.root, payload.path, payload.staged))
        .await
}

#[tauri::command]
pub(crate) fn resize_window(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn get_workspace_config(
    app: AppHandle,
) -> Result<runtime::WorkspaceConfigResponse, String> {
    runtime::get_workspace_config(&app)
}

#[tauri::command]
pub(crate) fn set_workspace_config(
    app: AppHandle,
    payload: SetWorkspaceConfigPayload,
) -> Result<(), String> {
    runtime::set_workspace_config(&app, payload.dir)
}

#[tauri::command]
pub(crate) fn get_runtime_setup_status(
    app: AppHandle,
) -> Result<runtime::RuntimeSetupStatus, String> {
    runtime::get_runtime_setup_status(&app)
}

#[tauri::command]
pub(crate) fn get_system_status() -> runtime::SystemStatus {
    runtime::get_system_status()
}

#[tauri::command]
pub(crate) fn set_runtime_config(
    app: AppHandle,
    payload: SetRuntimeConfigPayload,
) -> Result<(), String> {
    runtime::set_runtime_config(
        &app,
        payload.bun_path,
        payload.runtime_path,
        payload.workspaces_dir,
    )
}

#[tauri::command]
pub(crate) fn desktop_config_exists(app: AppHandle) -> Result<bool, String> {
    Ok(paths::workspace_config_path(&app)?.exists())
}

#[tauri::command]
pub(crate) fn get_desktop_preferences(
    app: AppHandle,
) -> Result<preferences::DesktopPreferences, String> {
    preferences::get_desktop_preferences(&app)
}

#[tauri::command]
pub(crate) fn set_desktop_preferences(
    app: AppHandle,
    payload: SetDesktopPreferencesPayload,
) -> Result<(), String> {
    preferences::set_desktop_preferences(&app, payload)
}

#[tauri::command]
pub(crate) fn import_cloai_providers(
    path: Option<String>,
) -> Result<providers::CloaiProviderImportResult, String> {
    providers::import_cloai_providers(path)
}

#[tauri::command]
pub(crate) fn get_providers() -> Result<Vec<providers::ImportedProvider>, String> {
    providers::get_providers()
}

#[tauri::command]
pub(crate) fn create_provider(
    payload: ProviderUpsertPayload,
) -> Result<providers::ImportedProvider, String> {
    providers::create_provider(payload)
}

#[tauri::command]
pub(crate) fn update_provider(
    id: String,
    payload: ProviderUpsertPayload,
) -> Result<providers::ImportedProvider, String> {
    providers::update_provider(id, payload)
}

#[tauri::command]
pub(crate) fn delete_provider(id: String) -> Result<bool, String> {
    providers::delete_provider(id)
}

#[tauri::command]
pub(crate) fn get_provider_models() -> Result<Vec<providers::ProviderModelListItem>, String> {
    providers::get_provider_models()
}

#[tauri::command]
pub(crate) fn test_provider_websearch(
    id: String,
) -> Result<providers::WebSearchTestResult, String> {
    providers::test_provider_websearch(id)
}

#[tauri::command]
pub(crate) fn start_openai_oauth_provider(
    app: AppHandle,
) -> Result<providers::ProviderOAuthStartResult, String> {
    providers::start_openai_oauth_provider(|auth_url| {
        tauri_plugin_shell::ShellExt::shell(&app)
            .open(auth_url.to_string(), None)
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub(crate) fn get_provider_presets() -> Vec<providers::ProviderPreset> {
    providers::get_provider_presets()
}

#[tauri::command]
pub(crate) fn get_conversations(
    payload: Option<GetConversationsPayload>,
) -> Result<Vec<conversations::ConversationSummary>, String> {
    conversations::list_conversations(payload.and_then(|payload| payload.project_id))
}

#[tauri::command]
pub(crate) fn get_conversation(id: String) -> Result<conversations::ConversationDetail, String> {
    conversations::get_conversation(id)
}

#[tauri::command]
pub(crate) fn create_conversation(
    app: AppHandle,
    payload: conversations::CreateConversationPayload,
) -> Result<conversations::ConversationSummary, String> {
    conversations::create_conversation(&app, payload)
}

#[tauri::command]
pub(crate) fn update_conversation(
    id: String,
    payload: conversations::UpdateConversationPayload,
) -> Result<conversations::ConversationSummary, String> {
    conversations::update_conversation(id, payload)
}

#[tauri::command]
pub(crate) fn delete_conversation(id: String) -> Result<serde_json::Value, String> {
    conversations::delete_conversation(id)
}

#[tauri::command]
pub(crate) fn get_context_size(
    conversation_id: String,
) -> Result<conversations::ContextSize, String> {
    conversations::get_context_size(conversation_id)
}

#[tauri::command]
pub(crate) fn delete_messages_from(
    conversation_id: String,
    message_id: String,
    payload: Option<conversations::PreserveAttachmentsPayload>,
) -> Result<conversations::ConversationMutationResult, String> {
    conversations::delete_messages_from(conversation_id, message_id, payload)
}

#[tauri::command]
pub(crate) fn delete_messages_tail(
    conversation_id: String,
    count: i64,
    payload: Option<conversations::PreserveAttachmentsPayload>,
) -> Result<conversations::ConversationMutationResult, String> {
    conversations::delete_messages_tail(conversation_id, count, payload)
}

#[tauri::command]
pub(crate) fn warm_engine(
    conversation_id: String,
    payload: Option<streaming::WarmEnginePayload>,
) -> Result<streaming::WarmEngineResult, String> {
    streaming::warm_engine(conversation_id, payload)
}

#[tauri::command]
pub(crate) fn get_stream_status(
    conversation_id: String,
) -> Result<streaming::StreamStatus, String> {
    streaming::get_stream_status(conversation_id)
}

#[tauri::command]
pub(crate) fn get_generation_status(
    conversation_id: String,
) -> Result<streaming::GenerationStatus, String> {
    streaming::get_generation_status(conversation_id)
}

#[tauri::command]
pub(crate) fn stop_generation(
    conversation_id: String,
) -> Result<streaming::StopGenerationResult, String> {
    streaming::stop_generation(conversation_id)
}

#[tauri::command]
pub(crate) fn answer_user_question(
    conversation_id: String,
    payload: streaming::AnswerUserQuestionPayload,
) -> Result<streaming::AnswerUserQuestionResult, String> {
    streaming::answer_user_question(conversation_id, payload)
}

#[tauri::command]
pub(crate) fn submit_code_result(
    app: AppHandle,
    conversation_id: String,
    payload: streaming::CodeResultPayload,
) -> Result<streaming::SubmitCodeResultResponse, String> {
    streaming::submit_code_result(app, conversation_id, payload)
}

#[tauri::command]
pub(crate) fn compact_conversation(
    app: AppHandle,
    conversation_id: String,
    payload: Option<streaming::CompactConversationPayload>,
) -> Result<streaming::CompactConversationResult, String> {
    streaming::compact_conversation(app, conversation_id, payload)
}

#[tauri::command]
pub(crate) fn generate_conversation_title(
    app: AppHandle,
    conversation_id: String,
    payload: Option<streaming::GenerateConversationTitlePayload>,
) -> Result<serde_json::Value, String> {
    streaming::generate_conversation_title(app, conversation_id, payload)
}

#[tauri::command]
pub(crate) fn start_chat_stream(
    app: AppHandle,
    payload: streaming::StartChatStreamPayload,
) -> Result<streaming::StartChatStreamResult, String> {
    streaming::start_chat_stream(app, payload)
}

#[tauri::command]
pub(crate) fn reconnect_chat_stream(
    conversation_id: String,
) -> Result<streaming::ReconnectChatStreamResult, String> {
    streaming::reconnect_chat_stream(conversation_id)
}

#[tauri::command]
pub(crate) fn get_github_status() -> Result<github::GithubStatus, String> {
    github::get_github_status()
}

#[tauri::command]
pub(crate) fn get_github_auth_url() -> Result<github::GithubAuthUrl, String> {
    github::get_github_auth_url()
}

#[tauri::command]
pub(crate) fn disconnect_github() -> Result<github::GithubDisconnectResult, String> {
    github::disconnect_github()
}

#[tauri::command]
pub(crate) fn get_github_repos(page: Option<i64>) -> Result<Vec<github::GithubRepo>, String> {
    github::get_github_repos(page.unwrap_or(1))
}

#[tauri::command]
pub(crate) fn get_github_tree(
    owner: String,
    repo: String,
    r#ref: Option<String>,
) -> Result<github::GithubTree, String> {
    github::get_github_tree(owner, repo, r#ref)
}

#[tauri::command]
pub(crate) fn get_github_contents(
    owner: String,
    repo: String,
    path: Option<String>,
    r#ref: Option<String>,
) -> Result<serde_json::Value, String> {
    github::get_github_contents(owner, repo, path, r#ref)
}

#[tauri::command]
pub(crate) fn materialize_github(
    conversation_id: String,
    repo_full_name: String,
    r#ref: Option<String>,
    selections: Vec<github::GithubSelection>,
) -> Result<github::GithubMaterializeResult, String> {
    github::materialize_github(conversation_id, repo_full_name, r#ref, selections)
}

#[tauri::command]
pub(crate) fn get_projects() -> Result<Vec<projects::ProjectSummary>, String> {
    projects::list_projects()
}

#[tauri::command]
pub(crate) fn create_project(
    payload: projects::CreateProjectPayload,
) -> Result<projects::ProjectRecord, String> {
    projects::create_project(payload)
}

#[tauri::command]
pub(crate) fn get_project(id: String) -> Result<projects::ProjectDetail, String> {
    projects::get_project(id)
}

#[tauri::command]
pub(crate) fn update_project(
    id: String,
    payload: projects::UpdateProjectPayload,
) -> Result<projects::ProjectRecord, String> {
    projects::update_project(id, payload)
}

#[tauri::command]
pub(crate) fn delete_project(id: String) -> Result<serde_json::Value, String> {
    projects::delete_project(id)
}

#[tauri::command]
pub(crate) fn upload_project_file(
    project_id: String,
    payload: projects::UploadProjectFilePayload,
) -> Result<projects::ProjectFileRecord, String> {
    projects::upload_project_file(project_id, payload)
}

#[tauri::command]
pub(crate) fn delete_project_file(
    project_id: String,
    file_id: String,
) -> Result<serde_json::Value, String> {
    projects::delete_project_file(project_id, file_id)
}

#[tauri::command]
pub(crate) fn get_project_conversations(
    id: String,
) -> Result<Vec<conversations::ConversationRecord>, String> {
    projects::get_project_conversations(id)
}

#[tauri::command]
pub(crate) fn create_project_conversation(
    id: String,
    payload: projects::CreateProjectConversationPayload,
) -> Result<conversations::ConversationRecord, String> {
    projects::create_project_conversation(id, payload)
}

#[tauri::command]
pub(crate) fn upload_file(
    payload: uploads::UploadFilePayload,
) -> Result<uploads::UploadResult, String> {
    uploads::upload_file(payload)
}

#[tauri::command]
pub(crate) fn get_upload_path(
    file_id: String,
    conversation_id: Option<String>,
) -> Result<uploads::UploadPathResult, String> {
    uploads::get_upload_path(file_id, conversation_id)
}

#[tauri::command]
pub(crate) fn read_upload_raw(
    file_id: String,
    conversation_id: Option<String>,
) -> Result<uploads::UploadRawResult, String> {
    uploads::read_upload_raw(file_id, conversation_id)
}

#[tauri::command]
pub(crate) fn delete_upload(
    file_id: String,
    conversation_id: Option<String>,
) -> Result<serde_json::Value, String> {
    uploads::delete_upload(file_id, conversation_id)
}

#[tauri::command]
pub(crate) fn get_artifacts(app: AppHandle) -> Result<Vec<artifacts::ArtifactRecord>, String> {
    artifacts::get_artifacts(&app)
}

#[tauri::command]
pub(crate) fn get_artifact_content(
    app: AppHandle,
    file_path: String,
) -> Result<artifacts::ArtifactContent, String> {
    artifacts::get_artifact_content(&app, file_path)
}

#[tauri::command]
pub(crate) fn get_skills(app: AppHandle) -> Result<skills::SkillsResponse, String> {
    skills::list_skills(&app)
}

#[tauri::command]
pub(crate) fn get_skill_detail(app: AppHandle, id: String) -> Result<skills::Skill, String> {
    skills::get_skill_detail(&app, id)
}

#[tauri::command]
pub(crate) fn get_skill_file(
    app: AppHandle,
    id: String,
    file_path: String,
) -> Result<skills::SkillFileContent, String> {
    skills::get_skill_file(&app, id, file_path)
}

#[tauri::command]
pub(crate) fn import_skill(
    app: AppHandle,
    payload: skills::SkillImportPayload,
) -> Result<skills::Skill, String> {
    skills::import_skill(&app, payload)
}

#[tauri::command]
pub(crate) fn create_skill(
    app: AppHandle,
    payload: skills::SkillUpsertPayload,
) -> Result<skills::Skill, String> {
    skills::create_skill(&app, payload)
}

#[tauri::command]
pub(crate) fn update_skill(
    app: AppHandle,
    id: String,
    payload: skills::SkillUpsertPayload,
) -> Result<skills::Skill, String> {
    skills::update_skill(&app, id, payload)
}

#[tauri::command]
pub(crate) fn delete_skill(
    app: AppHandle,
    id: String,
) -> Result<skills::SkillDeleteResult, String> {
    skills::delete_skill(&app, id)
}

#[tauri::command]
pub(crate) fn toggle_skill(
    app: AppHandle,
    id: String,
    enabled: bool,
) -> Result<skills::SkillToggleResult, String> {
    skills::toggle_skill(&app, id, enabled)
}

#[tauri::command]
pub(crate) fn get_connector_mcp_status() -> Result<connectors::ConnectorMcpStatusResponse, String> {
    connectors::get_mcp_status()
}

#[tauri::command]
pub(crate) fn install_connector_mcp(
    connector_id: String,
) -> Result<connectors::ConnectorMcpStatusResponse, String> {
    connectors::install_mcp_connector(connector_id)
}

#[tauri::command]
pub(crate) fn uninstall_connector_mcp(
    connector_id: String,
) -> Result<connectors::ConnectorMcpStatusResponse, String> {
    connectors::uninstall_mcp_connector(connector_id)
}

#[tauri::command]
pub(crate) fn get_connector_composio_status(
    user_id: Option<String>,
) -> Result<connectors::ConnectorComposioStatusResponse, String> {
    connectors::get_composio_status(user_id)
}

#[tauri::command]
pub(crate) fn get_connector_composio_config(
) -> Result<connectors::ConnectorComposioConfigResponse, String> {
    connectors::get_composio_config()
}

#[tauri::command]
pub(crate) fn set_connector_composio_config(
    payload: connectors::SetConnectorComposioConfigPayload,
) -> Result<connectors::ConnectorComposioStatusResponse, String> {
    connectors::set_composio_config(payload)
}

#[tauri::command]
pub(crate) fn connect_connector_via_composio(
    connector_id: String,
    user_id: String,
) -> Result<connectors::ConnectorComposioConnectResponse, String> {
    connectors::connect_connector_via_composio(connector_id, user_id)
}

#[tauri::command]
pub(crate) fn uninstall_connector_composio(
    user_id: String,
) -> Result<connectors::ConnectorComposioUninstallResponse, String> {
    connectors::uninstall_connector_composio(user_id)
}
