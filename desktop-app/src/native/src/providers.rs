use crate::paths;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::Digest;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportedProviderModel {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportedProvider {
    pub(crate) id: String,
    #[serde(default, rename = "providerKey")]
    pub(crate) provider_key: Option<String>,
    #[serde(default, rename = "providerRef")]
    pub(crate) provider_ref: Option<String>,
    pub(crate) name: String,
    pub(crate) api_key: String,
    pub(crate) base_url: String,
    pub(crate) format: String,
    pub(crate) models: Vec<ImportedProviderModel>,
    pub(crate) enabled: bool,
    pub(crate) icon: Option<String>,
    pub(crate) kind: Option<String>,
    pub(crate) auth_mode: Option<String>,
    pub(crate) variant: Option<String>,
    pub(crate) provider_managed_by_storage: bool,
    pub(crate) oauth: Option<Value>,
    pub(crate) reasoning: Option<Value>,
    pub(crate) supports_web_search: Option<bool>,
    pub(crate) web_search_strategy: Option<String>,
    pub(crate) web_search_tested_at: Option<i64>,
    pub(crate) web_search_test_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CloaiProviderImportResult {
    pub(crate) ok: bool,
    pub(crate) path: String,
    pub(crate) imported_count: usize,
    pub(crate) providers: Vec<ImportedProvider>,
    pub(crate) error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderPreset {
    id: String,
    name: String,
    format: String,
    base_url: String,
    kind: Option<String>,
    auth_mode: Option<String>,
    variant: Option<String>,
    models: Vec<ImportedProviderModel>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderModelListItem {
    id: String,
    name: String,
    provider_id: String,
    provider_key: String,
    provider_ref: String,
    provider_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebSearchTestResult {
    pub(crate) ok: bool,
    pub(crate) strategy: Option<String>,
    pub(crate) hit_count: Option<i64>,
    pub(crate) reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderOAuthStartResult {
    pub(crate) ok: bool,
    pub(crate) provider: ImportedProvider,
    pub(crate) redirect_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderUpsertPayload {
    pub(crate) id: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) api_key: Option<String>,
    pub(crate) base_url: Option<String>,
    pub(crate) format: Option<String>,
    pub(crate) models: Option<Vec<ImportedProviderModel>>,
    pub(crate) enabled: Option<bool>,
    pub(crate) icon: Option<String>,
    pub(crate) kind: Option<String>,
    pub(crate) auth_mode: Option<String>,
    pub(crate) variant: Option<String>,
    pub(crate) oauth: Option<Value>,
    pub(crate) reasoning: Option<Value>,
    pub(crate) supports_web_search: Option<bool>,
    pub(crate) web_search_strategy: Option<String>,
    pub(crate) web_search_tested_at: Option<i64>,
    pub(crate) web_search_test_reason: Option<String>,
}

const OPENAI_AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
const OPENAI_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const OPENAI_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_REDIRECT_URL: &str = "http://localhost:1455/auth/callback";
const OPENAI_SCOPES: &str = "openid profile email offline_access";
const OPENAI_ORIGINATOR: &str = "pi";

fn generate_pkce_code_verifier() -> String {
    let seed = format!(
        "{}{}{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default(),
        uuid::Uuid::new_v4(),
        uuid::Uuid::new_v4()
    );
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(seed);
    verifier.chars().take(96).collect()
}

fn generate_pkce_code_challenge(verifier: &str) -> String {
    let digest = sha2::Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn generate_oauth_state() -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(uuid::Uuid::new_v4().as_bytes())
}

fn decode_jwt_claim(access_token: &str) -> Option<Value> {
    let payload = access_token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .ok()?;
    serde_json::from_slice::<Value>(&bytes).ok()
}

fn extract_openai_account_id(access_token: &str) -> Option<String> {
    decode_jwt_claim(access_token)?
        .get("https://api.openai.com/auth")?
        .get("chatgpt_account_id")?
        .as_str()
        .map(str::to_string)
}

fn fetch_openai_oauth_models(access_token: &str, account_id: &str) -> Result<Vec<String>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get("https://chatgpt.com/backend-api/codex/models")
        .query(&[("client_version", "0.118.0")])
        .bearer_auth(access_token)
        .header("ChatGPT-Account-Id", account_id)
        .send()
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch OpenAI Codex models: {}",
            response.status()
        ));
    }
    let data = response
        .json::<Value>()
        .map_err(|error| error.to_string())?;
    let mut models: Vec<(i64, String)> = data
        .get("models")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|model| {
            let slug = model.get("slug").and_then(Value::as_str)?.to_string();
            let visible = model.get("visibility").and_then(Value::as_str) == Some("list");
            let supported = model
                .get("supported_in_api")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            if !visible || !supported {
                return None;
            }
            Some((
                model.get("priority").and_then(Value::as_i64).unwrap_or(999),
                slug,
            ))
        })
        .collect();
    models.sort_by_key(|(priority, _)| *priority);
    Ok(models.into_iter().map(|(_, slug)| slug).collect())
}

fn start_openai_oauth_loopback() -> Result<(String, mpsc::Receiver<Result<String, String>>), String>
{
    let redirect = url::Url::parse(OPENAI_REDIRECT_URL).map_err(|error| error.to_string())?;
    let host = redirect.host_str().unwrap_or("127.0.0.1").to_string();
    let port = redirect.port().unwrap_or(1455);
    let path = redirect.path().to_string();
    let listener = TcpListener::bind((host.as_str(), port)).map_err(|error| error.to_string())?;
    listener
        .set_nonblocking(false)
        .map_err(|error| error.to_string())?;
    let (sender, receiver) = mpsc::channel::<Result<String, String>>();
    std::thread::spawn(move || {
        let result = (|| -> Result<String, String> {
            let (mut stream, _) = listener.accept().map_err(|error| error.to_string())?;
            stream
                .set_read_timeout(Some(Duration::from_secs(180)))
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
            let request_path = first_line
                .split_whitespace()
                .nth(1)
                .ok_or_else(|| "Invalid OAuth callback path".to_string())?;
            let full_url = format!("http://{}{}", host, request_path);
            let parsed = url::Url::parse(&full_url).map_err(|error| error.to_string())?;
            if parsed.path() != path {
                return Err("Unexpected OAuth callback path".to_string());
            }
            let code = parsed
                .query_pairs()
                .find(|(key, _)| key == "code")
                .map(|(_, value)| value.to_string())
                .ok_or_else(|| "Missing OpenAI OAuth code".to_string())?;
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<!doctype html><html><body style=\"font-family:-apple-system,sans-serif;padding:32px;background:#111;color:#fff\"><h2>OpenAI Connected</h2><p>You can return to Cloai now.</p><script>setTimeout(()=>window.close(),1500)</script></body></html>";
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
            Ok(code)
        })();
        let _ = sender.send(result);
    });
    Ok((OPENAI_REDIRECT_URL.to_string(), receiver))
}

fn exchange_openai_code_for_tokens(
    authorization_code: &str,
    code_verifier: &str,
) -> Result<(String, Option<String>, i64), String> {
    let request_body = [
        ("grant_type", "authorization_code"),
        ("client_id", OPENAI_CLIENT_ID),
        ("code", authorization_code),
        ("code_verifier", code_verifier),
        ("redirect_uri", OPENAI_REDIRECT_URL),
    ];
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(OPENAI_TOKEN_URL)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&request_body)
        .send()
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "OpenAI token exchange failed: {}",
            response.status()
        ));
    }
    let data = response
        .json::<Value>()
        .map_err(|error| error.to_string())?;
    let access_token = data
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| "OpenAI token exchange returned no access token".to_string())?
        .to_string();
    let refresh_token = data
        .get("refresh_token")
        .and_then(Value::as_str)
        .map(str::to_string);
    let expires_in = data
        .get("expires_in")
        .and_then(Value::as_i64)
        .unwrap_or(3600);
    Ok((
        access_token,
        refresh_token,
        chrono::Utc::now().timestamp_millis() + (expires_in * 1000) - 300_000,
    ))
}

