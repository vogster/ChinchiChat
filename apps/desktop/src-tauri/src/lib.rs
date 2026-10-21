//! The Chinchi desktop shell: a Tauri 2 window around the web app, plus what a browser tab
//! cannot do (store, notifications, global shortcuts, autostart, the tray, updates).

use tauri::webview::{PermissionKind, PermissionResponse};

/// The webview's own permission prompt (Edge's bar over the window on Windows) is noise here:
/// the app is the only page in it, and it asks for the microphone or camera only after the
/// user pressed the button, which is the consent. Everything else keeps the platform's flow.
fn permission_response(kind: PermissionKind) -> PermissionResponse {
    match kind {
        PermissionKind::Microphone | PermissionKind::Camera => PermissionResponse::Allow,
        _ => PermissionResponse::Default,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_permission_request(|_, kind| permission_response(kind))
        .plugin(tauri_plugin_store::Builder::default().build())
        // Requests leave through Rust, so the webview's origin never meets the instance's CORS.
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_global_shortcut::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    None,
                ))?;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Chinchi");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_capture_is_allowed_without_a_prompt() {
        assert_eq!(
            permission_response(PermissionKind::Microphone),
            PermissionResponse::Allow
        );
        assert_eq!(
            permission_response(PermissionKind::Camera),
            PermissionResponse::Allow
        );
    }

    #[test]
    fn other_permissions_keep_the_platform_flow() {
        assert_eq!(
            permission_response(PermissionKind::Geolocation),
            PermissionResponse::Default
        );
        assert_eq!(
            permission_response(PermissionKind::DisplayCapture),
            PermissionResponse::Default
        );
    }
}
