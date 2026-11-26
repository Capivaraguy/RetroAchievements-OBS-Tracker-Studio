use crate::config::{Aesthetics, Config};
use crate::state::TrackerData;
use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{Html, IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::menu::CheckMenuItem;
use tauri::{AppHandle, Wry};
use tauri_plugin_autostart::ManagerExt;
use tokio::sync::{Notify, RwLock};
use tower_http::cors::CorsLayer;

pub type SharedConfig = Arc<RwLock<Config>>;
pub type SharedData = Arc<RwLock<Option<TrackerData>>>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollStatus {
    pub config_version: u64,
    pub polled_version: u64,
    pub last_error: Option<String>,
    pub updated_at: Option<u64>,
    pub game_title: Option<String>,
}

impl Default for PollStatus {
    fn default() -> Self {
        Self {
            config_version: 1,
            polled_version: 0,
            last_error: None,
            updated_at: None,
            game_title: None,
        }
    }
}

pub struct AppControls {
    pub app_handle: RwLock<Option<AppHandle<Wry>>>,
    pub autostart_item: RwLock<Option<CheckMenuItem<Wry>>>,
    pub minimize_to_tray: AtomicBool,
}

impl AppControls {
    pub fn new(minimize_to_tray: bool) -> Self {
        Self {
            app_handle: RwLock::new(None),
            autostart_item: RwLock::new(None),
            minimize_to_tray: AtomicBool::new(minimize_to_tray),
        }
    }

    pub async fn is_autostart_enabled(&self) -> bool {
        let guard = self.app_handle.read().await;
        guard
            .as_ref()
            .and_then(|app| app.autolaunch().is_enabled().ok())
            .unwrap_or(false)
    }

    pub async fn set_autostart(&self, want: bool) -> Result<(), String> {
        let guard = self.app_handle.read().await;
        if let Some(app) = guard.as_ref() {
            let res = if want {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            };
            res.map_err(|e| format!("Could not update Windows startup setting: {}", e))?;
        }
        if let Some(item) = self.autostart_item.read().await.as_ref() {
            let _ = item.set_checked(want);
        }
        Ok(())
    }
}

pub struct Ctx {
    pub config: SharedConfig,
    pub data: SharedData,
    pub status: Arc<RwLock<PollStatus>>,
    pub repoll_notify: Arc<Notify>,
    pub controls: Arc<AppControls>,
}

pub async fn run(ctx: Arc<Ctx>) -> u16 {
    let app = Router::new()
        .route("/", get(overlay_html))
        .route("/styles.css", get(overlay_css))
        .route("/app.js", get(overlay_js))
        .route("/settings", get(settings_html))
        .route("/settings.css", get(settings_css))
        .route("/settings.js", get(settings_js))
        .route("/icon.png", get(app_icon))
        .route("/api/data", get(get_data))
        .route("/api/status", get(get_status))
        .route("/api/config", get(get_config).post(post_config))
        .route("/api/app-options", post(post_app_options))
        .layer(CorsLayer::permissive())
        .with_state(ctx);

    for port in 8765u16..8780u16 {
        match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => {
                tokio::spawn(async move {
                    if let Err(e) = axum::serve(listener, app).await {
                        eprintln!("server error: {}", e);
                    }
                });
                return port;
            }
            Err(_) => continue,
        }
    }
    eprintln!("failed to bind 8765-8779");
    0
}

fn no_store_json<T: Serialize>(code: StatusCode, body: T) -> Response {
    (code, [(header::CACHE_CONTROL, "no-store")], Json(body)).into_response()
}

async fn overlay_html() -> Html<&'static str> {
    Html(include_str!("../static/index.html"))
}
async fn overlay_css() -> impl IntoResponse {
    (
        [(axum::http::header::CONTENT_TYPE, "text/css")],
        include_str!("../static/styles.css"),
    )
}
async fn overlay_js() -> impl IntoResponse {
    (
        [(axum::http::header::CONTENT_TYPE, "application/javascript")],
        include_str!("../static/app.js"),
    )
}
async fn settings_html() -> Html<&'static str> {
    Html(include_str!("../static/settings.html"))
}
async fn settings_css() -> impl IntoResponse {
    (
        [(axum::http::header::CONTENT_TYPE, "text/css")],
        include_str!("../static/settings.css"),
    )
}
async fn settings_js() -> impl IntoResponse {
    (
        [(axum::http::header::CONTENT_TYPE, "application/javascript")],
        include_str!("../static/settings.js"),
    )
}
async fn app_icon() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/png")],
        include_bytes!("../icons/128x128.png").as_slice(),
    )
}

async fn get_data(State(ctx): State<Arc<Ctx>>) -> Response {
    let data = ctx.data.read().await.clone();
    match data {
        Some(d) => no_store_json(StatusCode::OK, d),
        None => {
            let err = ctx
                .status
                .read()
                .await
                .last_error
                .clone()
                .unwrap_or_else(|| "No data yet".to_string());
            no_store_json(
                StatusCode::SERVICE_UNAVAILABLE,
                serde_json::json!({"error": err}),
            )
        }
    }
}

async fn get_status(State(ctx): State<Arc<Ctx>>) -> Response {
    let st = ctx.status.read().await.clone();
    no_store_json(StatusCode::OK, st)
}