fn infer_provider_name(base_url: &str, fallback_name: Option<&str>) -> String {
    if let Some(name) = fallback_name.filter(|value| !value.trim().is_empty()) {
        return name.trim().to_string();
    }

    let host = base_url
        .split("://")
        .nth(1)
        .unwrap_or(base_url)
        .split('/')
        .next()
        .unwrap_or(base_url)
        .split(':')
        .next()
        .unwrap_or(base_url)
        .trim();

    if !host.is_empty() {
        let parts: Vec<&str> = host.split('.').filter(|part| !part.is_empty()).collect();
        let label = if parts.len() >= 2 {
            parts[parts.len() - 2]
        } else {
            host
        };
        if !label.is_empty() {
            let mut chars = label.chars();
            if let Some(first) = chars.next() {
                return first.to_uppercase().collect::<String>() + chars.as_str();
            }
        }
    }

    "Custom".to_string()
}

fn normalize_compatible_base_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.to_ascii_lowercase().starts_with("http:")
        && !trimmed.to_ascii_lowercase().starts_with("http://")
    {
        return Some(trimmed.replacen("http:", "http://", 1));
    }
    if trimmed.to_ascii_lowercase().starts_with("https:")
        && !trimmed.to_ascii_lowercase().starts_with("https://")
    {
        return Some(trimmed.replacen("https:", "https://", 1));
    }
    Some(trimmed.to_string())
}

fn normalize_base_url(url: Option<String>) -> Option<String> {
    url.map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
}

fn get_provider_kind(format: &str, explicit_kind: Option<&str>) -> String {
    match explicit_kind {
        Some("anthropic-like") | Some("openai-like") | Some("gemini-like") => {
            explicit_kind.unwrap().to_string()
        }
        _ => {
            if format == "openai" {
                "openai-like".to_string()
            } else {
                "anthropic-like".to_string()
            }
        }
    }
}

fn get_provider_auth_mode(format: &str, kind: &str, explicit_auth_mode: Option<&str>) -> String {
    if let Some(auth_mode) = explicit_auth_mode.filter(|value| !value.trim().is_empty()) {
        return auth_mode.trim().to_string();
    }
    if kind == "gemini-like" {
        return "vertex-compatible".to_string();
    }
    if format == "openai" {
        "chat-completions".to_string()
    } else {
        "api-key".to_string()
    }
}

fn derive_provider_id(base_url: &str, kind: &str) -> String {
    if base_url.is_empty() {
        return match kind {
            "openai-like" => "openai".to_string(),
            "gemini-like" => "gemini".to_string(),
            _ => "anthropic".to_string(),
        };
    }

    let host = base_url
        .split("://")
        .nth(1)
        .unwrap_or(base_url)
        .split('/')
        .next()
        .unwrap_or(base_url)
        .split(':')
        .next()
        .unwrap_or(base_url)
        .trim()
        .trim_start_matches("api.")
        .trim_start_matches("api-")
        .trim_start_matches("openai.")
        .trim_start_matches("openai-")
        .trim_start_matches("claude.")
        .trim_start_matches("claude-")
        .trim_start_matches("generativelanguage.")
        .trim_start_matches("generativelanguage-")
        .trim_start_matches("googleapis.")
        .trim_start_matches("googleapis-")
        .trim_start_matches("www.");
    let provider_id = host
        .split('.')
        .find(|part| !part.is_empty())
        .unwrap_or(match kind {
            "openai-like" => "openai",
            "gemini-like" => "gemini",
            _ => "anthropic",
        });
    provider_id.to_ascii_lowercase()
}

fn infer_provider_variant(kind: &str, auth_mode: &str, base_url: &str, id: &str) -> String {
    let base_url_lower = base_url.to_ascii_lowercase();
    let id_lower = id.to_ascii_lowercase();

    if kind == "anthropic-like" {
        if base_url_lower.is_empty() && (id_lower.is_empty() || id_lower == "anthropic") {
            return "claude-official".to_string();
        }
        return "custom-anthropic-like".to_string();
    }

    if kind == "openai-like" {
        if auth_mode == "oauth" {
            return if id_lower == "github-copilot" {
                "github-copilot-oauth".to_string()
            } else {
                "openai-oauth".to_string()
            };
        }
        if base_url_lower.contains("api.openai.com")
            || (base_url_lower.is_empty() && id_lower == "openai" && auth_mode == "responses")
        {
            return "openai-official-responses".to_string();
        }
        return if auth_mode == "responses" {
            "custom-openai-responses".to_string()
        } else {
            "custom-openai-chat".to_string()
        };
    }

    if base_url_lower.contains("generativelanguage.googleapis.com")
        || id_lower == "gemini-ai-studio"
    {
        return "gemini-ai-studio".to_string();
    }
    if id_lower == "antigravity" {
        return "gemini-antigravity-oauth".to_string();
    }
    if auth_mode == "gemini-cli-oauth" {
        return "gemini-cli-oauth".to_string();
    }
    "custom-google-vertex-like".to_string()
}

