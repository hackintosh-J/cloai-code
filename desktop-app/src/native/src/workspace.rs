use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::UNIX_EPOCH;

use base64::Engine as _;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const MAX_LIST_ENTRIES: usize = 1_000;
const MAX_FILE_PREVIEW_BYTES: u64 = 1_000_000;
const MAX_IMAGE_PREVIEW_BYTES: u64 = 15_000_000;
const MAX_DIFF_CHARS: usize = 300_000;
const MAX_GIT_STATUS_ENTRIES: usize = 1_000;
const MAX_GIT_STATUS_SCAN_LINES: usize = 2_000;
const DIFF_TRUNCATED_MARKER: &str = "\n\n... diff truncated ...";
const HEAVY_DIRECTORY_NAMES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    ".next",
    "build",
    "out",
];

fn git_program() -> &'static str {
    if cfg!(target_os = "windows") {
        "git.exe"
    } else {
        "git"
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified: Option<i64>,
    extension: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceDirectoryListing {
    path: String,
    entries: Vec<WorkspaceEntry>,
    truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceFileContent {
    path: String,
    name: String,
    content: String,
    size: u64,
    is_binary: bool,
    truncated: bool,
    extension: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceFileDataUrl {
    path: String,
    name: String,
    data_url: String,
    mime_type: String,
    size: u64,
    extension: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitStatus {
    is_repo: bool,
    branch: Option<String>,
    entries: Vec<WorkspaceGitFile>,
    truncated: bool,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitFile {
    path: String,
    old_path: Option<String>,
    index: String,
    working_tree: String,
    staged: bool,
    unstaged: bool,
    label: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitDiff {
    is_repo: bool,
    path: Option<String>,
    staged: bool,
    diff: String,
    truncated: bool,
    error: Option<String>,
}

fn canonical_root(root: &str) -> Result<PathBuf, String> {
    let root_path = PathBuf::from(root);
    let canonical = root_path
        .canonicalize()
        .map_err(|error| format!("Workspace not found: {error}"))?;

    if !canonical.is_dir() {
        return Err("Workspace root is not a directory".to_string());
    }

    Ok(canonical)
}

fn normalize_relative(path: Option<&str>) -> Result<PathBuf, String> {
    let raw = path.unwrap_or("").trim();
    let mut relative = PathBuf::new();

    for segment in raw.replace('\\', "/").split('/') {
        let segment = segment.trim();
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return Err("Path cannot leave the workspace".to_string());
        }
        if segment.contains(':') {
            return Err("Absolute paths are not allowed inside workspace operations".to_string());
        }
        relative.push(segment);
    }

    Ok(relative)
}

fn safe_child_name(name: &str) -> Result<&str, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if trimmed == "." || trimmed == ".." || trimmed.contains('/') || trimmed.contains('\\') {
        return Err("Name must be a single file or folder name".to_string());
    }
    Ok(trimmed)
}

fn is_heavy_directory_name(name: &str) -> bool {
    HEAVY_DIRECTORY_NAMES
        .iter()
        .any(|skipped| name.eq_ignore_ascii_case(skipped))
}

fn relative_to_slash(path: &Path) -> String {
    path.components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

fn resolve_existing(root: &Path, path: Option<&str>) -> Result<PathBuf, String> {
    let relative = normalize_relative(path)?;
    let target = root.join(relative);
    let canonical = target
        .canonicalize()
        .map_err(|error| format!("Path not found: {error}"))?;

    if !canonical.starts_with(root) {
        return Err("Path cannot leave the workspace".to_string());
    }

    Ok(canonical)
}

fn resolve_parent(root: &Path, parent: Option<&str>) -> Result<PathBuf, String> {
    let parent = resolve_existing(root, parent)?;
    if !parent.is_dir() {
        return Err("Parent path is not a directory".to_string());
    }
    Ok(parent)
}

fn entry_for(root: &Path, target: &Path) -> Result<WorkspaceEntry, String> {
    let metadata = fs::metadata(target).map_err(|error| error.to_string())?;
    let relative = target
        .strip_prefix(root)
        .map_err(|_| "Path cannot leave the workspace".to_string())?;
    let name = target
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| root.to_string_lossy().to_string());
    let is_dir = metadata.is_dir();
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64);
    let extension = if is_dir {
        None
    } else {
        target
            .extension()
            .map(|value| value.to_string_lossy().to_ascii_lowercase())
    };

    Ok(WorkspaceEntry {
        name,
        path: relative_to_slash(relative),
        is_dir,
        size: metadata.len(),
        modified,
        extension,
    })
}

fn image_mime_type(extension: Option<&str>) -> Option<&'static str> {
    match extension.unwrap_or("").to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "avif" => Some("image/avif"),
        "apng" => Some("image/apng"),
        _ => None,
    }
}

pub(crate) fn list_entries(
    root: String,
    path: Option<String>,
) -> Result<WorkspaceDirectoryListing, String> {
    let root = canonical_root(&root)?;
    let relative = normalize_relative(path.as_deref())?;
    let directory = resolve_existing(&root, Some(&relative_to_slash(&relative)))?;
    if !directory.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&directory).map_err(|error| error.to_string())? {
        let Ok(entry) = entry else {
            continue;
        };

        let name = entry.file_name().to_string_lossy().to_string();
        if is_heavy_directory_name(&name) {
            continue;
        }

        if let Ok(entry) = entry_for(&root, &entry.path()) {
            entries.push(entry);
            if entries.len() > MAX_LIST_ENTRIES {
                break;
            }
        }
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()))
    });

    let truncated = entries.len() > MAX_LIST_ENTRIES;
    entries.truncate(MAX_LIST_ENTRIES);

    Ok(WorkspaceDirectoryListing {
        path: relative_to_slash(&relative),
        entries,
        truncated,
    })
}