async fn get_config(State(ctx): State<Arc<Ctx>>) -> Response {
    let mut view = ctx.config.read().await.public_view();
    let autostart = ctx.controls.is_autostart_enabled().await;
    if let Some(obj) = view.as_object_mut() {
        obj.insert("startWithWindows".into(), serde_json::json!(autostart));
    }
    no_store_json(StatusCode::OK, view)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppOptionsPayload {
    minimize_to_tray_on_close: Option<bool>,
    start_with_windows: Option<bool>,
}

async fn post_app_options(
    State(ctx): State<Arc<Ctx>>,
    Json(payload): Json<AppOptionsPayload>,
) -> Response {
    if let Some(want_autostart) = payload.start_with_windows {
        if let Err(e) = ctx.controls.set_autostart(want_autostart).await {
            return error(StatusCode::INTERNAL_SERVER_ERROR, &e);
        }
    }

    if let Some(min_to_tray) = payload.minimize_to_tray_on_close {
        ctx.controls
            .minimize_to_tray
            .store(min_to_tray, Ordering::Relaxed);
        let mut cfg = ctx.config.write().await;
        cfg.minimize_to_tray_on_close = min_to_tray;
        if let Err(e) = cfg.save() {
            return error(StatusCode::INTERNAL_SERVER_ERROR, &e);
        }
    }

    let autostart = ctx.controls.is_autostart_enabled().await;
    let minimize_to_tray = ctx.controls.minimize_to_tray.load(Ordering::Relaxed);
    no_store_json(
        StatusCode::OK,
        serde_json::json!({
            "saved": true,
            "minimizeToTrayOnClose": minimize_to_tray,
            "startWithWindows": autostart,
        }),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigPayload {
    username: String,
    api_key: Option<String>,
    fixed_game_id: Option<String>,
    fixed_achievement_set_id: Option<String>,
    achievement_mode: String,
    refresh_seconds: Option<u64>,
    next_achievement_count: u32,
    latest_achievement_count: u32,
    overlay_width: u32,
    overlay_height: u32,
    display_mode: String,
    minimize_to_tray_on_close: Option<bool>,
    start_with_windows: Option<bool>,
    aesthetics: Aesthetics,
}

fn parse_positive_id(raw: &str) -> Option<u32> {
    raw.parse::<u32>().ok().filter(|&n| n > 0)
}

async fn post_config(
    State(ctx): State<Arc<Ctx>>,
    Json(payload): Json<ConfigPayload>,
) -> Response {
    let username = payload.username.trim().to_string();
    if username.is_empty() {
        return error(StatusCode::BAD_REQUEST, "Username is required");
    }

    let (existing_key, existing_min_tray) = {
        let cfg = ctx.config.read().await;
        (cfg.api_key.clone(), cfg.minimize_to_tray_on_close)
    };
    let api_key = match payload.api_key.as_deref() {
        Some(k) if !k.trim().is_empty() => k.trim().to_string(),
        _ => existing_key,
    };
    if api_key.is_empty() {
        return error(StatusCode::BAD_REQUEST, "API key is required");
    }

    let fixed_game_id = payload.fixed_game_id.unwrap_or_default().trim().to_string();
    if !fixed_game_id.is_empty() && parse_positive_id(&fixed_game_id).is_none() {
        return error(StatusCode::BAD_REQUEST, "Game ID must be a positive integer");
    }

    let fixed_achievement_set_id = payload
        .fixed_achievement_set_id
        .unwrap_or_default()
        .trim()
        .to_string();
    if !fixed_achievement_set_id.is_empty() {
        if parse_positive_id(&fixed_achievement_set_id).is_none() {
            return error(StatusCode::BAD_REQUEST, "Subset ID must be a positive integer");
        }
        if fixed_game_id.is_empty() {
            return error(
                StatusCode::BAD_REQUEST,
                "Parent game ID is required when selecting a subset",
            );
        }
    }

    if let Some(want_autostart) = payload.start_with_windows {
        if let Err(e) = ctx.controls.set_autostart(want_autostart).await {
            return error(StatusCode::INTERNAL_SERVER_ERROR, &e);
        }
    }

    let minimize_to_tray_on_close = payload
        .minimize_to_tray_on_close
        .unwrap_or(existing_min_tray);
    ctx.controls
        .minimize_to_tray
        .store(minimize_to_tray_on_close, Ordering::Relaxed);

    let new_cfg = Config {
        username,
        api_key,
        fixed_game_id,
        fixed_achievement_set_id,
        achievement_mode: payload.achievement_mode,
        refresh_seconds: payload.refresh_seconds.unwrap_or(45),
        next_achievement_count: payload.next_achievement_count,
        latest_achievement_count: payload.latest_achievement_count,
        overlay_width: payload.overlay_width,
        overlay_height: payload.overlay_height,
        display_mode: payload.display_mode,
        minimize_to_tray_on_close,
        aesthetics: payload.aesthetics,
    }
    .normalize();

    if let Err(e) = new_cfg.save() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, &e);
    }

    {
        let mut cfg = ctx.config.write().await;
        *cfg = new_cfg.clone();
    }

    let config_version = {
        let mut st = ctx.status.write().await;
        st.config_version += 1;
        st.config_version
    };
    ctx.repoll_notify.notify_one();

    let mut view = new_cfg.public_view();
    let autostart = ctx.controls.is_autostart_enabled().await;
    if let Some(obj) = view.as_object_mut() {
        obj.insert("startWithWindows".into(), serde_json::json!(autostart));
    }

    no_store_json(
        StatusCode::OK,
        serde_json::json!({
            "saved": true,
            "configVersion": config_version,
            "config": view,
        }),
    )
}

fn error(code: StatusCode, msg: &str) -> Response {
    no_store_json(code, serde_json::json!({"error": msg}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn positive_id_validation() {
        assert_eq!(parse_positive_id("2664"), Some(2664));
        assert_eq!(parse_positive_id("0"), None);
        assert_eq!(parse_positive_id("-5"), None);
        assert_eq!(parse_positive_id("abc"), None);
        assert_eq!(parse_positive_id(""), None);
    }
}