fn normalize_provider_models(value: Option<&Value>) -> Vec<ImportedProviderModel> {
    let mut deduped = std::collections::BTreeMap::<String, ImportedProviderModel>::new();
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };

    for item in items {
        match item {
            Value::String(id) if !id.trim().is_empty() => {
                let trimmed = id.trim().to_string();
                deduped.insert(
                    trimmed.clone(),
                    ImportedProviderModel {
                        id: trimmed.clone(),
                        name: trimmed,
                        enabled: true,
                    },
                );
            }
            Value::Object(map) => {
                let id = map
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string);
                let Some(id) = id else {
                    continue;
                };
                let name = map
                    .get("name")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
                    .unwrap_or_else(|| id.clone());
                let enabled = map.get("enabled").and_then(Value::as_bool).unwrap_or(true);
                deduped.insert(id.clone(), ImportedProviderModel { id, name, enabled });
            }
            _ => {}
        }
    }

    deduped.into_values().collect()
}

fn provider_not_found_reason(reason: &str) -> bool {
    let normalized = reason.to_ascii_lowercase();
    normalized.contains("model.not.found")
        || normalized.contains("model not found")
        || normalized.contains("not exist")
        || normalized.contains("no channel")
}

fn anthropic_http_probe(
    provider: &ImportedProvider,
    auth_style: &str,
    model_id: &str,
) -> WebSearchTestResult {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent("cloai-desktop-websearch-probe/1.0")
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return WebSearchTestResult {
                ok: false,
                strategy: None,
                hit_count: None,
                reason: Some(error.to_string()),
            }
        }
    };
    let base_url = normalize_base_url(Some(provider.base_url.clone())).unwrap_or_default();
    let endpoint = format!("{}/v1/messages", base_url);
    let body = serde_json::json!({
        "model": model_id,
        "max_tokens": 1024,
        "messages": [{
            "role": "user",
            "content": "Use web search to find the top news headline from today. Respond with just the headline and source URL."
        }],
        "tools": [{
            "type": "web_search_20250305",
            "name": "web_search",
            "max_uses": 1
        }]
    });

    let mut request = client
        .post(endpoint)
        .header("Content-Type", "application/json")
        .header("anthropic-version", "2023-06-01")
        .json(&body);
    request = if auth_style == "bearer" {
        request.bearer_auth(&provider.api_key)
    } else {
        request.header("x-api-key", &provider.api_key)
    };
    let response = match request.send() {
        Ok(response) => response,
        Err(error) => {
            return WebSearchTestResult {
                ok: false,
                strategy: None,
                hit_count: None,
                reason: Some(format!("Network error: {}", error)),
            }
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        return WebSearchTestResult {
            ok: false,
            strategy: None,
            hit_count: None,
            reason: Some(format!(
                "HTTP {}: {}",
                status,
                text.chars().take(300).collect::<String>()
            )),
        };
    }

    let data = match response.json::<Value>() {
        Ok(data) => data,
        Err(error) => {
            return WebSearchTestResult {
                ok: false,
                strategy: None,
                hit_count: None,
                reason: Some(format!("Non-JSON response: {}", error)),
            }
        }
    };
    let content = data
        .get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let has_server_tool = content.iter().any(|block| {
        block.get("type").and_then(Value::as_str) == Some("server_tool_use")
            && matches!(
                block.get("name").and_then(Value::as_str),
                Some("web_search" | "WebSearch")
            )
    });
    let hit_count = content
        .iter()
        .find(|block| block.get("type").and_then(Value::as_str) == Some("web_search_tool_result"))
        .and_then(|block| block.get("content"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter(|item| item.get("url").and_then(Value::as_str).is_some())
                .count() as i64
        })
        .unwrap_or(0);

    if hit_count > 0 {
        return WebSearchTestResult {
            ok: true,
            strategy: Some("anthropic_native".to_string()),
            hit_count: Some(hit_count),
            reason: None,
        };
    }
    if has_server_tool {
        return WebSearchTestResult {
            ok: false,
            strategy: None,
            hit_count: None,
            reason: Some("server_tool_use present but 0 URLs in result".to_string()),
        };
    }
    WebSearchTestResult {
        ok: false,
        strategy: None,
        hit_count: None,
        reason: Some(
            "Response has no server_tool_use block (provider likely strips web_search_20250305)"
                .to_string(),
        ),
    }
}

fn probe_anthropic_web_search(provider: &ImportedProvider) -> WebSearchTestResult {
    let mut enabled_models: Vec<String> = provider
        .models
        .iter()
        .filter(|model| model.enabled && !model.id.trim().is_empty())
        .map(|model| model.id.clone())
        .collect();
    enabled_models.sort_by_key(|id| {
        if id.to_ascii_lowercase().contains("opus") {
            0
        } else if id.to_ascii_lowercase().contains("sonnet") {
            1
        } else if id.to_ascii_lowercase().contains("haiku") {
            2
        } else {
            3
        }
    });
    if enabled_models.is_empty() {
        return WebSearchTestResult {
            ok: false,
            strategy: None,
            hit_count: None,
            reason: Some("无可用模型".to_string()),
        };
    }

    let mut attempts = Vec::<WebSearchTestResult>::new();
    for model_id in enabled_models {
        let model_id = model_id.trim_end_matches("-thinking").to_string();
        for auth_style in ["bearer", "x-api-key"] {
            let result = anthropic_http_probe(provider, auth_style, &model_id);
            if result.ok {
                return result;
            }
            let skip_next_style = result
                .reason
                .as_deref()
                .map(provider_not_found_reason)
                .unwrap_or(false);
            attempts.push(result);
            if skip_next_style {
                break;
            }
        }
    }

    attempts
        .iter()
        .find(|attempt| {
            attempt
                .reason
                .as_deref()
                .map(|reason| {
                    !reason.contains("Network error") && !provider_not_found_reason(reason)
                })
                .unwrap_or(false)
        })
        .cloned()
        .or_else(|| attempts.pop())
        .unwrap_or(WebSearchTestResult {
            ok: false,
            strategy: None,
            hit_count: None,
            reason: Some("All model/auth combinations failed".to_string()),
        })
}

