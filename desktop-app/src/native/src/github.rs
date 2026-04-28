use crate::conversations;
use crate::paths;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

const GITHUB_CLIENT_ID: &str = "Ov23lii4N0Cjz3v4C8H8";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GithubUser {
    pub(crate) login: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct GithubTokenStore {
    pub(crate) access_token: String,
    pub(crate) login: Option<String>,
    pub(crate) avatar_url: Option<String>,
    pub(crate) name: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct GithubStatus {
    pub(crate) connected: bool,
    pub(crate) user: Option<GithubUser>,
}

#[derive(Debug, Serialize)]
pub(crate) struct GithubAuthUrl {
    pub(crate) url: String,
    pub(crate) state: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct GithubDisconnectResult {
    pub(crate) ok: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct GithubRepo {
    pub(crate) id: i64,
    pub(crate) name: String,
    pub(crate) full_name: String,
    pub(crate) description: Option<String>,
    pub(crate) private: Option<bool>,
    pub(crate) html_url: Option<String>,
    pub(crate) language: Option<String>,
    pub(crate) updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct GithubContentEntry {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) sha: String,
    pub(crate) size: i64,
    #[serde(rename = "type")]
    pub(crate) entry_type: String,
    pub(crate) download_url: Option<String>,
    pub(crate) content: Option<String>,
    pub(crate) encoding: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct GithubTreeEntry {
    pub(crate) path: String,
    #[serde(rename = "type")]
    pub(crate) entry_type: String,
    pub(crate) size: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct GithubTree {
    pub(crate) sha: Option<String>,
    pub(crate) truncated: Option<bool>,
    pub(crate) tree: Vec<GithubTreeEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GithubSelection {
    pub(crate) path: String,
    pub(crate) is_folder: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GithubMaterializeResult {
    pub(crate) ok: bool,
    pub(crate) repo_full_name: String,
    pub(crate) r#ref: String,
    pub(crate) root_dir: String,
    pub(crate) file_count: usize,
    pub(crate) skipped: usize,
}

fn github_token_path() -> Result<PathBuf, String> {
    Ok(paths::desktop_config_root()?.join("github-token.json"))
}

fn encode_uri_component(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn load_github_token() -> Result<Option<GithubTokenStore>, String> {
    let token_path = github_token_path()?;
    if !token_path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&token_path).map_err(|error| error.to_string())?;
    let parsed =
        serde_json::from_str::<GithubTokenStore>(&raw).map_err(|error| error.to_string())?;
    Ok(Some(parsed))
}

fn save_github_token(data: &GithubTokenStore) -> Result<(), String> {
    let body = serde_json::to_string_pretty(data).map_err(|error| error.to_string())?;
    paths::safe_write_file(&github_token_path()?, &body)?;
    Ok(())
}

fn clear_github_token() -> Result<(), String> {
    let token_path = github_token_path()?;
    if token_path.exists() {
        fs::remove_file(token_path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn github_api_request(api_path: &str, access_token: &str) -> Result<(u16, Value), String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("CloaiDesktopRefactor")
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(format!("https://api.github.com{}", api_path))
        .bearer_auth(access_token)
        .send()
        .map_err(|error| error.to_string())?;

    let status = response.status().as_u16();
    let payload = response
        .json::<Value>()
        .map_err(|error| error.to_string())?;
    Ok((status, payload))
}

fn github_fetch_blob(
    owner: &str,
    repo_name: &str,
    sha: &str,
    access_token: &str,
) -> Result<Vec<u8>, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("CloaiDesktopRefactor")
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(format!(
            "https://api.github.com/repos/{}/{}/git/blobs/{}",
            owner, repo_name, sha
        ))
        .bearer_auth(access_token)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(format!("blob status {}", response.status().as_u16()));
    }

    let payload = response
        .json::<Value>()
        .map_err(|error| error.to_string())?;
    let content = payload
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| "blob missing content".to_string())?;

    use base64::Engine as _;
    base64::engine::general_purpose::STANDARD
        .decode(content.replace('\n', ""))
        .map_err(|error| error.to_string())
}

fn exchange_code_for_token(code: &str, redirect_uri: &str) -> Result<GithubTokenStore, String> {
    let client_secret = std::env::var("GITHUB_CLIENT_SECRET")
        .map_err(|_| "GitHub OAuth not configured: GITHUB_CLIENT_SECRET is missing".to_string())?;

    let client = reqwest::blocking::Client::builder()
        .user_agent("CloaiDesktopRefactor")
        .build()
        .map_err(|error| error.to_string())?;

    let token_response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "client_id": GITHUB_CLIENT_ID,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
        }))
        .send()
        .map_err(|error| error.to_string())?;

    let token_payload = token_response
        .json::<Value>()
        .map_err(|error| error.to_string())?;

    let access_token = token_payload
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            token_payload
                .get("error_description")
                .and_then(Value::as_str)
                .unwrap_or("GitHub token exchange failed")
                .to_string()
        })?;

    let (status, user_payload) = github_api_request("/user", access_token)?;
    if status != 200 {
        return Err("Failed to fetch GitHub user profile".to_string());
    }

    Ok(GithubTokenStore {
        access_token: access_token.to_string(),
        login: user_payload
            .get("login")
            .and_then(Value::as_str)
            .map(str::to_string),
        avatar_url: user_payload
            .get("avatar_url")
            .and_then(Value::as_str)
            .map(str::to_string),
        name: user_payload
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

fn loopback_oauth_redirect() -> Result<(String, mpsc::Receiver<Result<String, String>>), String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    listener
        .set_nonblocking(false)
        .map_err(|error| error.to_string())?;

    let addr = listener.local_addr().map_err(|error| error.to_string())?;
    let redirect_uri = format!("http://127.0.0.1:{}/github/callback", addr.port());

    let (sender, receiver) = mpsc::channel::<Result<String, String>>();
    std::thread::spawn(move || {
        let result = (|| -> Result<String, String> {
            let (mut stream, _) = listener.accept().map_err(|error| error.to_string())?;
            stream
                .set_read_timeout(Some(Duration::from_secs(120)))
                .map_err(|error| error.to_string())?;

            let mut buffer = [0u8; 8192];
            let bytes_read = stream
                .read(&mut buffer)
                .map_err(|error| error.to_string())?;
            let request = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
            let first_line = request
                .lines()
                .next()
                .ok_or_else(|| "Invalid OAuth callback request".to_string())?;

            let path = first_line
                .split_whitespace()
                .nth(1)
                .ok_or_else(|| "Invalid OAuth callback path".to_string())?;

            let full_url = format!("http://127.0.0.1{}", path);
            let parsed = url::Url::parse(&full_url).map_err(|error| error.to_string())?;
            let code = parsed
                .query_pairs()
                .find(|(key, _)| key == "code")
                .map(|(_, value)| value.to_string())
                .ok_or_else(|| "Missing GitHub OAuth code".to_string())?;

            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<!doctype html><html><body style=\"font-family:-apple-system,sans-serif;padding:32px;background:#111;color:#fff\"><h2>GitHub Connected</h2><p>You can return to Cloai now.</p><script>setTimeout(()=>window.close(),1500)</script></body></html>";
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            Ok(code)
        })();

        let _ = sender.send(result);
    });

    Ok((redirect_uri, receiver))
}

pub(crate) fn get_github_status() -> Result<GithubStatus, String> {
    let token = match load_github_token()? {
        Some(token) => token,
        None => {
            return Ok(GithubStatus {
                connected: false,
                user: None,
            })
        }
    };

    if let Some(login) = token.login.clone() {
        return Ok(GithubStatus {
            connected: true,
            user: Some(GithubUser {
                login,
                avatar_url: token.avatar_url.clone(),
                name: token.name.clone(),
            }),
        });
    }

    Ok(GithubStatus {
        connected: false,
        user: None,
    })
}

pub(crate) fn get_github_auth_url() -> Result<GithubAuthUrl, String> {
    let state = uuid::Uuid::new_v4().to_string();
    let (redirect_uri, receiver) = loopback_oauth_redirect()?;
    let url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=repo,read:user&state={}",
        GITHUB_CLIENT_ID,
        encode_uri_component(&redirect_uri),
        state
    );

    std::thread::spawn(
        move || match receiver.recv_timeout(Duration::from_secs(180)) {
            Ok(Ok(code)) => {
                if let Ok(token) = exchange_code_for_token(&code, &redirect_uri) {
                    let _ = save_github_token(&token);
                }
            }
            Ok(Err(_)) | Err(_) => {}
        },
    );

    Ok(GithubAuthUrl { url, state })
}

pub(crate) fn disconnect_github() -> Result<GithubDisconnectResult, String> {
    clear_github_token()?;
    Ok(GithubDisconnectResult { ok: true })
}

pub(crate) fn get_github_repos(page: i64) -> Result<Vec<GithubRepo>, String> {
    let token = load_github_token()?.ok_or_else(|| "GitHub is not connected".to_string())?;
    let (status, payload) = github_api_request(
        &format!("/user/repos?sort=updated&per_page=30&page={}", page.max(1)),
        &token.access_token,
    )?;
    if status != 200 {
        return Err("GitHub API error while listing repositories".to_string());
    }
    serde_json::from_value(payload).map_err(|error| error.to_string())
}

pub(crate) fn get_github_contents(
    owner: String,
    repo: String,
    path: Option<String>,
    r#ref: Option<String>,
) -> Result<Value, String> {
    let token = load_github_token()?.ok_or_else(|| "GitHub is not connected".to_string())?;
    let mut api_path = format!(
        "/repos/{}/{}/contents/{}",
        owner,
        repo,
        path.unwrap_or_default()
    );
    if let Some(reference) = r#ref.filter(|value| !value.is_empty()) {
        api_path.push_str(&format!("?ref={}", encode_uri_component(&reference)));
    }
    let (status, payload) = github_api_request(&api_path, &token.access_token)?;
    if status != 200 {
        return Err("GitHub API error while browsing repository contents".to_string());
    }
    Ok(payload)
}

pub(crate) fn get_github_tree(
    owner: String,
    repo: String,
    r#ref: Option<String>,
) -> Result<GithubTree, String> {
    let token = load_github_token()?.ok_or_else(|| "GitHub is not connected".to_string())?;

    let (repo_status, repo_payload) =
        github_api_request(&format!("/repos/{}/{}", owner, repo), &token.access_token)?;
    if repo_status != 200 {
        return Err("Repo fetch failed".to_string());
    }

    let reference = r#ref
        .filter(|value| !value.is_empty())
        .or_else(|| {
            repo_payload
                .get("default_branch")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| "main".to_string());

    let (branch_status, branch_payload) = github_api_request(
        &format!(
            "/repos/{}/{}/branches/{}",
            owner,
            repo,
            encode_uri_component(&reference)
        ),
        &token.access_token,
    )?;
    if branch_status != 200 {
        return Err("Branch fetch failed".to_string());
    }

    let tree_sha = branch_payload
        .get("commit")
        .and_then(|value| value.get("commit"))
        .and_then(|value| value.get("tree"))
        .and_then(|value| value.get("sha"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Tree sha not found".to_string())?;

    let (tree_status, tree_payload) = github_api_request(
        &format!(
            "/repos/{}/{}/git/trees/{}?recursive=1",
            owner, repo, tree_sha
        ),
        &token.access_token,
    )?;
    if tree_status != 200 {
        return Err("Tree fetch failed".to_string());
    }

    Ok(GithubTree {
        sha: tree_payload
            .get("sha")
            .and_then(Value::as_str)
            .map(str::to_string),
        truncated: tree_payload.get("truncated").and_then(Value::as_bool),
        tree: tree_payload
            .get("tree")
            .and_then(Value::as_array)
            .cloned()
            .map(|items| {
                items
                    .into_iter()
                    .filter_map(|item| serde_json::from_value::<GithubTreeEntry>(item).ok())
                    .collect()
            })
            .unwrap_or_default(),
    })
}

pub(crate) fn materialize_github(
    conversation_id: String,
    repo_full_name: String,
    r#ref: Option<String>,
    selections: Vec<GithubSelection>,
) -> Result<GithubMaterializeResult, String> {
    let token = load_github_token()?.ok_or_else(|| "GitHub is not connected".to_string())?;
    if selections.is_empty() {
        return Err("Missing selections".to_string());
    }

    let conversation = conversations::get_conversation(conversation_id)?;
    let workspace_path = PathBuf::from(&conversation.workspace_path);
    fs::create_dir_all(&workspace_path).map_err(|error| error.to_string())?;

    let (owner, repo_name) = repo_full_name
        .split_once('/')
        .ok_or_else(|| "Invalid repoFullName".to_string())?;

    let (repo_status, repo_payload) = github_api_request(
        &format!("/repos/{}/{}", owner, repo_name),
        &token.access_token,
    )?;
    if repo_status != 200 {
        return Err("Repo fetch failed".to_string());
    }

    let resolved_ref = r#ref
        .filter(|value| !value.is_empty())
        .or_else(|| {
            repo_payload
                .get("default_branch")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| "main".to_string());

    let (branch_status, branch_payload) = github_api_request(
        &format!(
            "/repos/{}/{}/branches/{}",
            owner,
            repo_name,
            encode_uri_component(&resolved_ref)
        ),
        &token.access_token,
    )?;
    if branch_status != 200 {
        return Err("Branch fetch failed".to_string());
    }

    let tree_sha = branch_payload
        .get("commit")
        .and_then(|value| value.get("commit"))
        .and_then(|value| value.get("tree"))
        .and_then(|value| value.get("sha"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Tree sha not found".to_string())?;

    let (tree_status, tree_payload) = github_api_request(
        &format!(
            "/repos/{}/{}/git/trees/{}?recursive=1",
            owner, repo_name, tree_sha
        ),
        &token.access_token,
    )?;
    if tree_status != 200 {
        return Err("Tree fetch failed".to_string());
    }

    let tree_items = tree_payload
        .get("tree")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut seen = std::collections::BTreeSet::new();
    let mut to_fetch: Vec<(String, String, i64)> = Vec::new();
    for selection in selections {
        if selection.path.trim().is_empty() && !selection.is_folder {
            continue;
        }
        if selection.is_folder {
            let prefix = if selection.path.is_empty() {
                String::new()
            } else {
                format!("{}/", selection.path)
            };
            for item in &tree_items {
                let item_type = item.get("type").and_then(Value::as_str).unwrap_or_default();
                let item_path = item.get("path").and_then(Value::as_str).unwrap_or_default();
                if item_type != "blob" {
                    continue;
                }
                if !prefix.is_empty() && !item_path.starts_with(&prefix) {
                    continue;
                }
                if seen.insert(item_path.to_string()) {
                    to_fetch.push((
                        item_path.to_string(),
                        item.get("sha")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        item.get("size").and_then(Value::as_i64).unwrap_or(0),
                    ));
                }
            }
        } else {
            for item in &tree_items {
                let item_type = item.get("type").and_then(Value::as_str).unwrap_or_default();
                let item_path = item.get("path").and_then(Value::as_str).unwrap_or_default();
                if item_type == "blob"
                    && item_path == selection.path
                    && seen.insert(item_path.to_string())
                {
                    to_fetch.push((
                        item_path.to_string(),
                        item.get("sha")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        item.get("size").and_then(Value::as_i64).unwrap_or(0),
                    ));
                    break;
                }
            }
        }
    }

    if to_fetch.is_empty() {
        return Err("No files matched selection".to_string());
    }

    let target_root = workspace_path.join("github").join(owner).join(repo_name);
    fs::create_dir_all(&target_root).map_err(|error| error.to_string())?;

    let mut materialized: Vec<Value> = Vec::new();
    let mut skipped = 0usize;

    for (item_path, sha, size) in to_fetch {
        match github_fetch_blob(owner, repo_name, &sha, &token.access_token) {
            Ok(buffer) => {
                let destination = target_root.join(&item_path);
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                fs::write(&destination, buffer).map_err(|error| error.to_string())?;
                materialized.push(serde_json::json!({
                    "path": item_path,
                    "size": size,
                }));
            }
            Err(_) => {
                skipped += 1;
            }
        }
    }

    let root_dir = format!("./github/{}/{}", owner, repo_name);
    let meta_path = workspace_path.join(".github-context.json");
    let mut meta = if meta_path.exists() {
        fs::read_to_string(&meta_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or_else(|| serde_json::json!({ "repos": [] }))
    } else {
        serde_json::json!({ "repos": [] })
    };

    if !meta
        .get("repos")
        .map(|value| value.is_array())
        .unwrap_or(false)
    {
        meta["repos"] = serde_json::json!([]);
    }

    let repos = meta
        .get_mut("repos")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Invalid GitHub context store".to_string())?;
    repos.retain(|entry| {
        entry
            .get("repo")
            .and_then(Value::as_str)
            .map(|value| value != repo_full_name)
            .unwrap_or(true)
    });
    repos.push(serde_json::json!({
        "repo": repo_full_name,
        "ref": resolved_ref,
        "rootDir": root_dir,
        "files": materialized,
        "addedAt": chrono::Utc::now().to_rfc3339(),
    }));
    fs::write(
        &meta_path,
        serde_json::to_string_pretty(&meta).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    Ok(GithubMaterializeResult {
        ok: true,
        repo_full_name,
        r#ref: resolved_ref,
        root_dir,
        file_count: materialized.len(),
        skipped,
    })
}
