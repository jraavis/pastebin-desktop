#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod api;
mod models;

use models::Paste;
use reqwest::Client;
use tauri::menu::{Menu, PredefinedMenuItem, Submenu};

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
        .user_agent("pastedesk/0.1")
        .build()
        .expect("failed to build HTTP client");

    tauri::Builder::default()
        .menu(|handle| {
            // Custom menu: keep standard Edit/Window items so Cmd+C/V/X/A work,
            // but omit "Close Window" so Cmd+W has no accelerator and does nothing.
            let app_menu = Submenu::with_items(
                handle,
                "PasteDesk",
                true,
                &[
                    &PredefinedMenuItem::about(handle, None, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::services(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::show_all(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;

            let edit_menu = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;

            let window_menu = Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &PredefinedMenuItem::maximize(handle, None)?,
                    &PredefinedMenuItem::fullscreen(handle, None)?,
                ],
            )?;

            Menu::with_items(handle, &[&app_menu, &edit_menu, &window_menu])
        })
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
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