fn probe_openai_web_search(_provider: &ImportedProvider) -> WebSearchTestResult {
    let provider = _provider;
    let mut endpoint = normalize_base_url(Some(provider.base_url.clone())).unwrap_or_default();
    if !endpoint.ends_with("/v1") {
        endpoint.push_str("/v1");
    }
    endpoint.push_str("/chat/completions");
    let model_id = provider
        .models
        .iter()
        .find(|model| model.enabled && !model.id.trim().is_empty())
        .map(|model| model.id.clone())
        .or_else(|| provider.models.first().map(|model| model.id.clone()));
    let Some(model_id) = model_id else {
        return WebSearchTestResult {
            ok: false,
            strategy: None,
            hit_count: None,
            reason: Some("无可用模型".to_string()),
        };
    };

    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return WebSearchTestResult {
                ok: false,
                strategy: None,
                hit_count: None,
                reason: Some(error.to_string()),
            }
        }
    };
    let probe_query = "What is today's top news headline? Please search the web.";
    let headers = |request: reqwest::blocking::RequestBuilder| {
        request
            .header("Content-Type", "application/json")
            .bearer_auth(&provider.api_key)
    };

    let dashscope_body = serde_json::json!({
        "model": model_id,
        "messages": [{ "role": "user", "content": probe_query }],
        "enable_search": true,
        "search_options": { "forced_search": true, "search_strategy": "standard" },
        "stream": false,
        "max_tokens": 512,
    });
    if let Ok(response) = headers(client.post(&endpoint).json(&dashscope_body)).send() {
        if response.status().is_success() {
            if let Ok(data) = response.json::<Value>() {
                let hits = data
                    .get("search_info")
                    .and_then(|value| value.get("search_results").or_else(|| value.get("results")))
                    .and_then(Value::as_array)
                    .cloned()
                    .or_else(|| {
                        data.get("search_results")
                            .and_then(Value::as_array)
                            .cloned()
                    })
                    .unwrap_or_default();
                let hit_count = hits
                    .iter()
                    .filter(|hit| {
                        hit.get("url").and_then(Value::as_str).is_some()
                            || hit.get("link").and_then(Value::as_str).is_some()
                    })
                    .count() as i64;
                if hit_count > 0 {
                    return WebSearchTestResult {
                        ok: true,
                        strategy: Some("dashscope".to_string()),
                        hit_count: Some(hit_count),
                        reason: None,
                    };
                }
            }
        }
    }

    let bigmodel_body = serde_json::json!({
        "model": model_id,
        "messages": [{ "role": "user", "content": probe_query }],
        "tools": [{
            "type": "web_search",
            "web_search": { "enable": true, "search_query": probe_query }
        }],
        "stream": false,
        "max_tokens": 512,
    });
    if let Ok(response) = headers(client.post(&endpoint).json(&bigmodel_body)).send() {
        if response.status().is_success() {
            if let Ok(data) = response.json::<Value>() {
                let hits = data
                    .get("web_search")
                    .and_then(Value::as_array)
                    .cloned()
                    .or_else(|| {
                        data.get("choices")
                            .and_then(Value::as_array)
                            .and_then(|choices| choices.first())
                            .and_then(|choice| choice.get("message"))
                            .and_then(|message| message.get("web_search"))
                            .and_then(Value::as_array)
                            .cloned()
                    })
                    .unwrap_or_default();
                let hit_count = hits
                    .iter()
                    .filter(|hit| {
                        hit.get("url").and_then(Value::as_str).is_some()
                            || hit.get("link").and_then(Value::as_str).is_some()
                    })
                    .count() as i64;
                if hit_count > 0 {
                    return WebSearchTestResult {
                        ok: true,
                        strategy: Some("bigmodel".to_string()),
                        hit_count: Some(hit_count),
                        reason: None,
                    };
                }
            }
        }
    }

    WebSearchTestResult {
        ok: false,
        strategy: None,
        hit_count: None,
        reason: Some("No structured search results in response".to_string()),
    }
}