pub(crate) fn read_file(root: String, path: String) -> Result<WorkspaceFileContent, String> {
    let root = canonical_root(&root)?;
    let target = resolve_existing(&root, Some(&path))?;
    if target.is_dir() {
        return Err("Path is a directory".to_string());
    }

    let metadata = fs::metadata(&target).map_err(|error| error.to_string())?;
    let mut file = fs::File::open(&target).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    file.by_ref()
        .take(MAX_FILE_PREVIEW_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;

    let truncated = bytes.len() as u64 > MAX_FILE_PREVIEW_BYTES;
    if truncated {
        bytes.truncate(MAX_FILE_PREVIEW_BYTES as usize);
    }

    let is_binary = bytes.iter().any(|byte| *byte == 0);
    let content = if is_binary {
        String::new()
    } else {
        String::from_utf8_lossy(&bytes).to_string()
    };
    let relative = target
        .strip_prefix(&root)
        .map_err(|_| "Path cannot leave the workspace".to_string())?;

    Ok(WorkspaceFileContent {
        path: relative_to_slash(relative),
        name: target
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone()),
        content,
        size: metadata.len(),
        is_binary,
        truncated,
        extension: target
            .extension()
            .map(|value| value.to_string_lossy().to_ascii_lowercase()),
    })
}

pub(crate) fn read_file_data_url(root: String, path: String) -> Result<WorkspaceFileDataUrl, String> {
    let root = canonical_root(&root)?;
    let target = resolve_existing(&root, Some(&path))?;
    if target.is_dir() {
        return Err("Path is a directory".to_string());
    }

    let metadata = fs::metadata(&target).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_IMAGE_PREVIEW_BYTES {
        return Err("Image is too large to preview".to_string());
    }

    let extension = target
        .extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase());
    let mime_type = image_mime_type(extension.as_deref())
        .ok_or_else(|| "File is not a supported image preview type".to_string())?;
    let bytes = fs::read(&target).map_err(|error| error.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let relative = target
        .strip_prefix(&root)
        .map_err(|_| "Path cannot leave the workspace".to_string())?;

    Ok(WorkspaceFileDataUrl {
        path: relative_to_slash(relative),
        name: target
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone()),
        data_url: format!("data:{mime_type};base64,{encoded}"),
        mime_type: mime_type.to_string(),
        size: metadata.len(),
        extension,
    })
}

