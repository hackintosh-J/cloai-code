use crate::paths::{self, WorkspaceConfig};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceConfigResponse {
    pub(crate) workspaces_dir: String,
    pub(crate) default_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeSetupStatus {
    pub(crate) bun: RuntimeTargetStatus,
    pub(crate) runtime: RuntimeTargetStatus,
    pub(crate) workspace: WorkspacePathStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeTargetStatus {
    pub(crate) detected: bool,
    pub(crate) path: Option<String>,
    pub(crate) version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspacePathStatus {
    pub(crate) path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitBashStatus {
    pub(crate) required: bool,
    pub(crate) found: bool,
    pub(crate) path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SystemStatus {
    pub(crate) desktop_version: String,
    pub(crate) platform: String,
    pub(crate) git_bash: GitBashStatus,
}

fn bun_executable_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "bun.exe"
    } else {
        "bun"
    }
}

fn find_git_bash_path() -> Option<PathBuf> {
    if !cfg!(target_os = "windows") {
        return None;
    }

    let mut candidates = Vec::new();
    if let Some(home) = dirs::home_dir() {
        candidates.push(
            home.join("AppData")
                .join("Local")
                .join("Programs")
                .join("Git")
                .join("bin")
                .join("bash.exe"),
        );
    }
    candidates.push(PathBuf::from(r"C:\Program Files\Git\bin\bash.exe"));
    candidates.push(PathBuf::from(r"C:\Program Files (x86)\Git\bin\bash.exe"));

    candidates.into_iter().find(|candidate| candidate.exists())
}

pub(crate) fn normalize_bun_path(path: &Path) -> Option<PathBuf> {
    if path.is_file() && looks_like_bun_path(path) {
        return Some(path.to_path_buf());
    }

    if path.is_dir() {
        let direct_candidate = path.join(bun_executable_name());
        if direct_candidate.exists() {
            return Some(direct_candidate);
        }

        let bin_candidate = path.join("bin").join(bun_executable_name());
        if bin_candidate.exists() {
            return Some(bin_candidate);
        }
    }

    None
}

pub(crate) fn looks_like_bun_path(path: &Path) -> bool {
    match path.file_name().and_then(|name| name.to_str()) {
        Some(name) if cfg!(target_os = "windows") => name.eq_ignore_ascii_case("bun.exe"),
        Some(name) => name == "bun",
        None => false,
    }
}

pub(crate) fn resolve_bun_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let config = paths::read_workspace_config(app)?;
    if let Some(path) = config.bun_path.filter(|value| !value.trim().is_empty()) {
        let candidate = PathBuf::from(path);
        if let Some(normalized) = normalize_bun_path(&candidate) {
            return Ok(Some(normalized));
        }
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if cfg!(target_os = "windows") {
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join(".bun").join("bin").join("bun.exe"));
        }
    } else {
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join(".bun").join("bin").join("bun"));
        }
        candidates.push(PathBuf::from("/usr/local/bin/bun"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/bun"));
    }

    for candidate in candidates {
        if let Some(normalized) = normalize_bun_path(&candidate) {
            return Ok(Some(normalized));
        }
    }

    Ok(None)
}

pub(crate) fn resolve_runtime_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let config = paths::read_workspace_config(app)?;
    if let Some(path) = config.runtime_path.filter(|value| !value.trim().is_empty()) {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return Ok(Some(candidate));
        }
    }

    let cwd = std::env::current_dir().map_err(|error| error.to_string())?;
    let mut candidates: Vec<PathBuf> = Vec::new();

    for ancestor in cwd.ancestors() {
        candidates.push(ancestor.to_path_buf());
    }
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join("workspace").join("cloai-code"));
    }

    for candidate in candidates {
        if candidate.join("package.json").exists()
            && candidate.join("src").join("dev-entry.ts").exists()
        {
            return Ok(Some(candidate));
        }
    }

    Ok(None)
}

fn command_version(command_path: &Path, args: &[&str]) -> Option<String> {
    let mut command = Command::new(command_path);
    command.args(args);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8(output.stdout).ok()?;
    let version = stdout.lines().next()?.trim().to_string();
    if version.is_empty() {
        return None;
    }
    Some(version)
}