fn normalize_provider_from_map(map: &Map<String, Value>) -> Option<ImportedProvider> {
    let explicit_kind = map.get("kind").and_then(Value::as_str);
    let raw_format = map.get("format").and_then(Value::as_str);
    let format = if raw_format == Some("openai")
        || explicit_kind == Some("openai-like")
        || explicit_kind == Some("gemini-like")
    {
        "openai".to_string()
    } else {
        "anthropic".to_string()
    };
    let kind = get_provider_kind(&format, explicit_kind);
    let base_url = normalize_base_url(normalize_compatible_base_url(
        map.get("baseURL")
            .or_else(|| map.get("baseUrl"))
            .and_then(Value::as_str)
            .unwrap_or_default(),
    ))
    .unwrap_or_default();
    let auth_mode =
        get_provider_auth_mode(&format, &kind, map.get("authMode").and_then(Value::as_str));
    let id = map
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| derive_provider_id(&base_url, &kind));
    let variant = map
        .get("variant")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| infer_provider_variant(&kind, &auth_mode, &base_url, &id));

    let name = infer_provider_name(&base_url, map.get("name").and_then(Value::as_str));
    let models = normalize_provider_models(map.get("models").or_else(|| map.get("modelDetails")));
    let provider_key = format!("{}::{}::{}::{}::{}", kind, variant, id, auth_mode, base_url);
    let provider_ref = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&provider_key);

    Some(ImportedProvider {
        id,
        provider_key: Some(provider_key),
        provider_ref: Some(provider_ref),
        name,
        api_key: map
            .get("apiKey")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        base_url,
        format,
        models,
        enabled: map.get("enabled").and_then(Value::as_bool).unwrap_or(true),
        icon: map.get("icon").and_then(Value::as_str).map(str::to_string),
        kind: Some(kind),
        auth_mode: Some(auth_mode),
        variant: Some(variant),
        provider_managed_by_storage: true,
        oauth: map.get("oauth").cloned(),
        reasoning: map.get("reasoning").cloned(),
        supports_web_search: map.get("supportsWebSearch").and_then(Value::as_bool),
        web_search_strategy: map
            .get("webSearchStrategy")
            .and_then(Value::as_str)
            .map(str::to_string),
        web_search_tested_at: map.get("webSearchTestedAt").and_then(Value::as_i64),
        web_search_test_reason: map
            .get("webSearchTestReason")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

fn import_provider_from_value(value: &Value) -> Option<ImportedProvider> {
    let Value::Object(map) = value else {
        return None;
    };
    normalize_provider_from_map(map)
}

pub(crate) fn get_provider_storage_key(provider: &ImportedProvider) -> String {
    format!(
        "{}::{}::{}::{}::{}",
        provider.kind.as_deref().unwrap_or(""),
        provider.variant.as_deref().unwrap_or(""),
        provider.id,
        provider.auth_mode.as_deref().unwrap_or(""),
        provider.base_url
    )
}

pub(crate) fn get_provider_ref(provider: &ImportedProvider) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(get_provider_storage_key(provider))
}

fn decode_provider_ref(reference: &str) -> Option<String> {
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(reference.trim())
        .ok()?;
    String::from_utf8(bytes).ok()
}

pub(crate) fn provider_matches_ref(provider: &ImportedProvider, reference: &str) -> bool {
    let reference = reference.trim();
    if reference.is_empty() {
        return false;
    }
    let storage_key = get_provider_storage_key(provider);
    reference == storage_key
        || reference == get_provider_ref(provider)
        || decode_provider_ref(reference).as_deref() == Some(storage_key.as_str())
        || provider.id == reference
}

fn to_runtime_storage_provider(provider: &ImportedProvider) -> Value {
    let mut storage_provider = Map::new();
    storage_provider.insert("id".to_string(), Value::String(provider.id.clone()));
    storage_provider.insert(
        "kind".to_string(),
        Value::String(
            provider
                .kind
                .clone()
                .unwrap_or_else(|| "anthropic-like".to_string()),
        ),
    );
    storage_provider.insert(
        "variant".to_string(),
        Value::String(provider.variant.clone().unwrap_or_default()),
    );
    storage_provider.insert(
        "authMode".to_string(),
        Value::String(
            provider
                .auth_mode
                .clone()
                .unwrap_or_else(|| "api-key".to_string()),
        ),
    );
    storage_provider.insert(
        "baseURL".to_string(),
        Value::String(provider.base_url.clone()),
    );
    storage_provider.insert(
        "models".to_string(),
        Value::Array(
            provider
                .models
                .iter()
                .filter(|model| model.enabled)
                .map(|model| Value::String(model.id.clone()))
                .collect(),
        ),
    );
    if !provider.api_key.is_empty() {
        storage_provider.insert(
            "apiKey".to_string(),
            Value::String(provider.api_key.clone()),
        );
    }
    if let Some(oauth) = provider.oauth.clone() {
        storage_provider.insert("oauth".to_string(), oauth);
    }
    if let Some(reasoning) = provider.reasoning.clone() {
        storage_provider.insert("reasoning".to_string(), reasoning);
    }
    Value::Object(storage_provider)
}

fn read_providers_from_runtime() -> Result<Vec<ImportedProvider>, String> {
    let credentials = paths::read_runtime_credentials()?;
    Ok(credentials
        .get("customApiEndpoint")
        .and_then(|value| value.get("providers"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(import_provider_from_value)
                .collect()
        })
        .unwrap_or_default())
}

fn merge_providers(
    existing: Vec<ImportedProvider>,
    incoming: Vec<ImportedProvider>,
) -> Vec<ImportedProvider> {
    let mut merged = existing;
    for provider in incoming {
        let incoming_key = get_provider_storage_key(&provider);
        if let Some(existing_provider) = merged
            .iter_mut()
            .find(|item| get_provider_storage_key(item) == incoming_key)
        {
            let preserved_id = existing_provider.id.clone();
            *existing_provider = provider.clone();
            existing_provider.id = preserved_id;
        } else {
            merged.push(provider);
        }
    }
    merged
}

fn pick_active_provider(
    storage: &Map<String, Value>,
    providers: &[ImportedProvider],
) -> Option<ImportedProvider> {
    let active_provider_key = storage.get("activeProviderKey").and_then(Value::as_str);
    if let Some(key) = active_provider_key {
        if let Some(provider) = providers
            .iter()
            .find(|provider| get_provider_storage_key(provider) == key)
        {
            return Some(provider.clone());
        }
    }

    let active_provider_id = storage
        .get("activeProvider")
        .or_else(|| storage.get("providerId"))
        .and_then(Value::as_str);
    let active_auth_mode = storage
        .get("activeAuthMode")
        .or_else(|| storage.get("authMode"))
        .and_then(Value::as_str);
    let active_model = storage
        .get("activeModel")
        .or_else(|| storage.get("model"))
        .and_then(Value::as_str);
    let active_kind = storage.get("providerKind").and_then(Value::as_str);
    let active_variant = storage.get("variant").and_then(Value::as_str);

    for strictness in 0..4 {
        if let Some(provider) = providers.iter().find(|provider| {
            let matches_id = active_provider_id
                .map(|id| provider.id == id)
                .unwrap_or(true);
            let matches_kind = if strictness <= 3 {
                active_kind
                    .map(|kind| provider.kind.as_deref() == Some(kind))
                    .unwrap_or(true)
            } else {
                true
            };
            let matches_variant = if strictness <= 2 {
                active_variant
                    .map(|variant| provider.variant.as_deref() == Some(variant))
                    .unwrap_or(true)
            } else {
                true
            };
            let matches_auth_mode = if strictness <= 1 {
                active_auth_mode
                    .map(|auth_mode| provider.auth_mode.as_deref() == Some(auth_mode))
                    .unwrap_or(true)
            } else {
                true
            };
            let matches_model = if strictness == 0 {
                active_model
                    .map(|model| {
                        provider
                            .models
                            .iter()
                            .any(|item| item.id == model && item.enabled)
                    })
                    .unwrap_or(true)
            } else {
                true
            };
            matches_id && matches_kind && matches_variant && matches_auth_mode && matches_model
        }) {
            return Some(provider.clone());
        }
    }

    providers.first().cloned()
}

fn build_provider_summary(
    provider: &ImportedProvider,
    active_model: Option<&str>,
) -> Map<String, Value> {
    let mut summary = Map::new();
    summary.insert(
        "provider".to_string(),
        Value::String(match provider.kind.as_deref() {
            Some("openai-like") => "openai".to_string(),
            Some("gemini-like") => "gemini".to_string(),
            _ => "anthropic".to_string(),
        }),
    );
    summary.insert(
        "providerKind".to_string(),
        Value::String(provider.kind.clone().unwrap_or_default()),
    );
    summary.insert(
        "variant".to_string(),
        Value::String(provider.variant.clone().unwrap_or_default()),
    );
    summary.insert("providerId".to_string(), Value::String(provider.id.clone()));
    summary.insert(
        "authMode".to_string(),
        Value::String(provider.auth_mode.clone().unwrap_or_default()),
    );
    summary.insert(
        "baseURL".to_string(),
        Value::String(provider.base_url.clone()),
    );
    if provider.kind.as_deref() != Some("gemini-like")
        || provider.auth_mode.as_deref() != Some("gemini-cli-oauth")
    {
        summary.insert(
            "apiKey".to_string(),
            Value::String(provider.api_key.clone()),
        );
    }
    if let Some(model) = active_model {
        summary.insert("model".to_string(), Value::String(model.to_string()));
    }
    summary.insert(
        "savedModels".to_string(),
        Value::Array(
            provider
                .models
                .iter()
                .filter(|model| model.enabled)
                .map(|model| Value::String(model.id.clone()))
                .collect(),
        ),
    );
    summary
}

fn build_runtime_storage(
    providers: &[ImportedProvider],
    current_storage: Option<&Map<String, Value>>,
    preferred_active_provider_ref: Option<String>,
    preferred_active_model_id: Option<String>,
) -> Value {
    if providers.is_empty() {
        return Value::Object(Map::new());
    }

    let mut storage = current_storage.cloned().unwrap_or_default();
    storage.insert(
        "providers".to_string(),
        Value::Array(providers.iter().map(to_runtime_storage_provider).collect()),
    );

    if let Some(active_provider) =
        preferred_active_provider_ref
            .as_deref()
            .and_then(|provider_ref| {
                providers
                    .iter()
                    .find(|provider| provider_matches_ref(provider, provider_ref))
            })
    {
        storage.insert(
            "activeProviderKey".to_string(),
            Value::String(get_provider_storage_key(active_provider)),
        );
        storage.insert(
            "activeProvider".to_string(),
            Value::String(active_provider.id.clone()),
        );
        storage.insert(
            "providerId".to_string(),
            Value::String(active_provider.id.clone()),
        );
        storage.insert(
            "activeAuthMode".to_string(),
            Value::String(active_provider.auth_mode.clone().unwrap_or_default()),
        );
    } else if let Some(active_provider_id) = storage
        .get("activeProvider")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            storage
                .get("providerId")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
    {
        storage.insert(
            "activeProvider".to_string(),
            Value::String(active_provider_id.clone()),
        );
        storage.insert("providerId".to_string(), Value::String(active_provider_id));
    }

    if let Some(active_model_id) = preferred_active_model_id
        .clone()
        .or_else(|| {
            storage
                .get("activeModel")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            storage
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
    {
        storage.insert(
            "activeModel".to_string(),
            Value::String(active_model_id.clone()),
        );
        storage.insert("model".to_string(), Value::String(active_model_id));
    }

    let active_provider =
        pick_active_provider(&storage, providers).unwrap_or_else(|| providers[0].clone());
    let enabled_model_ids: Vec<String> = active_provider
        .models
        .iter()
        .filter(|model| model.enabled)
        .map(|model| model.id.clone())
        .collect();
    let fallback_model = enabled_model_ids.first().cloned().or_else(|| {
        providers
            .iter()
            .flat_map(|provider| provider.models.iter().filter(|model| model.enabled))
            .map(|model| model.id.clone())
            .next()
    });
    let desired_active_model = preferred_active_model_id
        .or_else(|| {
            storage
                .get("activeModel")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            storage
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_string)
        });
    let active_model = desired_active_model
        .filter(|model| enabled_model_ids.iter().any(|item| item == model))
        .or(fallback_model);

    storage.insert(
        "activeProviderKey".to_string(),
        Value::String(get_provider_storage_key(&active_provider)),
    );
    storage.insert(
        "activeProvider".to_string(),
        Value::String(active_provider.id.clone()),
    );
    storage.insert(
        "activeAuthMode".to_string(),
        Value::String(active_provider.auth_mode.clone().unwrap_or_default()),
    );
    if let Some(model) = active_model.clone() {
        storage.insert("activeModel".to_string(), Value::String(model.clone()));
        storage.insert("model".to_string(), Value::String(model));
    }
    storage.extend(build_provider_summary(
        &active_provider,
        active_model.as_deref(),
    ));
    Value::Object(storage)
}

fn persist_providers(
    next_providers: Vec<ImportedProvider>,
    preferred_active_provider_ref: Option<String>,
    preferred_active_model_id: Option<String>,
) -> Result<Vec<ImportedProvider>, String> {
    let normalized_providers = next_providers;
    let mut credentials = paths::read_runtime_credentials()?;
    let current_storage = credentials
        .get("customApiEndpoint")
        .and_then(Value::as_object);
    let custom_api_endpoint = build_runtime_storage(
        &normalized_providers,
        current_storage,
        preferred_active_provider_ref,
        preferred_active_model_id,
    );
    let root = credentials
        .as_object_mut()
        .ok_or_else(|| "Invalid cloai credentials root".to_string())?;
    root.insert("customApiEndpoint".to_string(), custom_api_endpoint);
    paths::write_runtime_credentials(&credentials)?;
    Ok(normalized_providers)
}

pub(crate) fn sync_active_provider_selection(
    provider_ref: String,
    model_id: String,
) -> Result<(), String> {
    let providers = read_providers_from_runtime()?;
    persist_providers(providers, Some(provider_ref), Some(model_id))?;
    Ok(())
}

fn next_provider_id(existing: &[ImportedProvider], base_id: String) -> String {
    if !existing.iter().any(|provider| provider.id == base_id) {
        return base_id;
    }

    let mut index = 2;
    loop {
        let candidate = format!("{}-{}", base_id, index);
        if !existing.iter().any(|provider| provider.id == candidate) {
            return candidate;
        }
        index += 1;
    }
}

fn read_cloai_providers_from_path(path: &Path) -> Result<Vec<ImportedProvider>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    let parsed: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    let providers = parsed
        .get("customApiEndpoint")
        .and_then(|value| value.get("providers"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(import_provider_from_value)
                .collect()
        })
        .unwrap_or_default();
    Ok(providers)
}

pub(crate) fn import_cloai_providers(
    path: Option<String>,
) -> Result<CloaiProviderImportResult, String> {
    let source_path = path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or(paths::cloai_credentials_path()?);

    let imported_providers = read_cloai_providers_from_path(&source_path)?;
    let providers = if imported_providers.is_empty() {
        Vec::new()
    } else {
        let merged = merge_providers(read_providers_from_runtime()?, imported_providers.clone());
        persist_providers(merged, None, None)?
    };
    if imported_providers.is_empty() {
        return Ok(CloaiProviderImportResult {
            ok: false,
            path: source_path.to_string_lossy().to_string(),
            imported_count: 0,
            providers,
            error: Some("No providers found in cloai credentials".to_string()),
        });
    }

    Ok(CloaiProviderImportResult {
        ok: true,
        path: source_path.to_string_lossy().to_string(),
        imported_count: imported_providers.len(),
        providers,
        error: None,
    })
}

pub(crate) fn get_providers() -> Result<Vec<ImportedProvider>, String> {
    read_providers_from_runtime()
}

pub(crate) fn create_provider(payload: ProviderUpsertPayload) -> Result<ImportedProvider, String> {
    let mut providers = read_providers_from_runtime()?;
    let provisional_base_url = normalize_base_url(normalize_compatible_base_url(
        payload.base_url.as_deref().unwrap_or_default(),
    ))
    .unwrap_or_default();
    let provisional_kind = get_provider_kind(
        if payload.format.as_deref() == Some("openai") {
            "openai"
        } else {
            "anthropic"
        },
        payload.kind.as_deref(),
    );
    let base_id = payload
        .id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| derive_provider_id(&provisional_base_url, &provisional_kind));

    let model_values = payload.models.unwrap_or_default();
    let value = serde_json::json!({
        "id": next_provider_id(&providers, base_id),
        "name": payload.name.unwrap_or_default(),
        "apiKey": payload.api_key.unwrap_or_default(),
        "baseUrl": payload.base_url.unwrap_or_default(),
        "format": payload.format.unwrap_or_else(|| "anthropic".to_string()),
        "models": model_values,
        "enabled": payload.enabled.unwrap_or(true),
        "icon": payload.icon,
        "kind": payload.kind,
        "authMode": payload.auth_mode,
        "variant": payload.variant,
        "oauth": payload.oauth,
        "reasoning": payload.reasoning,
        "supportsWebSearch": payload.supports_web_search.unwrap_or(false),
        "webSearchStrategy": payload.web_search_strategy,
        "webSearchTestedAt": payload.web_search_tested_at,
        "webSearchTestReason": payload.web_search_test_reason,
    });
    let provider =
        import_provider_from_value(&value).ok_or_else(|| "Invalid provider payload".to_string())?;
    if provider.name.trim().is_empty() {
        return Err("Missing name".to_string());
    }

    providers.push(provider.clone());
    persist_providers(providers, None, None)?;
    Ok(provider)
}

