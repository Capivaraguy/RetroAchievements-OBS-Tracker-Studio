#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod ra_client;
mod server;
mod state;

use config::{migrate_from_electron, Config};
use ra_client::RaClient;
use server::{AppControls, PollStatus};
use state::TrackerData;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::ManagerExt;
use tokio::sync::{Notify, RwLock};

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn open_in_browser(url: &url::Url) {
    if url.scheme() != "http" && url.scheme() != "https" {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .arg(url.as_str())
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg(url.as_str())
            .spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(url.as_str())
            .spawn();
    }
}

fn main() {
    migrate_from_electron();

    let loaded_cfg = Config::load();
    let controls = Arc::new(AppControls::new(loaded_cfg.minimize_to_tray_on_close));
    let config: server::SharedConfig = Arc::new(RwLock::new(loaded_cfg));
    let data: server::SharedData = Arc::new(RwLock::new(None));
    let status: Arc<RwLock<PollStatus>> = Arc::new(RwLock::new(PollStatus::default()));
    let repoll_notify = Arc::new(Notify::new());

    let ctx = Arc::new(server::Ctx {
        config: config.clone(),
        data: data.clone(),
        status: status.clone(),
        repoll_notify: repoll_notify.clone(),
        controls: controls.clone(),
    });

    let close_controls = controls.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(move |app| {
            let handle = app.handle().clone();
            let server_ctx = ctx.clone();
            let poll_cfg = config.clone();
            let poll_data = data.clone();
            let poll_status = status.clone();
            let poll_notify = repoll_notify.clone();
            let setup_controls = controls.clone();
            let start_minimized = std::env::args().any(|a| a == "--minimized");

            let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let autostart_item = CheckMenuItem::with_id(
                app,
                "autostart",
                "Start with Windows (minimized)",
                true,
                autostart_enabled,
                None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &autostart_item, &quit_item])?;

            let autostart_ref = autostart_item.clone();
            let handle_for_controls = handle.clone();
            let autostart_for_controls = autostart_item.clone();
            tauri::async_runtime::spawn(async move {
                *setup_controls.app_handle.write().await = Some(handle_for_controls);
                *setup_controls.autostart_item.write().await = Some(autostart_for_controls);

                let port = server::run(server_ctx).await;
                if port == 0 {
                    eprintln!("local server failed to bind 8765-8779; exiting");
                    handle.exit(1);
                    return;
                }

                tokio::spawn(poll_loop(
                    poll_cfg,
                    poll_data,
                    poll_status,
                    poll_notify,
                ));

                match url::Url::parse(&format!("http://127.0.0.1:{}/settings", port)) {
                    Ok(u) => {
                        let built = WebviewWindowBuilder::new(
                            &handle,
                            "main",
                            WebviewUrl::External(u),
                        )
                        .title("RetroAchievements OBS Tracker Studio")
                        .inner_size(1180.0, 900.0)
                        .min_inner_size(900.0, 650.0)
                        .visible(!start_minimized)
                        .on_new_window(|url, _features| {
                            open_in_browser(&url);
                            NewWindowResponse::Deny
                        })
                        .build();
                        if let Err(e) = built {
                            eprintln!("failed to create window: {}", e);
                            handle.exit(1);
                        }
                    }
                    Err(e) => {
                        eprintln!("url parse: {}", e);
                        handle.exit(1);
                    }
                }
            });

            let mut tray = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .tooltip("RetroAchievements OBS Tracker Studio")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "autostart" => {
                        let want = autostart_ref.is_checked().unwrap_or(false);
                        let res = if want {
                            app.autolaunch().enable()
                        } else {
                            app.autolaunch().disable()
                        };
                        if let Err(e) = res {
                            eprintln!("autostart toggle failed: {}", e);
                            let _ = autostart_ref.set_checked(!want);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            Ok(())
        })
        .on_window_event(move |window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if close_controls.minimize_to_tray.load(Ordering::Relaxed) {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn poll_loop(
    config: server::SharedConfig,
    data: server::SharedData,
    status: Arc<RwLock<PollStatus>>,
    repoll_notify: Arc<Notify>,
) {
    let http = RaClient::build_http();

    loop {
        let ver = status.read().await.config_version;
        let cfg = config.read().await.clone();

        let outcome: Result<(TrackerData, String), String> =
            if cfg.username.is_empty() || cfg.api_key.is_empty() {
                Err("Not configured: enter username and API key".to_string())
            } else {
                let client =
                    RaClient::with_http(http.clone(), cfg.username.clone(), cfg.api_key.clone());

                let game_id_res: Result<u32, String> = if !cfg.fixed_game_id.is_empty() {
                    cfg.fixed_game_id
                        .parse::<u32>()
                        .ok()
                        .filter(|&id| id > 0)
                        .ok_or_else(|| format!("Invalid game ID: {}", cfg.fixed_game_id))
                } else {
                    match client.recent_game_id().await {
                        Ok(Some(id)) => Ok(id),
                        Ok(None) => Err(
                            "No recently played games found. Play a game or set a fixed game ID."
                                .to_string(),
                        ),
                        Err(e) => Err(format!("Recently-played API: {}", e)),
                    }
                };

                match game_id_res {
                    Err(e) => Err(e),
                    Ok(gid) => {
                        let result = if !cfg.fixed_achievement_set_id.is_empty() {
                            match cfg
                                .fixed_achievement_set_id
                                .parse::<u32>()
                                .ok()
                                .filter(|&id| id > 0)
                            {
                                Some(sid) => client.game_info_subset(gid, sid).await,
                                None => Err(anyhow::anyhow!(
                                    "Invalid subset ID: {}",
                                    cfg.fixed_achievement_set_id
                                )),
                            }
                        } else {
                            client.game_info(gid).await
                        };

                        match result {
                            Ok(game) => {
                                let title = game.title.clone();
                                let td = TrackerData {
                                    game,
                                    mode: cfg.achievement_mode.clone(),
                                    display_mode: cfg.display_mode.clone(),
                                    next_achievement_count: cfg.next_achievement_count,
                                    latest_achievement_count: cfg.latest_achievement_count,
                                    refresh_seconds: cfg.refresh_seconds,
                                    aesthetics: cfg.aesthetics.clone(),
                                    updated_at: now_millis(),
                                };
                                Ok((td, title))
                            }
                            Err(e) => {
                                eprintln!("game info: {}", e);
                                Err(format!("Game fetch failed: {}", e))
                            }
                        }
                    }
                }
            };

        match outcome {
            Ok((td, title)) => {
                let ts = td.updated_at;
                *data.write().await = Some(td);
                let mut st = status.write().await;
                st.polled_version = ver;
                st.last_error = None;
                st.updated_at = Some(ts);
                st.game_title = Some(title);
            }
            Err(err_msg) => {
                let mut st = status.write().await;
                st.polled_version = ver;
                st.last_error = Some(err_msg);
            }
        }

        let interval = cfg.refresh_seconds.clamp(15, 300);
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(interval)) => {},
            _ = repoll_notify.notified() => {},
        }
    }
}
