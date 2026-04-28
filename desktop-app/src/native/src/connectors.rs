use crate::paths;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

const COMPOSIO_API_BASE: &str = "https://backend.composio.dev";
const COMPOSIO_SERVER_NAME: &str = "composio";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorMcpStatus {
    pub(crate) installed: bool,
    pub(crate) server_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorMcpStatusResponse {
    pub(crate) config_path: Option<String>,
    pub(crate) connectors: BTreeMap<String, ConnectorMcpStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorComposioStatus {
    pub(crate) available: bool,
    pub(crate) connected: bool,
    pub(crate) connected_account_id: Option<String>,
    pub(crate) installed: bool,
    pub(crate) server_name: Option<String>,
    pub(crate) toolkit_slug: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorComposioStatusResponse {
    pub(crate) config_path: Option<String>,
    pub(crate) configured: bool,
    pub(crate) connectors: BTreeMap<String, ConnectorComposioStatus>,
    pub(crate) mcp_url: Option<String>,
    pub(crate) server_installed: bool,
    pub(crate) session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorComposioConfigResponse {
    pub(crate) config_path: Option<String>,
    pub(crate) configured: bool,
    pub(crate) source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorComposioConnectResponse {
    pub(crate) ok: bool,
    pub(crate) config_path: Option<String>,
    pub(crate) connectors: BTreeMap<String, ConnectorComposioStatus>,
    pub(crate) mcp_url: Option<String>,
    pub(crate) redirect_url: String,
    pub(crate) server_name: String,
    pub(crate) session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorComposioUninstallResponse {
    pub(crate) ok: bool,
    pub(crate) config_path: Option<String>,
    pub(crate) connectors: BTreeMap<String, ConnectorComposioStatus>,
    pub(crate) server_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorInstallPayload {
    pub(crate) connector_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorComposioConnectPayload {
    pub(crate) connector_id: String,
    pub(crate) user_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectorComposioUninstallPayload {
    pub(crate) user_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetConnectorComposioConfigPayload {
    pub(crate) api_key: String,
}

fn config_home_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Unable to determine home directory".to_string())?;
    Ok(home)
}

fn connector_config_path() -> Result<PathBuf, String> {
    let home = config_home_dir()?;
    let legacy = home.join(".config.json");
    if legacy.exists() {
        return Ok(legacy);
    }
    Ok(home.join(".claude.json"))
}

fn composio_config_path() -> Result<PathBuf, String> {
    Ok(paths::desktop_config_root()?.join("connector-composio.json"))
}

fn composio_sessions_path() -> Result<PathBuf, String> {
    Ok(paths::desktop_config_root()?.join("connector-composio-sessions.json"))
}

fn normalize_config(config: Option<Value>) -> Value {
    let mut value = config.unwrap_or_else(|| Value::Object(Map::new()));
    if !value.is_object() {
        value = Value::Object(Map::new());
    }
    if value.get("mcpServers").and_then(Value::as_object).is_none() {
        value["mcpServers"] = Value::Object(Map::new());
    }
    value
}

fn read_json(path: &PathBuf) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Object(Map::new()));
    }
    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| error.to_string())
}

fn write_json(path: &PathBuf, value: &Value) -> Result<(), String> {
    let body = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    paths::safe_write_file(path, &body)?;
    Ok(())
}

fn install_profiles() -> BTreeMap<&'static str, (&'static str, Value)> {
    BTreeMap::from([
        (
            "figma",
            (
                "figma",
                serde_json::json!({ "type": "http", "url": "https://mcp.figma.com/mcp" }),
            ),
        ),
        (
            "notion",
            (
                "notion",
                serde_json::json!({ "type": "http", "url": "https://mcp.notion.com/mcp" }),
            ),
        ),
        (
            "linear",
            (
                "linear",
                serde_json::json!({ "type": "http", "url": "https://mcp.linear.app/mcp" }),
            ),
        ),
        (
            "jira",
            (
                "atlassian",
                serde_json::json!({ "type": "http", "url": "https://mcp.atlassian.com/v1/mcp" }),
            ),
        ),
        (
            "confluence",
            (
                "atlassian",
                serde_json::json!({ "type": "http", "url": "https://mcp.atlassian.com/v1/mcp" }),
            ),
        ),
    ])
}

fn composio_profiles() -> BTreeMap<&'static str, &'static str> {
    BTreeMap::from([
        ("github", "github"),
        ("google-drive", "googledrive"),
        ("gmail", "gmail"),
        ("google-calendar", "googlecalendar"),
        ("slack", "slack"),
        ("notion", "notion"),
        ("jira", "jira"),
        ("confluence", "confluence"),
        ("linear", "linear"),
        ("airtable", "airtable"),
        ("asana", "asana"),
        ("microsoft-teams", "microsoft_teams"),
        ("onedrive", "one_drive"),
        ("figma", "figma"),
        ("zoom", "zoom"),
        ("dropbox", "dropbox"),
        ("box", "box"),
        ("salesforce", "salesforce"),
        ("hubspot", "hubspot"),
        ("intercom", "intercom"),
        ("miro", "miro"),
        ("monday", "monday"),
        ("trello", "trello"),
        ("zendesk", "zendesk"),
        ("gitlab", "gitlab"),
        ("bitbucket", "bitbucket"),
    ])
}

fn connector_mcp_statuses(config: &Value) -> BTreeMap<String, ConnectorMcpStatus> {
    let mcp_servers = config
        .get("mcpServers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    install_profiles()
        .into_iter()
        .map(|(connector_id, (server_name, _))| {
            (
                connector_id.to_string(),
                ConnectorMcpStatus {
                    installed: mcp_servers.contains_key(server_name),
                    server_name: server_name.to_string(),
                },
            )
        })
        .collect()
}

fn composio_api_key() -> Result<String, String> {
    let config = read_json(&composio_config_path()?)?;
    if let Some(value) = config
        .get("apiKey")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(value.to_string());
    }
    if let Ok(value) = std::env::var("COMPOSIO_API_KEY") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    if let Ok(value) = std::env::var("COMPOSIO_PROJECT_API_KEY") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    Err("Composio API key is not configured in this app".to_string())
}

fn composio_api_key_source() -> Result<(Option<String>, Option<String>), String> {
    let config = read_json(&composio_config_path()?)?;
    if let Some(value) = config
        .get("apiKey")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok((Some(value.to_string()), Some("local".to_string())));
    }
    if let Ok(value) = std::env::var("COMPOSIO_API_KEY") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok((
                Some(trimmed.to_string()),
                Some("env:COMPOSIO_API_KEY".to_string()),
            ));
        }
    }
    if let Ok(value) = std::env::var("COMPOSIO_PROJECT_API_KEY") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok((
                Some(trimmed.to_string()),
                Some("env:COMPOSIO_PROJECT_API_KEY".to_string()),
            ));
        }
    }
    Ok((None, None))
}