pub(crate) fn write_file(root: String, path: String, content: String) -> Result<WorkspaceFileContent, String> {
    let root = canonical_root(&root)?;
    let target = resolve_existing(&root, Some(&path))?;
    if target.is_dir() {
        return Err("Path is a directory".to_string());
    }

    let existing = fs::read_to_string(&target).unwrap_or_default();
    let normalized = if existing.contains("\r\n") {
        content.replace("\r\n", "\n").replace('\r', "\n").replace('\n', "\r\n")
    } else {
        content
    };
    fs::write(&target, normalized).map_err(|error| error.to_string())?;
    read_file(root.to_string_lossy().to_string(), path)
}

pub(crate) fn create_entry(
    root: String,
    parent: Option<String>,
    name: String,
    kind: String,
) -> Result<WorkspaceEntry, String> {
    let root = canonical_root(&root)?;
    let parent = resolve_parent(&root, parent.as_deref())?;
    let name = safe_child_name(&name)?;
    let target = parent.join(name);

    if target.exists() {
        return Err("A file or folder with that name already exists".to_string());
    }

    if kind == "directory" {
        fs::create_dir(&target).map_err(|error| error.to_string())?;
    } else {
        fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
            .map_err(|error| error.to_string())?;
    }

    entry_for(&root, &target)
}

pub(crate) fn delete_path(root: String, path: String) -> Result<bool, String> {
    let root = canonical_root(&root)?;
    let target = resolve_existing(&root, Some(&path))?;
    if target == root {
        return Err("Workspace root cannot be deleted".to_string());
    }

    if target.is_dir() {
        fs::remove_dir_all(&target).map_err(|error| error.to_string())?;
    } else {
        fs::remove_file(&target).map_err(|error| error.to_string())?;
    }

    Ok(true)
}

pub(crate) fn rename_path(root: String, path: String, new_name: String) -> Result<WorkspaceEntry, String> {
    let root = canonical_root(&root)?;
    let target = resolve_existing(&root, Some(&path))?;
    if target == root {
        return Err("Workspace root cannot be renamed".to_string());
    }

    let new_name = safe_child_name(&new_name)?;
    let parent = target
        .parent()
        .ok_or_else(|| "Path has no parent directory".to_string())?;
    let renamed = parent.join(new_name);
    if renamed.exists() {
        return Err("A file or folder with that name already exists".to_string());
    }

    fs::rename(&target, &renamed).map_err(|error| error.to_string())?;
    entry_for(&root, &renamed)
}

fn run_git(root: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    let mut command = Command::new(git_program());
    command
        .arg("-C")
        .arg(root)
        .args(args)
        .stdin(Stdio::null());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .output()
        .map_err(|error| format!("Git is not available: {error}"))
}

fn spawn_git(root: &Path, args: &[&str]) -> Result<std::process::Child, String> {
    let mut command = Command::new(git_program());
    command
        .arg("-C")
        .arg(root)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .spawn()
        .map_err(|error| format!("Git is not available: {error}"))
}

