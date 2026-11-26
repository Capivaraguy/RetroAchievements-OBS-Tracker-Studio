use serde::Serialize;
use crate::config::Aesthetics;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub id: u32,
    pub title: String,
    pub description: String,
    pub points: u32,
    pub badge_url: String,
    pub display_order: i32,
    pub date_earned_softcore: String,
    pub date_earned_hardcore: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameData {
    pub id: u32,
    pub title: String,
    pub console_name: String,
    pub image_icon: String,
    pub num_achievements: u32,
    pub num_awarded_softcore: u32,
    pub num_awarded_hardcore: u32,
    pub achievements: Vec<Achievement>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerData {
    pub game: GameData,
    pub mode: String,
    pub display_mode: String,
    pub next_achievement_count: u32,
    pub latest_achievement_count: u32,
    pub refresh_seconds: u64,
    pub aesthetics: Aesthetics,
    pub updated_at: u64,
}