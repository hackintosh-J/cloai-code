use crate::paths::{self, WorkspaceConfig};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopPreferences {
    onboarding_done: Option<bool>,
    theme: Option<String>,
    send_key: Option<String>,
    newline_key: Option<String>,
    chat_font: Option<String>,
    default_model: Option<String>,
    user_mode: Option<String>,
    parallel_tool_calls: Option<Value>,
    model_context_window_override: Option<Value>,
    sampling_temperature: Option<Value>,
    max_consecutive_identical_tool_calls: Option<Value>,
    max_api_retries: Option<Value>,
    #[serde(rename = "openAIResponsesIncrementalWebSocket")]
    open_ai_responses_incremental_web_socket: Option<Value>,
    #[serde(rename = "openAIPrefixDebug")]
    open_ai_prefix_debug: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetDesktopPreferencesPayload {
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

pub(crate) fn get_desktop_preferences(app: &AppHandle) -> Result<DesktopPreferences, String> {
    let current = paths::read_workspace_config(app)?;
    Ok(DesktopPreferences {
        onboarding_done: current.onboarding_done,
        theme: current.theme,
        send_key: current.send_key,
        newline_key: current.newline_key,
        chat_font: current.chat_font,
        default_model: current.default_model,
        user_mode: current.user_mode,
        parallel_tool_calls: current.parallel_tool_calls,
        model_context_window_override: current.model_context_window_override,
        sampling_temperature: current.sampling_temperature,
        max_consecutive_identical_tool_calls: current.max_consecutive_identical_tool_calls,
        max_api_retries: current.max_api_retries,
        open_ai_responses_incremental_web_socket: current.open_ai_responses_incremental_web_socket,
        open_ai_prefix_debug: current.open_ai_prefix_debug,
    })
}

fn set_if_present(map: &mut Map<String, Value>, key: &str, value: &Option<Value>) -> bool {
    if let Some(value) = value {
        map.insert(key.to_string(), value.clone());
        return true;
    }
    false
}

fn sync_runtime_settings(payload: &SetDesktopPreferencesPayload) -> Result<(), String> {
    let mut changed = false;
    let mut updates = Map::new();
    changed |= set_if_present(
        &mut updates,
        "parallelToolCalls",
        &payload.parallel_tool_calls,
    );
    changed |= set_if_present(
        &mut updates,
        "modelContextWindowOverride",
        &payload.model_context_window_override,
    );
    changed |= set_if_present(
        &mut updates,
        "samplingTemperature",
        &payload.sampling_temperature,
    );
    changed |= set_if_present(
        &mut updates,
        "maxConsecutiveIdenticalToolCalls",
        &payload.max_consecutive_identical_tool_calls,
    );
    changed |= set_if_present(&mut updates, "maxApiRetries", &payload.max_api_retries);
    changed |= set_if_present(
        &mut updates,
        "openAIResponsesIncrementalWebSocket",
        &payload.open_ai_responses_incremental_web_socket,
    );
    changed |= set_if_present(
        &mut updates,
        "openAIPrefixDebug",
        &payload.open_ai_prefix_debug,
    );

    if !changed {
        return Ok(());
    }

    let settings_path = paths::cloai_config_dir()?.join("settings.json");
    paths::ensure_parent(&settings_path)?;
    let mut settings = if settings_path.exists() {
        let raw = fs::read_to_string(&settings_path).map_err(|error| error.to_string())?;
        match serde_json::from_str::<Value>(&raw).map_err(|error| error.to_string())? {
            Value::Object(map) => map,
            _ => return Err("Runtime settings file must contain a JSON object".to_string()),
        }
    } else {
        Map::new()
    };

    for (key, value) in updates {
        if value.is_null() {
            settings.remove(&key);
        } else {
            settings.insert(key, value);
        }
    }

    let body = serde_json::to_string_pretty(&Value::Object(settings))
        .map_err(|error| error.to_string())?;
    paths::safe_write_file(&settings_path, &(body + "\n"))?;
    Ok(())
}

pub(crate) fn set_desktop_preferences(
    app: &AppHandle,
    payload: SetDesktopPreferencesPayload,
) -> Result<(), String> {
    let config_path = paths::workspace_config_path(app)?;
    paths::ensure_parent(&config_path)?;
    let current = paths::read_workspace_config(app).unwrap_or_default();
    sync_runtime_settings(&payload)?;

    let next = WorkspaceConfig {
        workspaces_dir: current.workspaces_dir,
        bun_path: current.bun_path,
        runtime_path: current.runtime_path,
        onboarding_done: payload.onboarding_done.or(current.onboarding_done),
        theme: payload.theme.or(current.theme),
        send_key: payload.send_key.or(current.send_key),
        newline_key: payload.newline_key.or(current.newline_key),
        chat_font: payload.chat_font.or(current.chat_font),
        default_model: payload.default_model.or(current.default_model),
        user_mode: payload.user_mode.or(current.user_mode),
        parallel_tool_calls: payload.parallel_tool_calls.or(current.parallel_tool_calls),
        model_context_window_override: payload
            .model_context_window_override
            .or(current.model_context_window_override),
        sampling_temperature: payload
            .sampling_temperature
            .or(current.sampling_temperature),
        max_consecutive_identical_tool_calls: payload
            .max_consecutive_identical_tool_calls
            .or(current.max_consecutive_identical_tool_calls),
        max_api_retries: payload.max_api_retries.or(current.max_api_retries),
        open_ai_responses_incremental_web_socket: payload
            .open_ai_responses_incremental_web_socket
            .or(current.open_ai_responses_incremental_web_socket),
        open_ai_prefix_debug: payload
            .open_ai_prefix_debug
            .or(current.open_ai_prefix_debug),
    };

    let body = serde_json::to_string_pretty(&next).map_err(|error| error.to_string())?;
    paths::safe_write_file(&config_path, &body)?;
    Ok(())
}
