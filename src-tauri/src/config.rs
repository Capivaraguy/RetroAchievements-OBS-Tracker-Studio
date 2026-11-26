use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const FONT_FAMILIES: &[&str] = &[
    "Arial, Helvetica, sans-serif",
    "Impact, sans-serif",
    "Verdana, Geneva, sans-serif",
    "Tahoma, Geneva, sans-serif",
    "Trebuchet MS, Arial, sans-serif",
    "Georgia, Times New Roman, serif",
    "Courier New, Courier, monospace",
    "Segoe UI, Arial, sans-serif",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct StyledField {
    pub enabled: bool,
    pub size: u32,
    pub color: String,
}

impl Default for StyledField {
    fn default() -> Self {
        Self { enabled: true, size: 20, color: "#ffffff".into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BorderField {
    pub enabled: bool,
    pub color: String,
}

impl Default for BorderField {
    fn default() -> Self {
        Self { enabled: true, color: "#ffffff".into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct VisibilityField {
    pub enabled: bool,
}

impl Default for VisibilityField {
    fn default() -> Self {
        Self { enabled: true }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Aesthetics {
    pub font_family: String,
    pub game_title: StyledField,
    pub console: StyledField,
    pub progress: StyledField,
    pub section_heading: StyledField,
    pub achievement_title: StyledField,
    pub achievement_points: StyledField,
    pub achievement_description: StyledField,
    pub game_icon_border: BorderField,
    pub achievement_icon_border: BorderField,
    pub game_icon: VisibilityField,
    pub achievement_icons: VisibilityField,
    pub empty_state: VisibilityField,
}

impl Default for Aesthetics {
    fn default() -> Self {
        Self {
            font_family: FONT_FAMILIES[0].into(),
            game_title: StyledField { enabled: true, size: 26, color: "#ffffff".into() },
            console: StyledField { enabled: true, size: 20, color: "#f1f1f1".into() },
            progress: StyledField { enabled: true, size: 20, color: "#ffffff".into() },
            section_heading: StyledField { enabled: true, size: 20, color: "#ffffff".into() },
            achievement_title: StyledField { enabled: true, size: 24, color: "#ffffff".into() },
            achievement_points: StyledField { enabled: true, size: 24, color: "#ffffff".into() },
            achievement_description: StyledField { enabled: true, size: 18, color: "#ededed".into() },
            game_icon_border: BorderField { enabled: true, color: "#ffffff".into() },
            achievement_icon_border: BorderField { enabled: true, color: "#ffffff".into() },
            game_icon: VisibilityField { enabled: true },
            achievement_icons: VisibilityField { enabled: true },
            empty_state: VisibilityField { enabled: true },
        }
    }
}

fn is_hex(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn clamp_styled(f: &StyledField, min: u32, max: u32) -> StyledField {
    StyledField {
        enabled: f.enabled,
        size: f.size.clamp(min, max),
        color: if is_hex(&f.color) { f.color.to_lowercase() } else { "#ffffff".into() },
    }
}

fn clamp_border(f: &BorderField) -> BorderField {
    BorderField {
        enabled: f.enabled,
        color: if is_hex(&f.color) { f.color.to_lowercase() } else { "#ffffff".into() },
    }
}

impl Aesthetics {
    pub fn normalize(&self) -> Self {
        Self {
            font_family: if FONT_FAMILIES.contains(&self.font_family.as_str()) {
                self.font_family.clone()
            } else {
                FONT_FAMILIES[0].into()
            },
            game_title: clamp_styled(&self.game_title, 14, 72),
            console: clamp_styled(&self.console, 12, 48),
            progress: clamp_styled(&self.progress, 12, 64),
            section_heading: clamp_styled(&self.section_heading, 12, 48),
            achievement_title: clamp_styled(&self.achievement_title, 14, 96),
            achievement_points: clamp_styled(&self.achievement_points, 14, 96),
            achievement_description: clamp_styled(&self.achievement_description, 12, 72),
            game_icon_border: clamp_border(&self.game_icon_border),
            achievement_icon_border: clamp_border(&self.achievement_icon_border),
            game_icon: self.game_icon.clone(),
            achievement_icons: self.achievement_icons.clone(),
            empty_state: self.empty_state.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub username: String,
    pub api_key: String,
    pub fixed_game_id: String,
    pub fixed_achievement_set_id: String,
    pub achievement_mode: String,
    pub refresh_seconds: u64,
    pub next_achievement_count: u32,
    pub latest_achievement_count: u32,
    pub overlay_width: u32,
    pub overlay_height: u32,
    pub display_mode: String,
    pub minimize_to_tray_on_close: bool,
    pub aesthetics: Aesthetics,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            username: String::new(),
            api_key: String::new(),
            fixed_game_id: String::new(),
            fixed_achievement_set_id: String::new(),
            achievement_mode: "hardcore".into(),
            refresh_seconds: 45,
            next_achievement_count: 3,
            latest_achievement_count: 3,
            overlay_width: 480,
            overlay_height: 430,
            display_mode: "latest".into(),
            minimize_to_tray_on_close: true,
            aesthetics: Aesthetics::default(),
        }
    }
}

impl Config {
    pub fn normalize(mut self) -> Self {
        if self.achievement_mode != "hardcore" && self.achievement_mode != "softcore" {
            self.achievement_mode = "hardcore".into();
        }
        if self.display_mode != "latest" && self.display_mode != "next" {
            self.display_mode = "latest".into();
        }
        self.refresh_seconds = self.refresh_seconds.clamp(15, 300);
        self.next_achievement_count = self.next_achievement_count.clamp(1, 5);
        self.latest_achievement_count = self.latest_achievement_count.clamp(1, 5);
        self.overlay_width = self.overlay_width.clamp(280, 1920);
        self.overlay_height = self.overlay_height.clamp(200, 1200);
        if self.fixed_game_id.trim().parse::<u32>().ok().filter(|&id| id > 0).is_none() {
            self.fixed_game_id.clear();
        }
        if self.fixed_game_id.is_empty()
            || self.fixed_achievement_set_id.trim().parse::<u32>().ok().filter(|&id| id > 0).is_none()
        {
            self.fixed_achievement_set_id.clear();
        }
        self.aesthetics = self.aesthetics.normalize();
        self
    }

    pub fn config_path() -> PathBuf {
        let dir = directories::ProjectDirs::from("com", "raobs", "trackerstudio")
            .map(|d| d.config_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        std::fs::create_dir_all(&dir).ok();
        dir.join("config.json")
    }

    pub fn load() -> Self {
        std::fs::read_to_string(Self::config_path())
            .ok()
            .and_then(|s| serde_json::from_str::<Self>(&s).ok())
            .map(|c| c.normalize())
            .unwrap_or_default()
    }

    pub fn save(&self) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        let path = Self::config_path();
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn public_view(&self) -> serde_json::Value {
        let mut v = serde_json::to_value(self).unwrap_or_default();
        if let Some(obj) = v.as_object_mut() {
            obj.insert("hasApiKey".into(), serde_json::json!(!self.api_key.is_empty()));
            obj.remove("apiKey");
        }
        v
    }
}

pub fn migrate_from_electron() {
    let new_path = Config::config_path();
    if new_path.exists() {
        return;
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        let old = PathBuf::from(appdata)
            .join("RetroAchievements OBS Tracker Studio")
            .join("config.json");
        if old.exists() {
            let _ = std::fs::copy(&old, &new_path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_clamps_and_clears_invalid_ids() {
        let mut cfg = Config {
            username: "alice".into(),
            api_key: "secret".into(),
            fixed_game_id: "0".into(),
            fixed_achievement_set_id: "7940".into(),
            achievement_mode: "invalid".into(),
            refresh_seconds: 5,
            next_achievement_count: 99,
            latest_achievement_count: 0,
            overlay_width: 100,
            overlay_height: 5000,
            display_mode: "bogus".into(),
            minimize_to_tray_on_close: true,
            aesthetics: Aesthetics::default(),
        };
        cfg = cfg.normalize();
        assert_eq!(cfg.achievement_mode, "hardcore");
        assert_eq!(cfg.display_mode, "latest");
        assert_eq!(cfg.refresh_seconds, 15);
        assert_eq!(cfg.next_achievement_count, 5);
        assert_eq!(cfg.latest_achievement_count, 1);
        assert_eq!(cfg.overlay_width, 280);
        assert_eq!(cfg.overlay_height, 1200);
        assert!(cfg.fixed_game_id.is_empty());
        assert!(cfg.fixed_achievement_set_id.is_empty());
    }

    #[test]
    fn public_view_redacts_api_key() {
        let cfg = Config {
            api_key: "supersecret".into(),
            ..Config::default()
        };
        let v = cfg.public_view();
        assert_eq!(v["hasApiKey"], serde_json::json!(true));
        assert!(v.get("apiKey").is_none());
    }
}