fn git_probe(root: &Path) -> Result<bool, String> {
    let output = run_git(root, &["rev-parse", "--is-inside-work-tree"])?;
    Ok(output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true")
}

fn git_status_label(index: char, working_tree: char) -> String {
    if index == '?' && working_tree == '?' {
        return "Untracked".to_string();
    }
    if index == 'U' || working_tree == 'U' || (index == 'A' && working_tree == 'A') {
        return "Conflict".to_string();
    }
    for marker in [working_tree, index] {
        match marker {
            'M' => return "Modified".to_string(),
            'A' => return "Added".to_string(),
            'D' => return "Deleted".to_string(),
            'R' => return "Renamed".to_string(),
            'C' => return "Copied".to_string(),
            _ => {}
        }
    }
    "Changed".to_string()
}

fn parse_branch(line: &str) -> Option<String> {
    let raw = line.trim_start_matches("## ").trim();
    if raw.is_empty() {
        return None;
    }
    Some(
        raw.split("...")
            .next()
            .unwrap_or(raw)
            .split(" [")
            .next()
            .unwrap_or(raw)
            .to_string(),
    )
}

fn parse_status_line(line: &str) -> Option<WorkspaceGitFile> {
    if line.len() < 3 || line.starts_with("## ") {
        return None;
    }

    let mut chars = line.chars();
    let index = chars.next().unwrap_or(' ');
    let working_tree = chars.next().unwrap_or(' ');
    let rest = line.get(3..).unwrap_or("").trim().to_string();
    let (old_path, path) = if (index == 'R' || index == 'C') && rest.contains(" -> ") {
        let mut parts = rest.splitn(2, " -> ");
        (
            parts.next().map(|value| value.to_string()),
            parts.next().unwrap_or("").to_string(),
        )
    } else {
        (None, rest)
    };

    if path.is_empty() {
        return None;
    }

    Some(WorkspaceGitFile {
        path,
        old_path,
        index: index.to_string(),
        working_tree: working_tree.to_string(),
        staged: index != ' ' && index != '?' && index != '!',
        unstaged: working_tree != ' ' || index == '?',
        label: git_status_label(index, working_tree),
    })
}

fn git_pathspec_excludes() -> Vec<&'static str> {
    let mut excludes = vec!["."];
    for name in HEAVY_DIRECTORY_NAMES {
        match *name {
            ".git" => {
                excludes.push(":(exclude).git");
                excludes.push(":(exclude,glob)**/.git");
                excludes.push(":(exclude,glob)**/.git/**");
            }
            "node_modules" => {
                excludes.push(":(exclude)node_modules");
                excludes.push(":(exclude,glob)**/node_modules");
                excludes.push(":(exclude,glob)**/node_modules/**");
            }
            "target" => {
                excludes.push(":(exclude)target");
                excludes.push(":(exclude,glob)**/target");
                excludes.push(":(exclude,glob)**/target/**");
            }
            "dist" => {
                excludes.push(":(exclude)dist");
                excludes.push(":(exclude,glob)**/dist");
                excludes.push(":(exclude,glob)**/dist/**");
            }
            ".next" => {
                excludes.push(":(exclude).next");
                excludes.push(":(exclude,glob)**/.next");
                excludes.push(":(exclude,glob)**/.next/**");
            }
            "build" => {
                excludes.push(":(exclude)build");
                excludes.push(":(exclude,glob)**/build");
                excludes.push(":(exclude,glob)**/build/**");
            }
            "out" => {
                excludes.push(":(exclude)out");
                excludes.push(":(exclude,glob)**/out");
                excludes.push(":(exclude,glob)**/out/**");
            }
            _ => unreachable!(),
        }
    }
    excludes
}

fn read_stderr_limited<R: Read + Send + 'static>(stderr: R) -> thread::JoinHandle<String> {
    thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.take(64 * 1024).read_to_string(&mut text);
        text
    })
}

