use crate::paths;
use flate2::read::DeflateDecoder;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct SkillFileNode {
    name: String,
    r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<SkillFileNode>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct Skill {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) content: Option<String>,
    pub(crate) is_example: bool,
    pub(crate) source_dir: String,
    pub(crate) source: String,
    pub(crate) user_id: Option<String>,
    pub(crate) created_at: Option<String>,
    pub(crate) enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) files: Option<Vec<SkillFileNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) dir_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct SkillsResponse {
    examples: Vec<Skill>,
    my_skills: Vec<Skill>,
}

#[derive(Debug, Serialize)]
pub(crate) struct SkillFileContent {
    content: String,
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillUpsertPayload {
    pub(crate) name: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) content: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillImportPayload {
    #[serde(default, alias = "file_path")]
    pub(crate) file_path: Option<String>,
    #[serde(default, alias = "file_name")]
    pub(crate) file_name: Option<String>,
    #[serde(default, alias = "mime_type")]
    pub(crate) mime_type: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct SkillDeleteResult {
    ok: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct SkillToggleResult {
    ok: bool,
    enabled: bool,
}

#[derive(Debug)]
struct ParsedSkill {
    name: Option<String>,
    description: String,
    content: String,
}

#[derive(Debug, Clone)]
struct SkillDirs {
    bundled: PathBuf,
    local: PathBuf,
    user: PathBuf,
    prefs: PathBuf,
}

#[derive(Debug)]
struct ZipEntry {
    name: String,
    compression: u16,
    compressed_size: u64,
    uncompressed_size: u64,
    data_offset: usize,
}

fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "Unable to determine user home directory".to_string())
}

fn resolve_bundled_skills_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("skills"));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.extend([
                exe_dir.join("_up_").join("skills"),
                exe_dir.join("resources").join("skills"),
                exe_dir.join("skills"),
            ]);
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.extend([
            cwd.join("skills"),
            cwd.join("src").join("native").join("skills"),
            cwd.join("desktop-app").join("skills"),
            cwd.join("desktop-app")
                .join("src")
                .join("native")
                .join("skills"),
        ]);
    }

    Ok(candidates
        .into_iter()
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from("skills")))
}

fn skill_dirs(app: &AppHandle) -> Result<SkillDirs, String> {
    let home = home_dir()?;
    let bundled = resolve_bundled_skills_dir(app)?;
    let user = home.join(".claude").join("skills");
    fs::create_dir_all(&user).map_err(|error| error.to_string())?;
    sync_bundled_skills(&bundled, &user);

    Ok(SkillDirs {
        bundled,
        local: home.join(".agents").join("skills"),
        user,
        prefs: paths::desktop_config_root()?.join("skill-preferences.json"),
    })
}

fn sync_bundled_skills(bundled: &Path, user: &Path) {
    let Ok(entries) = fs::read_dir(bundled) else {
        return;
    };

    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }

        let target = user.join(entry.file_name());
        if target.exists() {
            continue;
        }

        let _ = copy_dir(&entry.path(), &target);
    }
}

fn load_skill_prefs(path: &Path) -> Map<String, Value> {
    paths::read_json_file(path, Value::Object(Map::new()))
        .as_object()
        .cloned()
        .unwrap_or_default()
}

fn save_skill_prefs(path: &Path, prefs: Map<String, Value>) -> Result<(), String> {
    paths::write_json_file(path, &Value::Object(prefs))
}

fn skill_enabled(prefs: &Map<String, Value>, id: &str) -> bool {
    prefs.get(id).and_then(Value::as_bool).unwrap_or(true)
}

fn parse_frontmatter_value(frontmatter: &str, key: &str) -> Option<String> {
    frontmatter.lines().find_map(|line| {
        let (raw_key, raw_value) = line.split_once(':')?;
        (raw_key.trim() == key).then(|| raw_value.trim().to_string())
    })
}

fn parse_skill_md(content: &str) -> Option<ParsedSkill> {
    let normalized = content.replace("\r\n", "\n");
    let rest = normalized.strip_prefix("---\n")?;
    let (frontmatter, body) = rest.split_once("\n---")?;
    let body = body.strip_prefix('\n').unwrap_or(body).trim().to_string();

    Some(ParsedSkill {
        name: parse_frontmatter_value(frontmatter, "name"),
        description: parse_frontmatter_value(frontmatter, "description").unwrap_or_default(),
        content: body,
    })
}

