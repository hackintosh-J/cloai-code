use crate::paths::{self, WorkspaceConfig};
use serde::{Deserialize, Serialize};
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
    })
}

pub(crate) fn set_desktop_preferences(
    app: &AppHandle,
    payload: SetDesktopPreferencesPayload,
) -> Result<(), String> {
    let config_path = paths::workspace_config_path(app)?;
    paths::ensure_parent(&config_path)?;
    let current = paths::read_workspace_config(app).unwrap_or_default();

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
    };

    let body = serde_json::to_string_pretty(&next).map_err(|error| error.to_string())?;
    paths::safe_write_file(&config_path, &body)?;
    Ok(())
}
