use crate::logging;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::AppHandle;

static DESKTOP_DB_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceConfig {
    pub(crate) workspaces_dir: Option<String>,
    pub(crate) bun_path: Option<String>,
    pub(crate) runtime_path: Option<String>,
    pub(crate) onboarding_done: Option<bool>,
    pub(crate) theme: Option<String>,
    pub(crate) send_key: Option<String>,
    pub(crate) newline_key: Option<String>,
    pub(crate) chat_font: Option<String>,
    pub(crate) default_model: Option<String>,
    pub(crate) user_mode: Option<String>,
    pub(crate) parallel_tool_calls: Option<Value>,
    pub(crate) model_context_window_override: Option<Value>,
    pub(crate) sampling_temperature: Option<Value>,
    pub(crate) max_consecutive_identical_tool_calls: Option<Value>,
    pub(crate) max_api_retries: Option<Value>,
    #[serde(rename = "openAIResponsesIncrementalWebSocket")]
    pub(crate) open_ai_responses_incremental_web_socket: Option<Value>,
    #[serde(rename = "openAIPrefixDebug")]
    pub(crate) open_ai_prefix_debug: Option<Value>,
}

pub(crate) fn cloai_config_dir() -> Result<PathBuf, String> {
    let home =
        dirs::home_dir().ok_or_else(|| "Unable to determine user home directory".to_string())?;
    Ok(home.join(".cloai"))
}

pub(crate) fn desktop_config_root() -> Result<PathBuf, String> {
    Ok(cloai_config_dir()?.join("desktop"))
}

pub(crate) fn desktop_db_lock() -> Result<MutexGuard<'static, ()>, String> {
    DESKTOP_DB_LOCK.lock().map_err(|error| error.to_string())
}

pub(crate) fn default_workspace_dir() -> Result<PathBuf, String> {
    Ok(desktop_config_root()?.join("workspaces"))
}

pub(crate) fn desktop_logs_dir() -> Result<PathBuf, String> {
    Ok(desktop_config_root()?.join("logs"))
}

pub(crate) fn cloai_credentials_path() -> Result<PathBuf, String> {
    Ok(cloai_config_dir()?.join(".credentials.json"))
}

pub(crate) fn workspace_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let _ = app;
    Ok(desktop_config_root()?.join("config.json"))
}

pub(crate) fn read_workspace_config(app: &AppHandle) -> Result<WorkspaceConfig, String> {
    let config_path = workspace_config_path(app)?;
    if !config_path.exists() {
        return Ok(WorkspaceConfig::default());
    }

    let raw = fs::read_to_string(config_path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

pub(crate) fn resolve_workspace_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let default_dir = default_workspace_dir()?;
    let config = read_workspace_config(app)?;

    Ok(config
        .workspaces_dir
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or(default_dir))
}

pub(crate) fn ensure_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn safe_write_file(path: &Path, content: &str) -> Result<PathBuf, String> {
    match fs::write(path, content) {
        Ok(_) => Ok(path.to_path_buf()),
        Err(error) => {
            logging::log_error(format!(
                "[Tauri] Failed to write to {}: {}",
                path.display(),
                error
            ));

            let Some(home) = dirs::home_dir() else {
                return Err(format!("Cannot write file: {} (no home directory)", error));
            };

            let fallback_dir = home.join(".cloai").join("desktop").join("fallback");
            if let Err(mkdir_error) = fs::create_dir_all(&fallback_dir) {
                logging::log_error(format!(
                    "[Tauri] Failed to create fallback directory: {}",
                    mkdir_error
                ));
                return Err(format!(
                    "Cannot write file: {} (fallback also failed)",
                    error
                ));
            }

            let fallback_path = fallback_dir.join(
                path.file_name()
                    .unwrap_or_else(|| std::ffi::OsStr::new("config.json")),
            );

            match fs::write(&fallback_path, content) {
                Ok(_) => {
                    logging::log_info(format!(
                        "[Tauri] Using fallback path: {}",
                        fallback_path.display()
                    ));
                    Ok(fallback_path)
                }
                Err(fallback_error) => Err(format!(
                    "Cannot write file: {} (fallback error: {})",
                    error, fallback_error
                )),
            }
        }
    }
}

pub(crate) fn read_json_file(path: &Path, fallback: Value) -> Value {
    if !path.exists() {
        return fallback;
    }

    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .unwrap_or(fallback)
}

pub(crate) fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    ensure_parent(path)?;
    let body = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    safe_write_file(path, &body)?;
    Ok(())
}

pub(crate) fn read_runtime_credentials() -> Result<Value, String> {
    Ok(read_json_file(
        &cloai_credentials_path()?,
        Value::Object(Map::new()),
    ))
}

pub(crate) fn write_runtime_credentials(value: &Value) -> Result<(), String> {
    write_json_file(&cloai_credentials_path()?, value)
}