pub(crate) fn update_provider(
    provider_ref: String,
    payload: ProviderUpsertPayload,
) -> Result<ImportedProvider, String> {
    let mut providers = read_providers_from_runtime()?;
    let Some(index) = providers
        .iter()
        .position(|provider| provider_matches_ref(provider, &provider_ref))
    else {
        return Err("Not found".to_string());
    };
    let current = providers[index].clone();
    let value = serde_json::json!({
        "id": current.id,
        "name": payload.name.unwrap_or(current.name),
        "apiKey": payload.api_key.unwrap_or(current.api_key),
        "baseUrl": payload.base_url.unwrap_or(current.base_url),
        "format": payload.format.unwrap_or(current.format),
        "models": payload.models.unwrap_or(current.models),
        "enabled": payload.enabled.unwrap_or(current.enabled),
        "icon": payload.icon.or(current.icon),
        "kind": payload.kind.or(current.kind),
        "authMode": payload.auth_mode.or(current.auth_mode),
        "variant": payload.variant.or(current.variant),
        "oauth": payload.oauth.or(current.oauth),
        "reasoning": payload.reasoning.or(current.reasoning),
        "supportsWebSearch": payload.supports_web_search.or(current.supports_web_search),
        "webSearchStrategy": payload.web_search_strategy.or(current.web_search_strategy),
        "webSearchTestedAt": payload.web_search_tested_at.or(current.web_search_tested_at),
        "webSearchTestReason": payload.web_search_test_reason.or(current.web_search_test_reason),
    });
    let provider =
        import_provider_from_value(&value).ok_or_else(|| "Invalid provider payload".to_string())?;
    providers[index] = provider.clone();
    persist_providers(providers, None, None)?;
    Ok(provider)
}

