use crate::state::{Achievement, GameData};
use anyhow::{anyhow, Result};
use serde_json::Value;

const V1_BASE: &str = "https://retroachievements.org/API";
const V2_BASE: &str = "https://api.retroachievements.org/v2";
const MEDIA: &str = "https://media.retroachievements.org";

pub struct RaClient {
    http: reqwest::Client,
    username: String,
    api_key: String,
}

/// Build a URL-safe badge name or URL. Handles:
///   "744502"           -> "{MEDIA}/Badge/744502.png"
///   "744502_lock"      -> "{MEDIA}/Badge/744502.png"
///   "744502.png"       -> "{MEDIA}/Badge/744502.png"
///   "744502_lock.png"  -> "{MEDIA}/Badge/744502.png"
///   "/Badge/744502_lock.png" -> "{MEDIA}/Badge/744502.png"
///   "https://..."      -> passthrough with _lock stripped
fn build_badge_url(raw: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }

    // 1. Strip "_lock" before an extension (V2 style: "xxx_lock.png")
    let step1 = if let Some(pos) = raw.find("_lock.") {
        format!("{}{}", &raw[..pos], &raw[pos + 5..])
    } else if let Some(stripped) = raw.strip_suffix("_lock") {
        stripped.to_string()
    } else {
        raw.to_string()
    };

    // 2. Already a full URL
    if step1.starts_with("http") {
        return step1;
    }
    if step1.starts_with("//") {
        return format!("https:{}", step1);
    }

    // 3. Ensure an extension exists
    let has_ext = [".png", ".jpg", ".jpeg", ".gif", ".webp"]
        .iter()
        .any(|e| step1.to_lowercase().ends_with(e));
    let with_ext = if has_ext {
        step1
    } else {
        format!("{}.png", step1)
    };

    // 4. Prepend CDN base
    if with_ext.starts_with('/') {
        format!("{}{}", MEDIA, with_ext)
    } else if with_ext.starts_with("Badge/") || with_ext.starts_with("Images/") {
        format!("{}/{}", MEDIA, with_ext)
    } else {
        format!("{}/Badge/{}", MEDIA, with_ext)
    }
}

fn json_u32(v: &Value) -> Option<u32> {
    v.as_u64()
        .and_then(|n| u32::try_from(n).ok())
        .or_else(|| v.as_str().and_then(|s| s.trim().parse::<u32>().ok()))
}

fn json_i32(v: &Value) -> Option<i32> {
    v.as_i64()
        .map(|n| n.clamp(i32::MIN as i64, i32::MAX as i64) as i32)
        .or_else(|| v.as_str().and_then(|s| s.trim().parse::<i32>().ok()))
}

fn extract_api_error(status: reqwest::StatusCode, body: &str) -> String {
    if let Ok(v) = serde_json::from_str::<Value>(body) {
        if let Some(detail) = v["errors"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|e| e["detail"].as_str().or_else(|| e["title"].as_str()))
        {
            return format!("{}: {}", status, detail);
        }
        if let Some(msg) = v["message"].as_str().or_else(|| v["error"].as_str()) {
            return format!("{}: {}", status, msg);
        }
    }
    let snippet: String = body.trim().chars().take(160).collect();
    if snippet.is_empty() {
        status.to_string()
    } else {
        format!("{}: {}", status, snippet)
    }
}

impl RaClient {
    pub fn build_http() -> reqwest::Client {
        reqwest::Client::builder()
            .user_agent(concat!("RA-OBS-Tracker-Rust/", env!("CARGO_PKG_VERSION")))
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .expect("http client")
    }

    pub fn with_http(http: reqwest::Client, username: String, api_key: String) -> Self {
        Self {
            http,
            username,
            api_key,
        }
    }