fn scan_skill_files(dir_path: &Path) -> Vec<SkillFileNode> {
    let Ok(entries) = fs::read_dir(dir_path) else {
        return Vec::new();
    };

    let mut entries: Vec<_> = entries
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|name| !name.starts_with('.'))
                .unwrap_or(false)
        })
        .collect();

    entries.sort_by(|a, b| {
        let a_is_dir = a
            .file_type()
            .map(|file_type| file_type.is_dir())
            .unwrap_or(false);
        let b_is_dir = b
            .file_type()
            .map(|file_type| file_type.is_dir())
            .unwrap_or(false);
        let a_name = a.file_name().to_string_lossy().to_string();
        let b_name = b.file_name().to_string_lossy().to_string();

        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ if a_name == "SKILL.md" => std::cmp::Ordering::Less,
            _ if b_name == "SKILL.md" => std::cmp::Ordering::Greater,
            _ => a_name.to_lowercase().cmp(&b_name.to_lowercase()),
        }
    });

    entries
        .into_iter()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path();
            let file_type = entry.file_type().ok()?;

            if file_type.is_dir() {
                Some(SkillFileNode {
                    name,
                    r#type: "folder".to_string(),
                    children: Some(scan_skill_files(&path)),
                })
            } else if file_type.is_file() {
                Some(SkillFileNode {
                    name,
                    r#type: "file".to_string(),
                    children: None,
                })
            } else {
                None
            }
        })
        .collect()
}

fn scan_skills_dir(dir: &Path, source: &str, prefs: &Map<String, Value>) -> Vec<Skill> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    entries
        .flatten()
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() {
                return None;
            }

            let source_dir = entry.file_name().to_string_lossy().to_string();
            let md_path = entry.path().join("SKILL.md");
            if !md_path.exists() {
                return None;
            }

            let raw = fs::read_to_string(md_path).ok()?;
            let parsed = parse_skill_md(&raw)?;
            let id = format!("{source}:{source_dir}");
            Some(Skill {
                id: id.clone(),
                name: parsed.name.unwrap_or_else(|| source_dir.clone()),
                description: parsed.description,
                content: Some(parsed.content),
                is_example: source != "user",
                source_dir,
                source: source.to_string(),
                user_id: None,
                created_at: None,
                enabled: skill_enabled(prefs, &id),
                files: None,
                dir_path: None,
            })
        })
        .collect()
}

fn strip_content(mut skill: Skill) -> Skill {
    skill.content = None;
    skill
}

fn load_user_skills(dirs: &SkillDirs, prefs: &Map<String, Value>) -> Vec<Skill> {
    scan_skills_dir(&dirs.user, "user", prefs)
        .into_iter()
        .map(|mut skill| {
            skill.is_example = false;
            skill
        })
        .collect()
}

fn all_skills(dirs: &SkillDirs, prefs: &Map<String, Value>) -> Vec<Skill> {
    let mut skills = scan_skills_dir(&dirs.bundled, "bundled", prefs);
    skills.extend(scan_skills_dir(&dirs.local, "local", prefs));
    skills.extend(load_user_skills(dirs, prefs));
    skills
}

fn skill_root(dirs: &SkillDirs, skill: &Skill) -> PathBuf {
    match skill.source.as_str() {
        "bundled" => dirs.bundled.join(&skill.source_dir),
        "local" => dirs.local.join(&skill.source_dir),
        "user" => dirs.user.join(&skill.source_dir),
        _ => dirs.user.join(&skill.source_dir),
    }
}

fn find_skill(dirs: &SkillDirs, prefs: &Map<String, Value>, id: &str) -> Option<Skill> {
    all_skills(dirs, prefs)
        .into_iter()
        .find(|skill| skill.id == id)
}

