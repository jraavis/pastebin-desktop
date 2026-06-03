#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod api;
mod models;

use models::Paste;
use reqwest::Client;

/// Shared HTTP client kept in Tauri's managed state.
struct AppState {
    client: Client,
}

#[tauri::command]
async fn login(
    state: tauri::State<'_, AppState>,
    dev_key: String,
    username: String,
    password: String,
) -> Result<String, String> {
    api::login(&state.client, &dev_key, &username, &password).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn create_paste(
    state: tauri::State<'_, AppState>,
    dev_key: String,
    user_key: String,
    title: String,
    code: String,
    format: String,
    private: String,
    expire: String,
) -> Result<String, String> {
    if dev_key.trim().is_empty() {
        return Err("Missing API dev key — set it in Settings.".to_string());
    }
    if code.trim().is_empty() {
        return Err("Paste content is empty.".to_string());
    }
    api::create_paste(
        &state.client,
        &dev_key,
        &user_key,
        &title,
        &code,
        &format,
        &private,
        &expire,
    )
    .await
}

#[tauri::command]
async fn list_pastes(
    state: tauri::State<'_, AppState>,
    dev_key: String,
    user_key: String,
    limit: u32,
) -> Result<Vec<Paste>, String> {
    if user_key.trim().is_empty() {
        return Err("Not logged in — log in from Settings to view your pastes.".to_string());
    }
    api::list_pastes(&state.client, &dev_key, &user_key, limit).await
}

#[tauri::command]
async fn delete_paste(
    state: tauri::State<'_, AppState>,
    dev_key: String,
    user_key: String,
    paste_key: String,
) -> Result<String, String> {
    api::delete_paste(&state.client, &dev_key, &user_key, &paste_key).await
}

#[tauri::command]
async fn view_raw(
    state: tauri::State<'_, AppState>,
    dev_key: String,
    user_key: String,
    paste_key: String,
) -> Result<String, String> {
    api::view_raw(&state.client, &dev_key, &user_key, &paste_key).await
}

fn main() {
    let client = Client::builder()
        .user_agent("pastebin-gui/0.1")
        .build()
        .expect("failed to build HTTP client");

    tauri::Builder::default()
        .manage(AppState { client })
        .invoke_handler(tauri::generate_handler![
            login,
            create_paste,
            list_pastes,
            delete_paste,
            view_raw
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
