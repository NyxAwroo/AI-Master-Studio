use scraper::{Html, Selector};
use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Serialize)]
struct LocalAiModel {
    provider: String,
    id: String,
    name: String,
    loaded: bool,
    instance_id: Option<String>,
}

#[tauri::command]
async fn fetch_page_text(url: String) -> Result<String, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "URL invalide".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Seules les URL http:// et https:// sont acceptées".to_string());
    }

    let html = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Client HTTP indisponible : {e}"))?
        .get(parsed)
        .header(reqwest::header::USER_AGENT, "AI Master Studio/3.6")
        .send()
        .await
        .map_err(|e| format!("Téléchargement impossible : {e}"))?
        .error_for_status()
        .map_err(|e| format!("Réponse HTTP invalide : {e}"))?
        .text()
        .await
        .map_err(|e| format!("Lecture HTML impossible : {e}"))?;

    let document = Html::parse_document(&html);
    let selector =
        Selector::parse("main, article, h1, h2, h3, h4, p, li, blockquote, pre, code, td, th")
            .map_err(|_| "Sélecteur HTML invalide".to_string())?;

    let mut chunks = Vec::new();
    for node in document.select(&selector) {
        let text = normalize_whitespace(&node.text().collect::<Vec<_>>().join(" "));
        if text.len() > 1 && !chunks.last().is_some_and(|last| last == &text) {
            chunks.push(text);
        }
    }

    if chunks.is_empty() {
        let body = Selector::parse("body").map_err(|_| "Sélecteur HTML invalide".to_string())?;
        for node in document.select(&body) {
            let text = normalize_whitespace(&node.text().collect::<Vec<_>>().join(" "));
            if !text.is_empty() {
                chunks.push(text);
            }
        }
    }

    let text = chunks.join("\n\n");
    if text.trim().is_empty() {
        Err("Aucun texte trouvé sur cette page".to_string())
    } else {
        Ok(text)
    }
}

#[tauri::command]
async fn local_ai_list_models(
    provider: String,
    base_url: String,
    api_token: Option<String>,
) -> Result<Vec<LocalAiModel>, String> {
    let provider = normalize_provider(&provider)?;
    let base = normalize_local_base_url(&base_url)?;
    match provider.as_str() {
        "ollama" => list_ollama_models(&base).await,
        "lmstudio" => list_lmstudio_models(&base, api_token.as_deref()).await,
        _ => Err("Fournisseur IA local inconnu".to_string()),
    }
}

#[tauri::command]
async fn local_ai_load_model(
    provider: String,
    base_url: String,
    api_token: Option<String>,
    model: String,
) -> Result<String, String> {
    let provider = normalize_provider(&provider)?;
    let base = normalize_local_base_url(&base_url)?;
    match provider.as_str() {
        "ollama" => {
            post_json(
                &format!("{base}/api/generate"),
                api_token.as_deref(),
                json!({ "model": model, "prompt": "", "keep_alive": "30m", "stream": false }),
            )
            .await?;
            Ok("loaded".to_string())
        }
        "lmstudio" => {
            let data = post_json(
                &format!("{base}/api/v1/models/load"),
                api_token.as_deref(),
                json!({ "model": model }),
            )
            .await?;
            Ok(data
                .get("instance_id")
                .and_then(Value::as_str)
                .unwrap_or("loaded")
                .to_string())
        }
        _ => Err("Fournisseur IA local inconnu".to_string()),
    }
}

#[tauri::command]
async fn local_ai_unload_model(
    provider: String,
    base_url: String,
    api_token: Option<String>,
    model: String,
    instance_id: Option<String>,
) -> Result<String, String> {
    let provider = normalize_provider(&provider)?;
    let base = normalize_local_base_url(&base_url)?;
    match provider.as_str() {
        "ollama" => {
            post_json(
                &format!("{base}/api/generate"),
                api_token.as_deref(),
                json!({ "model": model, "prompt": "", "keep_alive": 0, "stream": false }),
            )
            .await?;
            Ok("unloaded".to_string())
        }
        "lmstudio" => {
            let instance = instance_id.as_deref().unwrap_or(&model);
            post_json(
                &format!("{base}/api/v1/models/unload"),
                api_token.as_deref(),
                json!({ "instance_id": instance }),
            )
            .await?;
            Ok("unloaded".to_string())
        }
        _ => Err("Fournisseur IA local inconnu".to_string()),
    }
}