fn command_version_in_dir(
    command_path: &Path,
    working_dir: &Path,
    args: &[&str],
) -> Option<String> {
    let mut command = Command::new(command_path);
    command.current_dir(working_dir).args(args);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8(output.stdout).ok()?;
    let version = stdout.lines().next()?.trim().to_string();
    if version.is_empty() {
        return None;
    }
    Some(version)
}

pub(crate) fn get_workspace_config(app: &AppHandle) -> Result<WorkspaceConfigResponse, String> {
    let default_dir = paths::default_workspace_dir()?;
    let workspaces_dir = paths::resolve_workspace_dir(app)?;

    Ok(WorkspaceConfigResponse {
        workspaces_dir: workspaces_dir.to_string_lossy().to_string(),
        default_dir: default_dir.to_string_lossy().to_string(),
    })
}

pub(crate) fn set_workspace_config(app: &AppHandle, dir: String) -> Result<(), String> {
    let resolved = PathBuf::from(dir);
    let config_path = paths::workspace_config_path(app)?;
    paths::ensure_parent(&config_path)?;
    let current = paths::read_workspace_config(app)?;

    let body = serde_json::to_string_pretty(&WorkspaceConfig {
        workspaces_dir: Some(resolved.to_string_lossy().to_string()),
        bun_path: current.bun_path,
        runtime_path: current.runtime_path,
        onboarding_done: current.onboarding_done,
        theme: current.theme,
        send_key: current.send_key,
        newline_key: current.newline_key,
        chat_font: current.chat_font,
        default_model: current.default_model,
        user_mode: current.user_mode,
    })
    .map_err(|error| error.to_string())?;

    paths::safe_write_file(&config_path, &body)?;
    Ok(())
}

pub(crate) fn get_runtime_setup_status(app: &AppHandle) -> Result<RuntimeSetupStatus, String> {
    let bun_path = resolve_bun_path(app)?;
    let runtime_path = resolve_runtime_path(app)?;
    let workspace_path = paths::resolve_workspace_dir(app)?;

    let bun_version = bun_path
        .as_ref()
        .and_then(|path| command_version(path, &["--version"]));
    let runtime_version = match (bun_path.as_ref(), runtime_path.as_ref()) {
        (Some(bun), Some(runtime)) => command_version_in_dir(bun, runtime, &["run", "version"]),
        _ => None,
    };

    Ok(RuntimeSetupStatus {
        bun: RuntimeTargetStatus {
            detected: bun_path
                .as_ref()
                .map(|path| looks_like_bun_path(path))
                .unwrap_or(false),
            path: bun_path.map(|path| path.to_string_lossy().to_string()),
            version: bun_version,
        },
        runtime: RuntimeTargetStatus {
            detected: runtime_path.is_some(),
            path: runtime_path.map(|path| path.to_string_lossy().to_string()),
            version: runtime_version,
        },
        workspace: WorkspacePathStatus {
            path: workspace_path.to_string_lossy().to_string(),
        },
    })
}

pub(crate) fn get_system_status() -> SystemStatus {
    let git_bash = find_git_bash_path();
    SystemStatus {
        desktop_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        git_bash: GitBashStatus {
            required: cfg!(target_os = "windows"),
            found: git_bash.is_some(),
            path: git_bash.map(|path| path.to_string_lossy().to_string()),
        },
    }
}

pub(crate) fn set_runtime_config(
    app: &AppHandle,
    bun_path: Option<String>,
    runtime_path: Option<String>,
    workspaces_dir: Option<String>,
) -> Result<(), String> {
    let config_path = paths::workspace_config_path(app)?;
    paths::ensure_parent(&config_path)?;

    let current = paths::read_workspace_config(app).unwrap_or_default();

    let next = WorkspaceConfig {
        workspaces_dir: workspaces_dir.or(current.workspaces_dir),
        bun_path: bun_path
            .map(PathBuf::from)
            .and_then(|path| normalize_bun_path(&path).or(Some(path)))
            .map(|path| path.to_string_lossy().to_string())
            .or(current.bun_path),
        runtime_path: runtime_path.or(current.runtime_path),
        onboarding_done: current.onboarding_done,
        theme: current.theme,
        send_key: current.send_key,
        newline_key: current.newline_key,
        chat_font: current.chat_font,
        default_model: current.default_model,
        user_mode: current.user_mode,
    };

    let body = serde_json::to_string_pretty(&next).map_err(|error| error.to_string())?;
    paths::safe_write_file(&config_path, &body)?;
    Ok(())
}