pub(crate) fn delete_provider(provider_ref: String) -> Result<bool, String> {
    let providers = read_providers_from_runtime()?;
    if !providers
        .iter()
        .any(|provider| provider_matches_ref(provider, &provider_ref))
    {
        return Err("Not found".to_string());
    }
    let next: Vec<ImportedProvider> = providers
        .into_iter()
        .filter(|provider| !provider_matches_ref(provider, &provider_ref))
        .collect();
    persist_providers(next, None, None)?;
    Ok(true)
}

pub(crate) fn get_provider_models() -> Result<Vec<ProviderModelListItem>, String> {
    let providers = read_providers_from_runtime()?;
    let mut models = Vec::new();

    for provider in providers {
        if !provider.enabled {
            continue;
        }
        let provider_key = get_provider_storage_key(&provider);
        let provider_ref = get_provider_ref(&provider);
        for model in &provider.models {
            if !model.enabled || model.id.trim().is_empty() {
                continue;
            }
            models.push(ProviderModelListItem {
                id: model.id.clone(),
                name: if model.name.trim().is_empty() {
                    model.id.clone()
                } else {
                    model.name.clone()
                },
                provider_id: provider_ref.clone(),
                provider_key: provider_key.clone(),
                provider_ref: provider_ref.clone(),
                provider_name: provider.name.clone(),
            });
        }
    }

    Ok(models)
}