fn ensure_safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if path.is_absolute() {
        return Err("Access denied".to_string());
    }

    let mut safe = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => safe.push(part),
            Component::CurDir => {}
            _ => return Err("Access denied".to_string()),
        }
    }

    if safe.as_os_str().is_empty() {
        return Err("path query param required".to_string());
    }
    Ok(safe)
}

fn slugify(name: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;

    for ch in name.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&ch) {
            slug.push(ch);
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }

    slug.trim_matches('-').to_string()
}

fn timestamp_slug() -> String {
    format!("skill-{}", chrono::Utc::now().timestamp_millis())
}

fn skill_frontmatter(name: &str, description: &str, content: &str) -> String {
    format!("---\nname: {name}\ndescription: {description}\n---\n\n{content}")
}

fn copy_dir(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| error.to_string())?;

    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let target = destination.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn read_u16_le(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| "Invalid zip file".to_string())?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "Invalid zip file".to_string())?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn find_end_of_central_directory(bytes: &[u8]) -> Result<usize, String> {
    let min_offset = bytes.len().saturating_sub(65_557);
    let max_offset = bytes.len().saturating_sub(22);

    for offset in (min_offset..=max_offset).rev() {
        if bytes.get(offset..offset + 4) == Some(&[0x50, 0x4b, 0x05, 0x06]) {
            return Ok(offset);
        }
    }

    Err("Invalid zip file".to_string())
}

fn read_zip_entries(bytes: &[u8]) -> Result<Vec<ZipEntry>, String> {
    let mut entries = Vec::new();

    let eocd = find_end_of_central_directory(bytes)?;
    let entry_count = read_u16_le(bytes, eocd + 10)? as usize;
    let central_size = read_u32_le(bytes, eocd + 12)? as usize;
    let central_offset = read_u32_le(bytes, eocd + 16)? as usize;
    if central_offset
        .checked_add(central_size)
        .filter(|end| *end <= bytes.len())
        .is_none()
    {
        return Err("Invalid zip file".to_string());
    }

    let mut offset = central_offset;
    for _ in 0..entry_count {
        if read_u32_le(bytes, offset)? != 0x0201_4b50 {
            return Err("Invalid zip file".to_string());
        }

        let compression = read_u16_le(bytes, offset + 10)?;
        let compressed_size = read_u32_le(bytes, offset + 20)? as u64;
        let uncompressed_size = read_u32_le(bytes, offset + 24)? as u64;
        let name_len = read_u16_le(bytes, offset + 28)? as usize;
        let extra_len = read_u16_le(bytes, offset + 30)? as usize;
        let comment_len = read_u16_le(bytes, offset + 32)? as usize;
        let local_offset = read_u32_le(bytes, offset + 42)? as usize;
        let name_start = offset + 46;
        let name_end = name_start + name_len;
        let next_offset = name_end
            .checked_add(extra_len)
            .and_then(|value| value.checked_add(comment_len))
            .ok_or_else(|| "Invalid zip file".to_string())?;
        if next_offset > bytes.len() {
            return Err("Invalid zip file".to_string());
        }

        let name = String::from_utf8_lossy(
            bytes
                .get(name_start..name_end)
                .ok_or_else(|| "Invalid zip file".to_string())?,
        )
        .replace('\\', "/");

        if read_u32_le(bytes, local_offset)? != 0x0403_4b50 {
            return Err("Invalid zip file".to_string());
        }
        let local_name_len = read_u16_le(bytes, local_offset + 26)? as usize;
        let local_extra_len = read_u16_le(bytes, local_offset + 28)? as usize;
        let data_offset = local_offset
            .checked_add(30)
            .and_then(|value| value.checked_add(local_name_len))
            .and_then(|value| value.checked_add(local_extra_len))
            .ok_or_else(|| "Invalid zip file".to_string())?;
        let data_end = data_offset
            .checked_add(compressed_size as usize)
            .ok_or_else(|| "Invalid zip file".to_string())?;
        if data_end > bytes.len() {
            return Err("Invalid zip file".to_string());
        }

        entries.push(ZipEntry {
            name,
            compression,
            compressed_size,
            uncompressed_size,
            data_offset,
        });

        offset = next_offset;
    }

    if entries.is_empty() {
        return Err("Invalid zip file".to_string());
    }

    Ok(entries)
}