#[tauri::command]
async fn local_ai_generate(
    provider: String,
    base_url: String,
    api_token: Option<String>,
    model: String,
    system: String,
    prompt: String,
) -> Result<String, String> {
    let provider = normalize_provider(&provider)?;
    let base = normalize_local_base_url(&base_url)?;
    match provider.as_str() {
        "ollama" => {
            let data = post_json(
                &format!("{base}/api/generate"),
                api_token.as_deref(),
                json!({
                    "model": model,
                    "system": system,
                    "prompt": prompt,
                    "stream": false,
                    "format": "json",
                    "options": { "temperature": 0.2 }
                }),
            )
            .await?;
            Ok(data
                .get("response")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string())
        }
        "lmstudio" => {
            let data = post_json(
                &format!("{base}/v1/chat/completions"),
                api_token.as_deref(),
                json!({
                    "model": model,
                    "messages": [
                        { "role": "system", "content": system },
                        { "role": "user", "content": prompt }
                    ],
                    "temperature": 0.2,
                    "stream": false
                }),
            )
            .await?;
            Ok(data
                .pointer("/choices/0/message/content")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string())
        }
        _ => Err("Fournisseur IA local inconnu".to_string()),
    }
}

fn normalize_whitespace(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_provider(provider: &str) -> Result<String, String> {
    match provider.trim().to_lowercase().as_str() {
        "ollama" => Ok("ollama".to_string()),
        "lmstudio" | "lm_studio" | "lm-studio" => Ok("lmstudio".to_string()),
        _ => Err("Fournisseur IA local inconnu".to_string()),
    }
}

fn normalize_local_base_url(input: &str) -> Result<String, String> {
    let parsed =
        reqwest::Url::parse(input.trim()).map_err(|_| "URL locale invalide".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Seules les URL http:// et https:// sont acceptées".to_string());
    }
    let host = parsed.host_str().unwrap_or("");
    if !matches!(host, "localhost" | "127.0.0.1" | "::1") {
        return Err("Seules les adresses locales localhost / 127.0.0.1 sont acceptées".to_string());
    }
    let mut clean = parsed;
    clean.set_path("");
    clean.set_query(None);
    clean.set_fragment(None);
    Ok(clean.as_str().trim_end_matches('/').to_string())
}

async fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Client HTTP indisponible : {e}"))
}

async fn get_json(url: &str, api_token: Option<&str>) -> Result<Value, String> {
    let client = http_client().await?;
    let mut req = client.get(url);
    if let Some(token) = api_token.filter(|token| !token.trim().is_empty()) {
        req = req.bearer_auth(token.trim());
    }
    let response = req
        .send()
        .await
        .map_err(|e| format!("Serveur IA local indisponible : {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Lecture réponse IA locale impossible : {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "Réponse IA locale invalide : HTTP {status} - {text}"
        ));
    }
    serde_json::from_str::<Value>(&text).map_err(|e| format!("JSON IA local invalide : {e}"))
}

async fn post_json(url: &str, api_token: Option<&str>, body: Value) -> Result<Value, String> {
    let client = http_client().await?;
    let mut req = client.post(url).json(&body);
    if let Some(token) = api_token.filter(|token| !token.trim().is_empty()) {
        req = req.bearer_auth(token.trim());
    }
    let response = req
        .send()
        .await
        .map_err(|e| format!("Serveur IA local indisponible : {e}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Lecture réponse IA locale impossible : {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "Réponse IA locale invalide : HTTP {status} - {text}"
        ));
    }
    serde_json::from_str::<Value>(&text).map_err(|e| format!("JSON IA local invalide : {e}"))
}

async fn list_ollama_models(base: &str) -> Result<Vec<LocalAiModel>, String> {
    let tags = get_json(&format!("{base}/api/tags"), None).await?;
    let ps = get_json(&format!("{base}/api/ps"), None)
        .await
        .unwrap_or_else(|_| json!({ "models": [] }));
    let loaded: Vec<String> = ps
        .get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|m| {
            m.get("name")
                .or_else(|| m.get("model"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        })
        .collect();

    let models = tags
        .get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|m| {
            let id = m
                .get("name")
                .or_else(|| m.get("model"))
                .and_then(Value::as_str)?;
            Some(LocalAiModel {
                provider: "ollama".to_string(),
                id: id.to_string(),
                name: id.to_string(),
                loaded: loaded.iter().any(|x| x == id),
                instance_id: None,
            })
        })
        .collect();
    Ok(models)
}

async fn list_lmstudio_models(
    base: &str,
    api_token: Option<&str>,
) -> Result<Vec<LocalAiModel>, String> {
    let data = get_json(&format!("{base}/api/v1/models"), api_token).await?;
    let models = data
        .get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|m| m.get("type").and_then(Value::as_str) == Some("llm"))
        .filter_map(|m| {
            let id = m.get("key").and_then(Value::as_str)?;
            let instance_id = m
                .get("loaded_instances")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(|item| item.get("id"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            Some(LocalAiModel {
                provider: "lmstudio".to_string(),
                id: id.to_string(),
                name: m
                    .get("display_name")
                    .and_then(Value::as_str)
                    .unwrap_or(id)
                    .to_string(),
                loaded: instance_id.is_some(),
                instance_id,
            })
        })
        .collect();
    Ok(models)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            fetch_page_text,
            local_ai_list_models,
            local_ai_load_model,
            local_ai_unload_model,
            local_ai_generate
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