fn read_composio_sessions() -> Result<BTreeMap<String, Value>, String> {
    let path = composio_sessions_path()?;
    let value = read_json(&path)?;
    Ok(value
        .as_object()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .collect())
}

fn write_composio_sessions(store: &BTreeMap<String, Value>) -> Result<(), String> {
    let path = composio_sessions_path()?;
    let object: Map<String, Value> = store.clone().into_iter().collect();
    write_json(&path, &Value::Object(object))
}

fn get_stored_composio_session(user_id: &str) -> Result<Option<(String, String)>, String> {
    let store = read_composio_sessions()?;
    let key = user_id.trim();
    if key.is_empty() {
        return Ok(None);
    }
    let Some(record) = store.get(key) else {
        return Ok(None);
    };
    Ok(Some((
        record
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        record
            .get("mcpUrl")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    )))
}

fn save_composio_session(user_id: &str, session_id: &str, mcp_url: &str) -> Result<(), String> {
    let mut store = read_composio_sessions()?;
    store.insert(
        user_id.trim().to_string(),
        serde_json::json!({
            "sessionId": session_id,
            "mcpUrl": mcp_url,
            "updatedAt": chrono::Utc::now().to_rfc3339(),
        }),
    );
    write_composio_sessions(&store)
}

fn composio_headers(api_key: &str) -> Result<reqwest::header::HeaderMap, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        "application/json"
            .parse()
            .map_err(|error: reqwest::header::InvalidHeaderValue| error.to_string())?,
    );
    headers.insert(
        "x-api-key",
        api_key
            .parse()
            .map_err(|error: reqwest::header::InvalidHeaderValue| error.to_string())?,
    );
    Ok(headers)
}