fn safe_zip_path(name: &str) -> Result<Option<PathBuf>, String> {
    if name.trim().is_empty() || name.ends_with('/') {
        return Ok(None);
    }

    let path = Path::new(name);
    if path.is_absolute() {
        return Err("Invalid zip path".to_string());
    }

    let mut safe = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) if part != OsStr::new("") => safe.push(part),
            Component::CurDir => {}
            _ => return Err("Invalid zip path".to_string()),
        }
    }

    Ok((!safe.as_os_str().is_empty()).then_some(safe))
}

fn inflate_entry(bytes: &[u8], entry: &ZipEntry) -> Result<Vec<u8>, String> {
    let data = bytes
        .get(entry.data_offset..entry.data_offset + entry.compressed_size as usize)
        .ok_or_else(|| "Invalid zip file".to_string())?;

    match entry.compression {
        0 => Ok(data.to_vec()),
        8 => {
            let mut decoder = DeflateDecoder::new(Cursor::new(data));
            let mut output = Vec::with_capacity(entry.uncompressed_size as usize);
            decoder
                .read_to_end(&mut output)
                .map_err(|error| error.to_string())?;
            Ok(output)
        }
        method => Err(format!("Unsupported zip compression method: {method}")),
    }
}

fn extract_zip_to_temp(source: &Path) -> Result<PathBuf, String> {
    let bytes = fs::read(source).map_err(|error| error.to_string())?;
    let entries = read_zip_entries(&bytes)?;
    let temp_dir = std::env::temp_dir().join(format!(
        "skill-import-{}",
        chrono::Utc::now().timestamp_millis()
    ));
    fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;

    for entry in entries {
        let Some(relative) = safe_zip_path(&entry.name)? else {
            continue;
        };
        let destination = temp_dir.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let content = inflate_entry(&bytes, &entry)?;
        fs::write(destination, content).map_err(|error| error.to_string())?;
    }

    Ok(temp_dir)
}

fn find_imported_skill_root(temp_dir: &Path) -> Result<PathBuf, String> {
    if temp_dir.join("SKILL.md").exists() {
        return Ok(temp_dir.to_path_buf());
    }

    let dirs: Vec<PathBuf> = fs::read_dir(temp_dir)
        .map_err(|error| error.to_string())?
        .flatten()
        .filter_map(|entry| {
            entry
                .file_type()
                .ok()
                .filter(|file_type| file_type.is_dir())
                .map(|_| entry.path())
        })
        .collect();

    if dirs.len() == 1 && dirs[0].join("SKILL.md").exists() {
        return Ok(dirs[0].clone());
    }

    Err("zip 中没有找到 SKILL.md 文件".to_string())
}

fn import_name_from_md(md_path: &Path, fallback: &str) -> Result<String, String> {
    let content = fs::read_to_string(md_path).map_err(|error| error.to_string())?;
    Ok(content
        .lines()
        .find_map(|line| {
            let (key, value) = line.split_once(':')?;
            (key.trim() == "name").then(|| value.trim().to_string())
        })
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| fallback.to_string()))
}

fn default_import_name(payload: &SkillImportPayload, source: &Path) -> String {
    payload
        .file_name
        .as_deref()
        .filter(|name| !name.trim().is_empty())
        .or_else(|| source.file_name().and_then(|name| name.to_str()))
        .and_then(|name| Path::new(name).file_stem().and_then(|stem| stem.to_str()))
        .unwrap_or("skill")
        .to_string()
}

fn import_finish(dirs: &SkillDirs, name: String, source_dir: String) -> Result<Skill, String> {
    let id = format!("user:{source_dir}");
    let mut prefs = load_skill_prefs(&dirs.prefs);
    prefs.insert(id.clone(), Value::Bool(true));
    save_skill_prefs(&dirs.prefs, prefs)?;

    Ok(Skill {
        id,
        name,
        description: String::new(),
        content: None,
        is_example: false,
        source_dir,
        source: "user".to_string(),
        user_id: None,
        created_at: None,
        enabled: true,
        files: None,
        dir_path: None,
    })
}