    fn v1_url(&self, endpoint: &str, extra: &[(&str, String)]) -> String {
        let mut url = format!(
            "{}/{}?u={}&y={}",
            V1_BASE,
            endpoint,
            urlencode(&self.username),
            urlencode(&self.api_key)
        );
        for (k, v) in extra {
            url.push_str(&format!("&{}={}", k, urlencode(v)));
        }
        url
    }

    async fn v1_get_json(&self, endpoint: &str, extra: &[(&str, String)]) -> Result<Value> {
        let url = self.v1_url(endpoint, extra);
        let resp = self.http.get(&url).send().await?;
        let status = resp.status();
        let body = resp.text().await?;
        if !status.is_success() {
            return Err(anyhow!("{} -> {}", endpoint, extract_api_error(status, &body)));
        }
        let val: Value = serde_json::from_str(&body)
            .map_err(|e| anyhow!("{} invalid JSON: {}", endpoint, e))?;
        if val.get("ID").is_none() {
            if let Some(msg) = val
                .as_object()
                .and_then(|o| o.get("message").or_else(|| o.get("error")))
                .and_then(|m| m.as_str())
            {
                return Err(anyhow!("{} -> {}", endpoint, msg));
            }
        }
        Ok(val)
    }

    async fn v2_get(&self, path: &str) -> Result<Value> {
        let url = format!("{}/{}", V2_BASE, path.trim_start_matches('/'));
        let resp = self
            .http
            .get(&url)
            .header("X-API-Key", &self.api_key)
            .header("Accept", "application/vnd.api+json")
            .send()
            .await?;
        let status = resp.status();
        let body = resp.text().await?;
        if !status.is_success() {
            return Err(anyhow!("RA v2 {} -> {}", path, extract_api_error(status, &body)));
        }
        serde_json::from_str(&body)
            .map_err(|e| anyhow!("RA v2 {} invalid JSON: {}", path, e))
    }

    async fn v2_collect(&self, path: &str, page_size: u32) -> Result<Vec<Value>> {
        let mut all = Vec::new();
        let mut page = 1u32;
        loop {
            let sep = if path.contains('?') { '&' } else { '?' };
            let paged = format!(
                "{}{}page%5Bsize%5D={}&page%5Bnumber%5D={}",
                path, sep, page_size, page
            );
            let resp = self.v2_get(&paged).await?;
            let items_count = resp["data"].as_array().map(|a| a.len()).unwrap_or(0);
            if let Some(arr) = resp["data"].as_array() {
                all.extend(arr.iter().cloned());
            }
            let last_page = resp["meta"]["page"]["lastPage"].as_u64().unwrap_or(0);
            if last_page > 0 && page as u64 >= last_page {
                break;
            }
            if items_count < page_size as usize {
                break;
            }
            page += 1;
            if page > 100 {
                break;
            }
        }
        Ok(all)
    }

    pub async fn recent_game_id(&self) -> Result<Option<u32>> {
        let val = self
            .v1_get_json("API_GetUserRecentlyPlayedGames.php", &[("c", "1".into())])
            .await?;
        let arr = val
            .as_array()
            .ok_or_else(|| anyhow!("Unexpected response from recent games API"))?;
        Ok(arr.first().and_then(|item| json_u32(&item["GameID"])))
    }