fn composio_request(
    api_key: &str,
    method: reqwest::Method,
    endpoint: &str,
    body: Option<Value>,
    query: Option<&[(&str, String)]>,
) -> Result<Value, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("CloaiDesktopRefactor")
        .build()
        .map_err(|error| error.to_string())?;

    let mut request = client
        .request(method, format!("{}{}", COMPOSIO_API_BASE, endpoint))
        .headers(composio_headers(api_key)?);

    if let Some(query) = query {
        request = request.query(query);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }

    let response = request.send().map_err(|error| error.to_string())?;
    let status = response.status();
    let payload = response
        .json::<Value>()
        .unwrap_or_else(|_| Value::Object(Map::new()));
    if !status.is_success() {
        return Err(payload
            .get("error")
            .and_then(|value| value.get("message").or(Some(value)))
            .and_then(Value::as_str)
            .unwrap_or("Composio request failed")
            .to_string());
    }
    Ok(payload)
}

fn read_connector_config() -> Result<(PathBuf, Value), String> {
    let path = connector_config_path()?;
    let value = normalize_config(Some(read_json(&path)?));
    Ok((path, value))
}

fn write_connector_config(path: &PathBuf, value: &Value) -> Result<(), String> {
    write_json(path, value)
}

fn read_composio_config() -> Result<(PathBuf, Value), String> {
    let path = composio_config_path()?;
    let value = read_json(&path)?;
    Ok((path, value))
}

fn write_composio_config(api_key: String) -> Result<ConnectorComposioStatusResponse, String> {
    let path = composio_config_path()?;
    write_json(&path, &serde_json::json!({ "apiKey": api_key }))?;
    get_composio_status(None)
}

pub(crate) fn get_composio_config() -> Result<ConnectorComposioConfigResponse, String> {
    let path = composio_config_path()?;
    let (api_key, source) = composio_api_key_source()?;
    Ok(ConnectorComposioConfigResponse {
        config_path: Some(path.to_string_lossy().to_string()),
        configured: api_key.is_some(),
        source,
    })
}

pub(crate) fn set_composio_config(
    payload: SetConnectorComposioConfigPayload,
) -> Result<ConnectorComposioStatusResponse, String> {
    let api_key = payload.api_key.trim();
    if api_key.is_empty() {
        return Err("Missing Composio API key".to_string());
    }
    write_composio_config(api_key.to_string())
}

fn mcp_statuses_from_config(config: &Value) -> BTreeMap<String, ConnectorMcpStatus> {
    connector_mcp_statuses(config)
}

fn composio_statuses_from_config(
    config: &Value,
    toolkit_items: &[Value],
) -> BTreeMap<String, ConnectorComposioStatus> {
    let installed = config
        .get("mcpServers")
        .and_then(Value::as_object)
        .map(|servers| servers.contains_key(COMPOSIO_SERVER_NAME))
        .unwrap_or(false);

    let mut toolkit_status_by_slug = BTreeMap::new();
    for toolkit in toolkit_items {
        if let Some(slug) = toolkit
            .get("slug")
            .and_then(Value::as_str)
            .map(|value| value.trim().to_lowercase())
        {
            if !slug.is_empty() {
                toolkit_status_by_slug.insert(slug, toolkit.clone());
            }
        }
    }

    composio_profiles()
        .into_iter()
        .map(|(connector_id, toolkit_slug)| {
            let toolkit = toolkit_status_by_slug.get(toolkit_slug);
            let connected_account = toolkit.and_then(|toolkit| toolkit.get("connected_account"));
            let status = connected_account
                .and_then(|value| value.get("status").and_then(Value::as_str))
                .unwrap_or("")
                .trim()
                .to_lowercase();
            let connected = if status.is_empty() {
                connected_account
                    .and_then(|value| value.get("id"))
                    .and_then(Value::as_str)
                    .is_some()
            } else {
                matches!(
                    status.as_str(),
                    "active" | "connected" | "enabled" | "authorized" | "authenticated"
                )
            };

            (
                connector_id.to_string(),
                ConnectorComposioStatus {
                    available: true,
                    connected,
                    connected_account_id: connected_account
                        .and_then(|value| value.get("id"))
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    installed: installed,
                    server_name: if installed {
                        Some(COMPOSIO_SERVER_NAME.to_string())
                    } else {
                        None
                    },
                    toolkit_slug: Some(toolkit_slug.to_string()),
                },
            )
        })
        .collect()
}