pub(crate) fn test_provider_websearch(provider_ref: String) -> Result<WebSearchTestResult, String> {
    let mut providers = read_providers_from_runtime()?;
    let Some(index) = providers
        .iter()
        .position(|provider| provider_matches_ref(provider, &provider_ref))
    else {
        return Err("Provider not found".to_string());
    };
    let provider = providers[index].clone();
    if provider.base_url.trim().is_empty() || provider.api_key.trim().is_empty() {
        return Ok(WebSearchTestResult {
            ok: false,
            strategy: None,
            hit_count: None,
            reason: Some("Missing baseUrl or apiKey".to_string()),
        });
    }

    let result = if provider.format == "anthropic" {
        probe_anthropic_web_search(&provider)
    } else {
        probe_openai_web_search(&provider)
    };

    let mut updated_provider = provider.clone();
    updated_provider.supports_web_search = Some(result.ok);
    updated_provider.web_search_strategy = result.strategy.clone();
    updated_provider.web_search_tested_at = Some(chrono::Utc::now().timestamp_millis());
    updated_provider.web_search_test_reason = result.reason.clone();
    providers[index] = updated_provider;
    persist_providers(providers, None, None)?;
    Ok(result)
}

pub(crate) fn start_openai_oauth_provider<F>(
    open_auth_url: F,
) -> Result<ProviderOAuthStartResult, String>
where
    F: FnOnce(&str) -> Result<(), String>,
{
    let code_verifier = generate_pkce_code_verifier();
    let code_challenge = generate_pkce_code_challenge(&code_verifier);
    let state = generate_oauth_state();
    let (_redirect_url, receiver) = start_openai_oauth_loopback()?;
    let mut auth_url = url::Url::parse(OPENAI_AUTHORIZE_URL).map_err(|error| error.to_string())?;
    auth_url
        .query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", OPENAI_CLIENT_ID)
        .append_pair("redirect_uri", OPENAI_REDIRECT_URL)
        .append_pair("scope", OPENAI_SCOPES)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state)
        .append_pair("id_token_add_organizations", "true")
        .append_pair("codex_cli_simplified_flow", "true")
        .append_pair("originator", OPENAI_ORIGINATOR);

    open_auth_url(auth_url.as_str())?;

    let authorization_code = receiver
        .recv_timeout(Duration::from_secs(180))
        .map_err(|_| "OpenAI OAuth timed out".to_string())?
        .map_err(|error| error.to_string())?;
    let (access_token, refresh_token, expires_at) =
        exchange_openai_code_for_tokens(&authorization_code, &code_verifier)?;
    let account_id = extract_openai_account_id(&access_token);
    let models = account_id
        .as_deref()
        .map(|account_id| fetch_openai_oauth_models(&access_token, account_id))
        .transpose()
        .unwrap_or_default()
        .unwrap_or_else(|| {
            vec![
                "gpt-5".to_string(),
                "gpt-4o".to_string(),
                "gpt-4o-mini".to_string(),
            ]
        });

    let mut providers = read_providers_from_runtime()?;
    let provider_value = serde_json::json!({
        "id": "openai",
        "name": "OpenAI",
        "apiKey": access_token.clone(),
        "baseUrl": "https://api.openai.com",
        "format": "openai",
        "models": models
            .iter()
            .map(|model_id| serde_json::json!({
                "id": model_id,
                "name": model_id,
                "enabled": true,
            }))
            .collect::<Vec<Value>>(),
        "enabled": true,
        "kind": "openai-like",
        "authMode": "oauth",
        "variant": "openai-oauth",
        "oauth": {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "expiresAt": expires_at,
            "accountId": account_id,
        },
    });
    let provider = import_provider_from_value(&provider_value)
        .ok_or_else(|| "Invalid OpenAI OAuth provider".to_string())?;

    if let Some(index) = providers.iter().position(|item| {
        item.id == provider.id
            && item.kind.as_deref() == provider.kind.as_deref()
            && item.variant.as_deref() == provider.variant.as_deref()
    }) {
        providers[index] = provider.clone();
    } else {
        providers.push(provider.clone());
    }
    let persisted = persist_providers(
        providers,
        Some(get_provider_ref(&provider)),
        provider.models.first().map(|model| model.id.clone()),
    )?;
    let persisted_provider = persisted
        .into_iter()
        .find(|item| item.id == provider.id && item.variant == provider.variant)
        .unwrap_or(provider);

    Ok(ProviderOAuthStartResult {
        ok: true,
        provider: persisted_provider,
        redirect_url: auth_url.to_string(),
    })
}

pub(crate) fn get_provider_presets() -> Vec<ProviderPreset> {
    vec![
        ProviderPreset {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
            format: "anthropic".to_string(),
            base_url: "https://api.anthropic.com".to_string(),
            kind: Some("anthropic-like".to_string()),
            auth_mode: Some("api-key".to_string()),
            variant: Some("claude-official".to_string()),
            models: vec![
                ImportedProviderModel {
                    id: "claude-opus-4-6".to_string(),
                    name: "Claude Opus 4.6".to_string(),
                    enabled: true,
                },
                ImportedProviderModel {
                    id: "claude-sonnet-4-6".to_string(),
                    name: "Claude Sonnet 4.6".to_string(),
                    enabled: true,
                },
            ],
        },
        ProviderPreset {
            id: "openai".to_string(),
            name: "OpenAI Responses".to_string(),
            format: "openai".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            kind: Some("openai-like".to_string()),
            auth_mode: Some("responses".to_string()),
            variant: Some("openai-official-responses".to_string()),
            models: vec![
                ImportedProviderModel {
                    id: "gpt-4o".to_string(),
                    name: "GPT-4o".to_string(),
                    enabled: true,
                },
                ImportedProviderModel {
                    id: "gpt-4o-mini".to_string(),
                    name: "GPT-4o Mini".to_string(),
                    enabled: true,
                },
            ],
        },
    ]
}