pub(crate) fn list_skills(app: &AppHandle) -> Result<SkillsResponse, String> {
    let dirs = skill_dirs(app)?;
    let prefs = load_skill_prefs(&dirs.prefs);

    let bundled = scan_skills_dir(&dirs.bundled, "bundled", &prefs);
    let local = scan_skills_dir(&dirs.local, "local", &prefs);
    let mut seen_names = HashSet::new();
    let mut examples = Vec::new();

    for skill in bundled {
        seen_names.insert(skill.name.clone());
        examples.push(strip_content(skill));
    }
    for skill in local {
        if seen_names.insert(skill.name.clone()) {
            examples.push(strip_content(skill));
        }
    }

    let my_skills = load_user_skills(&dirs, &prefs)
        .into_iter()
        .map(strip_content)
        .collect();

    Ok(SkillsResponse {
        examples,
        my_skills,
    })
}

pub(crate) fn get_skill_detail(app: &AppHandle, id: String) -> Result<Skill, String> {
    let dirs = skill_dirs(app)?;
    let prefs = load_skill_prefs(&dirs.prefs);
    let mut skill = find_skill(&dirs, &prefs, &id).ok_or_else(|| "Skill not found".to_string())?;
    let root = skill_root(&dirs, &skill);

    skill.enabled = skill_enabled(&prefs, &id);
    skill.files = Some(scan_skill_files(&root));
    skill.dir_path = Some(root.to_string_lossy().to_string());
    Ok(skill)
}

pub(crate) fn get_skill_file(
    app: &AppHandle,
    id: String,
    file_path: String,
) -> Result<SkillFileContent, String> {
    let dirs = skill_dirs(app)?;
    let prefs = load_skill_prefs(&dirs.prefs);
    let skill = find_skill(&dirs, &prefs, &id).ok_or_else(|| "Skill not found".to_string())?;
    let root = skill_root(&dirs, &skill)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let relative = ensure_safe_relative_path(&file_path)?;
    let full_path = root.join(relative);
    let resolved = full_path
        .canonicalize()
        .map_err(|_| "File not found".to_string())?;

    if !resolved.starts_with(&root) {
        return Err("Access denied".to_string());
    }

    let content = fs::read_to_string(&resolved).map_err(|error| error.to_string())?;
    Ok(SkillFileContent {
        content,
        path: file_path,
    })
}

pub(crate) fn create_skill(app: &AppHandle, payload: SkillUpsertPayload) -> Result<Skill, String> {
    let dirs = skill_dirs(app)?;
    let name = payload
        .name
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| "Name is required".to_string())?;
    let description = payload.description.unwrap_or_default();
    let content = payload.content.unwrap_or_default();
    let source_dir = {
        let slug = slugify(&name);
        if slug.is_empty() {
            timestamp_slug()
        } else {
            slug
        }
    };
    let skill_dir = dirs.user.join(&source_dir);
    if skill_dir.exists() {
        return Err("Skill with this name already exists".to_string());
    }

    fs::create_dir_all(&skill_dir).map_err(|error| error.to_string())?;
    fs::write(
        skill_dir.join("SKILL.md"),
        skill_frontmatter(&name, &description, &content),
    )
    .map_err(|error| error.to_string())?;

    let id = format!("user:{source_dir}");
    let mut prefs = load_skill_prefs(&dirs.prefs);
    prefs.insert(id.clone(), Value::Bool(true));
    save_skill_prefs(&dirs.prefs, prefs)?;

    Ok(Skill {
        id,
        name,
        description,
        content: Some(content),
        is_example: false,
        source_dir,
        source: "user".to_string(),
        user_id: None,
        created_at: None,
        enabled: true,
        files: None,
        dir_path: None,
    })
}

pub(crate) fn update_skill(
    app: &AppHandle,
    id: String,
    payload: SkillUpsertPayload,
) -> Result<Skill, String> {
    let dirs = skill_dirs(app)?;
    let prefs = load_skill_prefs(&dirs.prefs);
    let mut skill = load_user_skills(&dirs, &prefs)
        .into_iter()
        .find(|skill| skill.id == id)
        .ok_or_else(|| "Skill not found or not editable".to_string())?;

    let name = payload.name.unwrap_or_else(|| skill.name.clone());
    let description = payload
        .description
        .unwrap_or_else(|| skill.description.clone());
    let content = payload
        .content
        .unwrap_or_else(|| skill.content.clone().unwrap_or_default());

    fs::write(
        dirs.user.join(&skill.source_dir).join("SKILL.md"),
        skill_frontmatter(&name, &description, &content),
    )
    .map_err(|error| error.to_string())?;

    skill.name = name;
    skill.description = description;
    skill.content = Some(content);
    skill.enabled = skill_enabled(&prefs, &id);
    Ok(skill)
}