fn run_git_status(root: &Path) -> Result<(Option<String>, Vec<WorkspaceGitFile>, bool, bool, String), String> {
    let mut args = vec![
        "status",
        "--porcelain=v1",
        "-b",
        "--untracked-files=normal",
        "--",
    ];
    let excludes = git_pathspec_excludes();
    args.extend(excludes.iter().copied());

    let mut child = spawn_git(root, &args)?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Unable to read git status output".to_string())?;
    let stderr = child
        .stderr
        .take()
        .map(read_stderr_limited);
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    let mut branch = None;
    let mut entries = Vec::new();
    let mut scanned = 0usize;
    let mut truncated = false;
    let mut killed = false;

    loop {
        line.clear();
        let bytes = reader.read_line(&mut line).map_err(|error| error.to_string())?;
        if bytes == 0 {
            break;
        }

        let trimmed = line.trim_end_matches(|ch| ch == '\r' || ch == '\n');
        if branch.is_none() {
            branch = parse_branch(trimmed);
        }
        if trimmed.starts_with("## ") {
            continue;
        }

        scanned += 1;
        if scanned > MAX_GIT_STATUS_SCAN_LINES {
            truncated = true;
            killed = true;
            let _ = child.kill();
            break;
        }

        if let Some(entry) = parse_status_line(trimmed) {
            if entries.len() >= MAX_GIT_STATUS_ENTRIES {
                truncated = true;
                killed = true;
                let _ = child.kill();
                break;
            }
            entries.push(entry);
        }
    }

    let status = child.wait().map_err(|error| error.to_string())?;
    let stderr = stderr
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();

    Ok((branch, entries, truncated, status.success() || killed, stderr))
}

pub(crate) fn git_status(root: String) -> Result<WorkspaceGitStatus, String> {
    let root = canonical_root(&root)?;
    match git_probe(&root) {
        Ok(true) => {}
        Ok(false) => {
            return Ok(WorkspaceGitStatus {
                is_repo: false,
                branch: None,
                entries: Vec::new(),
                truncated: false,
                error: Some("Selected folder is not a Git repository".to_string()),
            });
        }
        Err(error) => {
            return Ok(WorkspaceGitStatus {
                is_repo: false,
                branch: None,
                entries: Vec::new(),
                truncated: false,
                error: Some(error),
            });
        }
    }

    let (branch, entries, truncated, success, stderr) = run_git_status(&root)?;
    if !success {
        return Ok(WorkspaceGitStatus {
            is_repo: false,
            branch: None,
            entries: Vec::new(),
            truncated: false,
            error: Some(stderr.trim().to_string()),
        });
    }

    Ok(WorkspaceGitStatus {
        is_repo: true,
        branch,
        entries,
        truncated,
        error: None,
    })
}

struct LimitedDiff {
    text: String,
    chars: usize,
    truncated: bool,
}

impl LimitedDiff {
    fn new() -> Self {
        Self {
            text: String::new(),
            chars: 0,
            truncated: false,
        }
    }

    fn push_str(&mut self, value: &str) -> bool {
        if self.truncated {
            return false;
        }

        let value_chars = value.chars().count();
        if self.chars + value_chars <= MAX_DIFF_CHARS {
            self.text.push_str(value);
            self.chars += value_chars;
            return true;
        }

        let remaining = MAX_DIFF_CHARS.saturating_sub(self.chars);
        self.text.extend(value.chars().take(remaining));
        self.text.push_str(DIFF_TRUNCATED_MARKER);
        self.chars = MAX_DIFF_CHARS;
        self.truncated = true;
        false
    }

    fn push_lossy_bytes(&mut self, value: &[u8]) -> bool {
        self.push_str(&String::from_utf8_lossy(value))
    }

    fn into_parts(self) -> (String, bool) {
        (self.text, self.truncated)
    }
}

fn is_untracked(root: &Path, relative: &str) -> bool {
    let output = run_git(root, &["status", "--porcelain=v1", "--untracked-files=normal", "--", relative]);
    let Ok(output) = output else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .any(|line| line.starts_with("?? "))
}

fn synthetic_untracked_diff(root: &Path, relative: &str) -> Result<Option<(String, bool)>, String> {
    let target = resolve_existing(root, Some(relative))?;
    if target.is_dir() {
        return Ok(None);
    }

    let preview = read_file(root.to_string_lossy().to_string(), relative.to_string())?;
    if preview.is_binary {
        return Ok(Some((format!("Binary file {relative} is untracked"), false)));
    }

    let line_count = preview.content.lines().count();
    let mut diff = LimitedDiff::new();
    diff.push_str(&format!(
        "diff --git a/{relative} b/{relative}\nnew file mode 100644\n--- /dev/null\n+++ b/{relative}\n@@ -0,0 +1,{line_count} @@\n",
    ));
    for line in preview.content.lines() {
        if !diff.push_str("+") || !diff.push_str(line) || !diff.push_str("\n") {
            break;
        }
    }
    Ok(Some(diff.into_parts()))
}

