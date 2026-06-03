use crate::models::Paste;
use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::Client;

const LOGIN_URL: &str = "https://pastebin.com/api/api_login.php";
const POST_URL: &str = "https://pastebin.com/api/api_post.php";
const RAW_URL: &str = "https://pastebin.com/api/api_raw.php";

/// Pastebin replies to errors with a plain-text body. Treat those as `Err`.
fn check_api_error(body: &str) -> Result<String, String> {
    let trimmed = body.trim();
    if trimmed.starts_with("Bad API request") || trimmed.starts_with("Post limit") {
        Err(trimmed.to_string())
    } else if trimmed.is_empty() {
        Err("Empty response from Pastebin".to_string())
    } else {
        Ok(trimmed.to_string())
    }
}

async fn post_form(client: &Client, url: &str, params: &[(&str, &str)]) -> Result<String, String> {
    let resp = client
        .post(url)
        .form(params)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;
    Ok(body)
}

/// Exchange dev key + credentials for a user session key.
pub async fn login(
    client: &Client,
    dev_key: &str,
    user: &str,
    pass: &str,
) -> Result<String, String> {
    let body = post_form(
        client,
        LOGIN_URL,
        &[
            ("api_dev_key", dev_key),
            ("api_user_name", user),
            ("api_user_password", pass),
        ],
    )
    .await?;
    check_api_error(&body)
}

/// Create a paste. `user_key` may be empty for a guest paste.
#[allow(clippy::too_many_arguments)]
pub async fn create_paste(
    client: &Client,
    dev_key: &str,
    user_key: &str,
    title: &str,
    code: &str,
    format: &str,
    private: &str,
    expire: &str,
) -> Result<String, String> {
    let mut params: Vec<(&str, &str)> = vec![
        ("api_dev_key", dev_key),
        ("api_option", "paste"),
        ("api_paste_code", code),
        ("api_paste_name", title),
        ("api_paste_format", format),
        ("api_paste_private", private),
        ("api_paste_expire_date", expire),
    ];
    if !user_key.is_empty() {
        params.push(("api_user_key", user_key));
    }
    let body = post_form(client, POST_URL, &params).await?;
    check_api_error(&body)
}

/// List the authenticated user's pastes.
pub async fn list_pastes(
    client: &Client,
    dev_key: &str,
    user_key: &str,
    limit: u32,
) -> Result<Vec<Paste>, String> {
    let limit_str = limit.to_string();
    let body = post_form(
        client,
        POST_URL,
        &[
            ("api_dev_key", dev_key),
            ("api_user_key", user_key),
            ("api_option", "list"),
            ("api_results_limit", &limit_str),
        ],
    )
    .await?;

    let trimmed = body.trim();
    if trimmed.starts_with("Bad API request") {
        return Err(trimmed.to_string());
    }
    // "No pastes found." is a valid empty result.
    if trimmed.is_empty() || trimmed.starts_with("No pastes found") {
        return Ok(vec![]);
    }
    parse_paste_list(trimmed)
}

fn parse_paste_list(xml: &str) -> Result<Vec<Paste>, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut pastes: Vec<Paste> = Vec::new();
    let mut current: Option<Paste> = None;
    let mut tag = String::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "paste" {
                    current = Some(Paste::default());
                }
                tag = name;
            }
            Ok(Event::Text(e)) => {
                let text = e.unescape().map_err(|err| err.to_string())?.to_string();
                if let Some(p) = current.as_mut() {
                    match tag.as_str() {
                        "paste_key" => p.key = text,
                        "paste_title" => p.title = text,
                        "paste_format_short" => p.format = text,
                        "paste_date" => p.date = text,
                        "paste_expire_date" => p.expire = text,
                        "paste_url" => p.url = text,
                        "paste_size" => p.size = text,
                        "paste_private" => p.private = text,
                        "paste_hits" => p.hits = text,
                        _ => {}
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if name == "paste" {
                    if let Some(p) = current.take() {
                        pastes.push(p);
                    }
                }
                tag.clear();
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }
    Ok(pastes)
}

/// Delete one of the user's pastes.
pub async fn delete_paste(
    client: &Client,
    dev_key: &str,
    user_key: &str,
    paste_key: &str,
) -> Result<String, String> {
    let body = post_form(
        client,
        POST_URL,
        &[
            ("api_dev_key", dev_key),
            ("api_user_key", user_key),
            ("api_option", "delete"),
            ("api_paste_key", paste_key),
        ],
    )
    .await?;
    check_api_error(&body)
}

/// Fetch the raw text of one of the user's pastes.
pub async fn view_raw(
    client: &Client,
    dev_key: &str,
    user_key: &str,
    paste_key: &str,
) -> Result<String, String> {
    let body = post_form(
        client,
        RAW_URL,
        &[
            ("api_dev_key", dev_key),
            ("api_user_key", user_key),
            ("api_option", "show_paste"),
            ("api_paste_key", paste_key),
        ],
    )
    .await?;
    let trimmed = body.trim_start();
    if trimmed.starts_with("Bad API request") {
        return Err(trimmed.trim().to_string());
    }
    Ok(body)
}