    pub async fn game_info(&self, game_id: u32) -> Result<GameData> {
        let v = self
            .v1_get_json(
                "API_GetGameInfoAndUserProgress.php",
                &[("g", game_id.to_string())],
            )
            .await?;

        let id = json_u32(&v["ID"]).unwrap_or(0);
        let title = v["Title"].as_str().unwrap_or("").trim().to_string();
        if id == 0 || title.is_empty() {
            return Err(anyhow!("Game {} not found", game_id));
        }

        let mut achievements: Vec<Achievement> = Vec::new();
        if let Some(map) = v["Achievements"].as_object() {
            for (_, item) in map {
                let ach_id = json_u32(&item["ID"]).unwrap_or(0);
                let ach_title = item["Title"].as_str().unwrap_or("").trim().to_string();
                if ach_title.is_empty() {
                    continue;
                }
                let description = item["Description"].as_str().unwrap_or("").to_string();
                let points = json_u32(&item["Points"]).unwrap_or(0);
                let badge_name = item["BadgeName"].as_str().unwrap_or("");
                let display_order = json_i32(&item["DisplayOrder"]).unwrap_or(i32::MAX);
                let date_softcore = item["DateEarned"].as_str().unwrap_or("").to_string();
                let date_hardcore = item["DateEarnedHardcore"].as_str().unwrap_or("").to_string();

                achievements.push(Achievement {
                    id: ach_id,
                    title: ach_title,
                    description,
                    points,
                    badge_url: build_badge_url(badge_name),
                    display_order,
                    date_earned_softcore: date_softcore,
                    date_earned_hardcore: date_hardcore,
                });
            }
        }

        let image_icon = v["ImageIcon"]
            .as_str()
            .map(normalize_media)
            .unwrap_or_default();

        Ok(GameData {
            id,
            title,
            console_name: v["ConsoleName"].as_str().unwrap_or("").to_string(),
            image_icon,
            num_achievements: json_u32(&v["NumAchievements"]).unwrap_or(achievements.len() as u32),
            num_awarded_softcore: json_u32(&v["NumAwardedToUser"]).unwrap_or(0),
            num_awarded_hardcore: json_u32(&v["NumAwardedToUserHardcore"]).unwrap_or(0),
            achievements,
        })
    }

    async fn game_meta(&self, game_id: u32) -> Result<(String, String, String)> {
        let v = self
            .v1_get_json("API_GetGame.php", &[("i", game_id.to_string())])
            .await?;
        let title = v["Title"].as_str().unwrap_or("").trim().to_string();
        if title.is_empty() {
            return Err(anyhow!("Game {} not found", game_id));
        }
        let console = v["ConsoleName"].as_str().unwrap_or("").to_string();
        let icon = v["ImageIcon"].as_str().map(normalize_media).unwrap_or_default();
        Ok((title, console, icon))
    }