fn run_git_diff(root: &Path, args: &[&str]) -> Result<(String, bool, bool, String), String> {
    let mut child = spawn_git(root, args)?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Unable to read git diff output".to_string())?;
    let stderr = child
        .stderr
        .take()
        .map(read_stderr_limited);
    let mut reader = BufReader::new(stdout);
    let mut buffer = [0u8; 16 * 1024];
    let mut diff = LimitedDiff::new();
    let mut killed = false;

    loop {
        let bytes = reader.read(&mut buffer).map_err(|error| error.to_string())?;
        if bytes == 0 {
            break;
        }

        if !diff.push_lossy_bytes(&buffer[..bytes]) {
            killed = true;
            let _ = child.kill();
            break;
        }
    }

    let status = child.wait().map_err(|error| error.to_string())?;
    let stderr = stderr
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    let (diff, truncated) = diff.into_parts();

    Ok((diff, truncated, status.success() || killed, stderr))
}

pub(crate) fn git_diff(
    root: String,
    path: Option<String>,
    staged: bool,
) -> Result<WorkspaceGitDiff, String> {
    let root = canonical_root(&root)?;
    match git_probe(&root) {
        Ok(true) => {}
        Ok(false) => {
            return Ok(WorkspaceGitDiff {
                is_repo: false,
                path,
                staged,
                diff: String::new(),
                truncated: false,
                error: Some("Selected folder is not a Git repository".to_string()),
            });
        }
        Err(error) => {
            return Ok(WorkspaceGitDiff {
                is_repo: false,
                path,
                staged,
                diff: String::new(),
                truncated: false,
                error: Some(error),
            });
        }
    }

    let relative = normalize_relative(path.as_deref())?;
    let relative = relative_to_slash(&relative);
    if relative.is_empty() {
        return Ok(WorkspaceGitDiff {
            is_repo: true,
            path,
            staged,
            diff: String::new(),
            truncated: false,
            error: Some("A file path is required for git diff".to_string()),
        });
    }

    let mut args = vec!["diff"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(&relative);

    let (mut diff, mut truncated, success, stderr) = run_git_diff(&root, &args)?;
    if !success {
        return Ok(WorkspaceGitDiff {
            is_repo: true,
            path,
            staged,
            diff: String::new(),
            truncated: false,
            error: Some(stderr.trim().to_string()),
        });
    }

    if diff.trim().is_empty() && !staged && is_untracked(&root, &relative) {
        if let Some((synthetic_diff, synthetic_truncated)) = synthetic_untracked_diff(&root, &relative)? {
            diff = synthetic_diff;
            truncated = synthetic_truncated;
        }
    }

    Ok(WorkspaceGitDiff {
        is_repo: true,
        path,
        staged,
        diff,
        truncated,
        error: None,
    })
}

pub(crate) fn git_stage(root: String, path: String, staged: bool) -> Result<bool, String> {
    let root = canonical_root(&root)?;
    if !git_probe(&root)? {
        return Err("Selected folder is not a Git repository".to_string());
    }

    let relative = normalize_relative(Some(&path))?;
    let relative = relative_to_slash(&relative);
    if relative.is_empty() {
        return Err("A file path is required".to_string());
    }

    let output = if staged {
        run_git(&root, &["add", "--", &relative])?
    } else {
        run_git(&root, &["restore", "--staged", "--", &relative])?
    };

    if output.status.success() {
        return Ok(true);
    }

    if !staged {
        let fallback = run_git(&root, &["reset", "--", &relative])?;
        if fallback.status.success() {
            return Ok(true);
        }
    }

    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}