fn ensure_composio_session(api_key: &str, user_id: &str) -> Result<(String, String), String> {
    if let Some((session_id, mcp_url)) = get_stored_composio_session(user_id)? {
        if !session_id.is_empty() && !mcp_url.is_empty() {
            return Ok((session_id, mcp_url));
        }
    }

    let toolkit_slugs: Vec<String> = composio_profiles()
        .values()
        .map(|value| value.to_string())
        .collect();
    let payload = composio_request(
        api_key,
        reqwest::Method::POST,
        "/api/v3/tool_router/session",
        Some(serde_json::json!({
            "toolkits": { "enable": toolkit_slugs },
            "user_id": user_id,
        })),
        None,
    )?;

    let session_id = payload
        .get("session_id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Missing Composio session id".to_string())?
        .to_string();
    let mcp_url = payload
        .get("mcp")
        .and_then(|value| value.get("url"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Missing Composio MCP URL".to_string())?
        .to_string();

    save_composio_session(user_id, &session_id, &mcp_url)?;
    Ok((session_id, mcp_url))
}

fn start_composio_loopback(connector_id: &str) -> Result<(String, mpsc::Receiver<bool>), String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
    listener
        .set_nonblocking(false)
        .map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let callback_url = format!(
        "http://127.0.0.1:{}/connectors/composio/callback?connectorId={}",
        port, connector_id
    );
    let (sender, receiver) = mpsc::channel::<bool>();
    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
            let mut buffer = [0u8; 4096];
            let bytes_read = stream.read(&mut buffer).unwrap_or(0);
            let request = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
            let success = request.contains("status=success")
                || request.contains("success=true")
                || !request.contains("error=");
            let body = if success {
                "Composio authorization completed. You can return to Cloai."
            } else {
                "Composio authorization did not finish cleanly. Return to Cloai to retry."
            };
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<!doctype html><html><body style=\"font-family:-apple-system,sans-serif;padding:32px\"><h2>{}</h2><script>setTimeout(()=>window.close(),1500)</script></body></html>",
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            let _ = sender.send(success);
        }
    });
    Ok((callback_url, receiver))
}

pub(crate) fn get_mcp_status() -> Result<ConnectorMcpStatusResponse, String> {
    let (config_path, config) = read_connector_config()?;
    Ok(ConnectorMcpStatusResponse {
        config_path: Some(config_path.to_string_lossy().to_string()),
        connectors: mcp_statuses_from_config(&config),
    })
}

pub(crate) fn install_mcp_connector(
    connector_id: String,
) -> Result<ConnectorMcpStatusResponse, String> {
    let Some((server_name, server_config)) = install_profiles().get(connector_id.as_str()).cloned()
    else {
        return Err("Connector does not support in-app MCP installation".to_string());
    };
    let (config_path, mut config) = read_connector_config()?;
    config["mcpServers"][server_name] = server_config;
    write_connector_config(&config_path, &config)?;
    Ok(ConnectorMcpStatusResponse {
        config_path: Some(config_path.to_string_lossy().to_string()),
        connectors: mcp_statuses_from_config(&config),
    })
}

pub(crate) fn uninstall_mcp_connector(
    connector_id: String,
) -> Result<ConnectorMcpStatusResponse, String> {
    let Some((server_name, _)) = install_profiles().get(connector_id.as_str()).cloned() else {
        return Err("Connector does not support in-app MCP removal".to_string());
    };
    let (config_path, mut config) = read_connector_config()?;
    if let Some(servers) = config.get_mut("mcpServers").and_then(Value::as_object_mut) {
        servers.remove(server_name);
    }
    write_connector_config(&config_path, &config)?;
    Ok(ConnectorMcpStatusResponse {
        config_path: Some(config_path.to_string_lossy().to_string()),
        connectors: mcp_statuses_from_config(&config),
    })
}