    pub async fn game_info_subset(&self, game_id: u32, set_id: u32) -> Result<GameData> {
        let user_enc = urlencode(&self.username);
        let set_enc = set_id.to_string();
        let set_path = format!("achievement-sets/{}", set_id);
        let prog_path = format!(
            "users/{}/player-achievement-sets?filter%5BachievementSetId%5D={}&page%5Bsize%5D=10",
            user_enc, set_enc
        );
        let defs_path = format!(
            "achievements?filter%5BgameId%5D={}&include=achievementSet&sort=orderColumn",
            game_id
        );
        let unlocks_path = format!(
            "users/{}/player-achievements?filter%5BachievementSetId%5D={}&sort=-unlockedAt",
            user_enc, set_enc
        );

        let ((parent_title, console_name, parent_icon), set_resp, prog_resp, defs, unlocks) =
            tokio::try_join!(
                self.game_meta(game_id),
                self.v2_get(&set_path),
                self.v2_get(&prog_path),
                self.v2_collect(&defs_path, 100),
                self.v2_collect(&unlocks_path, 100),
            )?;

        let set_title = set_resp["data"]["attributes"]["title"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let set_total = json_u32(&set_resp["data"]["attributes"]["achievementsPublished"]).unwrap_or(0);
        let set_badge = set_resp["data"]["attributes"]["badgeUrl"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let prog_record = prog_resp["data"].as_array().and_then(|a| a.first());
        let earned_sc = prog_record
            .and_then(|p| json_u32(&p["attributes"]["achievementsUnlocked"]))
            .unwrap_or(0);
        let earned_hc = prog_record
            .and_then(|p| json_u32(&p["attributes"]["achievementsUnlockedHardcore"]))
            .unwrap_or(0);

        let mut achievements: Vec<Achievement> = Vec::new();
        for a in defs {
            let rel_set = json_u32(&a["relationships"]["achievementSet"]["data"]["id"]);
            if rel_set != Some(set_id) {
                continue;
            }

            let id = json_u32(&a["id"]).unwrap_or(0);
            let title = a["attributes"]["title"]
                .as_str()
                .unwrap_or("")
                .trim()
                .to_string();
            if title.is_empty() {
                continue;
            }
            let description = a["attributes"]["description"]
                .as_str()
                .unwrap_or("")
                .to_string();
            let points = json_u32(&a["attributes"]["points"]).unwrap_or(0);
            let order = json_i32(&a["attributes"]["orderColumn"]).unwrap_or(i32::MAX);

            let badge_raw = a["attributes"]["badgeUrl"]
                .as_str()
                .or_else(|| a["attributes"]["badgeLockedUrl"].as_str())
                .unwrap_or("");

            achievements.push(Achievement {
                id,
                title,
                description,
                points,
                badge_url: build_badge_url(badge_raw),
                display_order: order,
                date_earned_softcore: String::new(),
                date_earned_hardcore: String::new(),
            });
        }

        if achievements.is_empty() && set_total > 0 {
            return Err(anyhow!(
                "Subset {} has no achievements matching parent game {}",
                set_id,
                game_id
            ));
        }

        for u in unlocks {
            if let Some(ach_id) = json_u32(&u["relationships"]["achievement"]["data"]["id"]) {
                if let Some(a) = achievements.iter_mut().find(|a| a.id == ach_id) {
                    a.date_earned_softcore = u["attributes"]["unlockedAt"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    a.date_earned_hardcore = u["attributes"]["unlockedHardcoreAt"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                }
            }
        }

        let icon = if !set_badge.is_empty() {
            build_badge_url(&set_badge)
        } else {
            parent_icon
        };

        let display_title = if set_title.is_empty() {
            parent_title
        } else {
            format!("{} [{}]", parent_title, set_title)
        };

        let total = if set_total > 0 {
            set_total
        } else {
            achievements.len() as u32
        };

        Ok(GameData {
            id: game_id,
            title: display_title,
            console_name,
            image_icon: icon,
            num_achievements: total,
            num_awarded_softcore: earned_sc,
            num_awarded_hardcore: earned_hc,
            achievements,
        })
    }
}

fn normalize_media(path: &str) -> String {
    if path.is_empty() {
        return String::new();
    }
    if path.starts_with("http") {
        return path.to_string();
    }
    if path.starts_with("//") {
        return format!("https:{}", path);
    }
    if path.starts_with('/') {
        format!("{}{}", MEDIA, path)
    } else {
        format!("{}/{}", MEDIA, path)
    }
}

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn badge_urls_normalize_properly() {
        assert_eq!(build_badge_url(""), "");
        assert_eq!(
            build_badge_url("744502"),
            "https://media.retroachievements.org/Badge/744502.png"
        );
        assert_eq!(
            build_badge_url("744502_lock"),
            "https://media.retroachievements.org/Badge/744502.png"
        );
        assert_eq!(
            build_badge_url("744502_lock.png"),
            "https://media.retroachievements.org/Badge/744502.png"
        );
        assert_eq!(
            build_badge_url("/Badge/744502_lock.png"),
            "https://media.retroachievements.org/Badge/744502.png"
        );
        assert_eq!(
            build_badge_url("https://media.retroachievements.org/Images/012345.png"),
            "https://media.retroachievements.org/Images/012345.png"
        );
    }

    #[test]
    fn json_helpers_handle_numbers_and_strings() {
        assert_eq!(json_u32(&serde_json::json!(42)), Some(42));
        assert_eq!(json_u32(&serde_json::json!("42")), Some(42));
        assert_eq!(json_u32(&serde_json::json!(-1)), None);
        assert_eq!(json_i32(&serde_json::json!(-5)), Some(-5));
        assert_eq!(json_i32(&serde_json::json!("-5")), Some(-5));
    }
}