pub(crate) fn delete_skill(app: &AppHandle, id: String) -> Result<SkillDeleteResult, String> {
    let dirs = skill_dirs(app)?;
    let prefs = load_skill_prefs(&dirs.prefs);
    let skill = load_user_skills(&dirs, &prefs)
        .into_iter()
        .find(|skill| skill.id == id)
        .ok_or_else(|| "Skill not found".to_string())?;

    let skill_dir = dirs.user.join(skill.source_dir);
    if skill_dir.exists() {
        fs::remove_dir_all(skill_dir).map_err(|error| error.to_string())?;
    }

    let mut prefs = load_skill_prefs(&dirs.prefs);
    prefs.remove(&id);
    save_skill_prefs(&dirs.prefs, prefs)?;

    Ok(SkillDeleteResult { ok: true })
}

pub(crate) fn toggle_skill(
    app: &AppHandle,
    id: String,
    enabled: bool,
) -> Result<SkillToggleResult, String> {
    let dirs = skill_dirs(app)?;
    let mut prefs = load_skill_prefs(&dirs.prefs);
    prefs.insert(id, Value::Bool(enabled));
    save_skill_prefs(&dirs.prefs, prefs)?;
    Ok(SkillToggleResult { ok: true, enabled })
}

pub(crate) fn import_skill(app: &AppHandle, payload: SkillImportPayload) -> Result<Skill, String> {
    let _ = &payload.mime_type;
    let dirs = skill_dirs(app)?;
    let source = payload
        .file_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from)
        .ok_or_else(|| "No file uploaded".to_string())?;
    if !source.exists() || !source.is_file() {
        return Err("No file uploaded".to_string());
    }

    let extension = source
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .unwrap_or_default();
    let fallback_name = default_import_name(&payload, &source);

    match extension.as_str() {
        "md" => {
            let content = fs::read_to_string(&source).map_err(|error| error.to_string())?;
            let name = content
                .lines()
                .find_map(|line| {
                    let (key, value) = line.split_once(':')?;
                    (key.trim() == "name").then(|| value.trim().to_string())
                })
                .filter(|name| !name.is_empty())
                .unwrap_or(fallback_name);
            let source_dir = {
                let slug = slugify(&name);
                if slug.is_empty() {
                    timestamp_slug()
                } else {
                    slug
                }
            };
            let dest_dir = dirs.user.join(&source_dir);
            if dest_dir.exists() {
                return Err(format!("同名 Skill 已存在: {source_dir}"));
            }

            fs::create_dir_all(&dest_dir).map_err(|error| error.to_string())?;
            fs::copy(&source, dest_dir.join("SKILL.md")).map_err(|error| error.to_string())?;
            import_finish(&dirs, name, source_dir)
        }
        "zip" => {
            let temp_dir = extract_zip_to_temp(&source)?;
            let result = (|| {
                let skill_root = find_imported_skill_root(&temp_dir)?;
                let name = import_name_from_md(&skill_root.join("SKILL.md"), &fallback_name)?;
                let source_dir = {
                    let slug = slugify(&name);
                    if slug.is_empty() {
                        timestamp_slug()
                    } else {
                        slug
                    }
                };
                let dest_dir = dirs.user.join(&source_dir);
                if dest_dir.exists() {
                    return Err(format!("同名 Skill 已存在: {source_dir}"));
                }
                copy_dir(&skill_root, &dest_dir)?;
                import_finish(&dirs, name, source_dir)
            })();
            let _ = fs::remove_dir_all(temp_dir);
            result
        }
        _ => Err("不支持的文件类型，请上传 .zip 或 .md 文件".to_string()),
    }
}