pub(crate) fn get_composio_status(
    user_id: Option<String>,
) -> Result<ConnectorComposioStatusResponse, String> {
    let (config_path, config) = read_connector_config()?;
    let (composio_config_path, stored_config) = read_composio_config()?;
    let api_key = composio_api_key().ok();
    let normalized_user_id = user_id.unwrap_or_default();
    let (session_id, mcp_url) = if let Some(api_key) = api_key.as_deref() {
        if normalized_user_id.trim().is_empty() {
            (None, None)
        } else {
            match ensure_composio_session(api_key, normalized_user_id.trim()) {
                Ok((session_id, mcp_url)) => (Some(session_id), Some(mcp_url)),
                Err(_) => (None, None),
            }
        }
    } else {
        (None, None)
    };

    let toolkit_items =
        if let (Some(api_key), Some(session_id)) = (api_key.as_deref(), session_id.as_deref()) {
            composio_request(
                api_key,
                reqwest::Method::GET,
                &format!("/api/v3.1/tool_router/session/{}/toolkits", session_id),
                None,
                Some(&[(
                    "toolkits",
                    composio_profiles()
                        .values()
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(","),
                )]),
            )
            .ok()
            .and_then(|payload| payload.get("items").and_then(Value::as_array).cloned())
            .unwrap_or_default()
        } else {
            Vec::new()
        };

    let configured = api_key.is_some();
    Ok(ConnectorComposioStatusResponse {
        config_path: Some(composio_config_path.to_string_lossy().to_string()),
        configured,
        connectors: composio_statuses_from_config(&config, &toolkit_items),
        mcp_url,
        server_installed: config
            .get("mcpServers")
            .and_then(Value::as_object)
            .map(|servers| servers.contains_key(COMPOSIO_SERVER_NAME))
            .unwrap_or(false),
        session_id,
    })
}

pub(crate) fn connect_connector_via_composio(
    connector_id: String,
    user_id: String,
) -> Result<ConnectorComposioConnectResponse, String> {
    let toolkit_slug = composio_profiles()
        .get(connector_id.as_str())
        .ok_or_else(|| "Connector is not mapped to a Composio toolkit yet".to_string())?
        .to_string();
    let api_key = composio_api_key()?;
    let (session_id, mcp_url) = ensure_composio_session(&api_key, user_id.trim())?;

    let (config_path, mut config) = read_connector_config()?;
    config["mcpServers"][COMPOSIO_SERVER_NAME] = serde_json::json!({
        "type": "http",
        "url": mcp_url,
        "headers": {
            "x-api-key": api_key,
        }
    });
    write_connector_config(&config_path, &config)?;

    let (callback_url, _callback_receiver) = start_composio_loopback(&connector_id)?;
    let link_payload = composio_request(
        &api_key,
        reqwest::Method::POST,
        &format!("/api/v3.1/tool_router/session/{}/link", session_id),
        Some(serde_json::json!({
            "alias": connector_id,
            "callback_url": callback_url,
            "toolkit": toolkit_slug,
        })),
        None,
    )?;

    let status = get_composio_status(Some(user_id))?;
    Ok(ConnectorComposioConnectResponse {
        ok: true,
        config_path: Some(config_path.to_string_lossy().to_string()),
        connectors: status.connectors,
        mcp_url: status.mcp_url,
        redirect_url: link_payload
            .get("redirect_url")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        server_name: COMPOSIO_SERVER_NAME.to_string(),
        session_id: status.session_id,
    })
}

pub(crate) fn uninstall_connector_composio(
    user_id: String,
) -> Result<ConnectorComposioUninstallResponse, String> {
    let (config_path, mut config) = read_connector_config()?;
    if let Some(servers) = config.get_mut("mcpServers").and_then(Value::as_object_mut) {
        servers.remove(COMPOSIO_SERVER_NAME);
    }
    write_connector_config(&config_path, &config)?;
    let status = get_composio_status(Some(user_id))?;
    Ok(ConnectorComposioUninstallResponse {
        ok: true,
        config_path: Some(config_path.to_string_lossy().to_string()),
        connectors: status.connectors,
        server_name: COMPOSIO_SERVER_NAME.to_string(),
    })
}
