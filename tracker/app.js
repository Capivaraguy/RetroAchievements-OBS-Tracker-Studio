'use strict';

const API_PATH = '/api/data';
const DEFAULT_REFRESH_SECONDS = 30;
const gameIcon = document.getElementById('game-icon');
const achievementCards = Array.from(document.querySelectorAll('.achievement-card'));

let refreshSeconds = DEFAULT_REFRESH_SECONDS;
let displayMode = 'latest';
let nextAchievementCount = 3;
let latestAchievementCount = 3;
let requestInProgress = false;
let lastRefreshAt = 0;
let configRevision = '';
let previewAestheticsOverrideActive = false;

const DEFAULT_AESTHETICS = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  gameTitle: { size: 26, color: '#ffffff' },
  console: { size: 20, color: '#f1f1f1' },
  progress: { size: 20, color: '#ffffff' },
  sectionHeading: { size: 20, color: '#ffffff' },
  achievementTitle: { size: 24, color: '#ffffff' },
  achievementPoints: { size: 24, color: '#ffffff' },
  achievementDescription: { size: 18, color: '#ededed' }
};
const DEFAULT_ICON_BORDERS = {
  gameIconBorder: { enabled: true, color: '#ffffff' },
  achievementIconBorder: { enabled: true, color: '#ffffff' }
};
const ELEMENT_VISIBILITY_DEFAULTS = {
  gameIcon: { enabled: true },
  achievementIcons: { enabled: true },
  emptyState: { enabled: true }
};
const VISIBILITY_SELECTORS = {
  gameTitle: '.game-title',
  console: '.console',
  progress: '.progress',
  sectionHeading: '.unlocks-heading',
  achievementTitle: '.achievement-title',
  achievementPoints: '.achievement-points',
  achievementDescription: '.achievement-description-clip',
  gameIcon: '#game-icon',
  achievementIcons: '.badge',
  emptyState: '#empty-state'
};
const ALLOWED_FONT_FAMILIES = [
  'Arial, Helvetica, sans-serif',
  'Impact, sans-serif',
  'Verdana, Geneva, sans-serif',
  'Tahoma, Geneva, sans-serif',
  'Trebuchet MS, Arial, sans-serif',
  'Georgia, Times New Roman, serif',
  'Courier New, Courier, monospace',
  'Segoe UI, Arial, sans-serif'
];

function normalizeAesthetics(input = {}) {
  const result = {
    fontFamily: ALLOWED_FONT_FAMILIES.includes(input.fontFamily) ? input.fontFamily : DEFAULT_AESTHETICS.fontFamily
  };
  for (const key of Object.keys(DEFAULT_AESTHETICS)) {
    if (key === 'fontFamily') continue;
    const saved = input[key] || {};
    const fallback = DEFAULT_AESTHETICS[key];
    const size = Number(saved.size);
    result[key] = {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : true,
      size: Number.isInteger(size) && size >= 8 && size <= 96 ? size : fallback.size,
      color: /^#[0-9a-f]{6}$/i.test(String(saved.color || '')) ? String(saved.color).toLowerCase() : fallback.color
    };
  }
  for (const [key, fallback] of Object.entries(ELEMENT_VISIBILITY_DEFAULTS)) {
    const saved = input[key] || {};
    result[key] = { enabled: typeof saved.enabled === 'boolean' ? saved.enabled : fallback.enabled };
  }
  for (const [key, fallback] of Object.entries(DEFAULT_ICON_BORDERS)) {
    const saved = input[key] || {};
    result[key] = {
      enabled: typeof saved.enabled === 'boolean' ? saved.enabled : fallback.enabled,
      color: /^#[0-9a-f]{6}$/i.test(String(saved.color || '')) ? String(saved.color).toLowerCase() : fallback.color
    };
  }
  return result;
}

function fitAchievementDescription(card) {
  if (!card || card.hidden) return;
  const copy = card.querySelector('.achievement-copy');
  const titleRow = card.querySelector('.achievement-title-row');
  const clip = card.querySelector('.achievement-description-clip');
  const description = card.querySelector('.achievement-description');
  if (!copy || !titleRow || !clip || !description) return;

  if (!description.textContent.trim()) {
    clip.hidden = true;
    clip.style.height = '0px';
    return;
  }

  const copyHeight = copy.getBoundingClientRect().height;
  const titleHeight = titleRow.getBoundingClientRect().height;
  const copyStyle = getComputedStyle(copy);
  const clipStyle = getComputedStyle(clip);
  const descriptionStyle = getComputedStyle(description);
  const gap = Number.parseFloat(copyStyle.rowGap) || 0;
  const lineHeight = Number.parseFloat(descriptionStyle.lineHeight);
  const paddingTop = Number.parseFloat(clipStyle.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(clipStyle.paddingBottom) || 0;

  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;

  // The clipping wrapper has an explicit pixel height calculated from whole
  // line boxes. The inner text keeps a two-line clamp for an ellipsis, while
  // the outer overflow clip is a hard guard against Chromium painting even a
  // few pixels of a third line below the clamp boundary.
  const availableHeight = Math.max(0, copyHeight - titleHeight - gap);
  const availableTextHeight = Math.max(0, availableHeight - paddingTop - paddingBottom);
  const completeLines = Math.min(2, Math.floor((availableTextHeight + 0.01) / lineHeight));

  if (completeLines < 1) {
    clip.hidden = true;
    clip.style.height = '0px';
    return;
  }

  const clipHeight = paddingTop + paddingBottom + completeLines * lineHeight;
  clip.hidden = false;
  clip.style.height = `${clipHeight.toFixed(3)}px`;
}

function scheduleDescriptionFit() {
  window.requestAnimationFrame(() => {
    achievementCards.forEach(fitAchievementDescription);
  });
}

function applyAesthetics(input = {}) {
  const aesthetics = normalizeAesthetics(input);
  const root = document.documentElement;
  root.style.setProperty('--ra-font-family', aesthetics.fontFamily);
  for (const [key, values] of Object.entries(aesthetics)) {
    if (key === 'fontFamily') continue;
    if (key in DEFAULT_ICON_BORDERS) {
      root.style.setProperty(`--ra-${key}-color`, values.enabled ? values.color : 'transparent');
      continue;
    }
    if (key in DEFAULT_AESTHETICS) {
      root.style.setProperty(`--ra-${key}-size`, `${values.size}px`);
      root.style.setProperty(`--ra-${key}-color`, values.color);
    }
  }

  for (const [key, selector] of Object.entries(VISIBILITY_SELECTORS)) {
    const enabled = aesthetics[key]?.enabled !== false;
    document.querySelectorAll(selector).forEach((element) => {
      element.classList.toggle('aesthetic-hidden', !enabled);
    });
  }

  const gameTitleVisible = aesthetics.gameTitle.enabled !== false;
  const consoleVisible = aesthetics.console.enabled !== false;
  const progressVisible = aesthetics.progress.enabled !== false;
  const gameIconVisible = aesthetics.gameIcon.enabled !== false;
  const gameHeader = document.querySelector('.game-header');
  const gameInfo = document.querySelector('.game-info');
  const gameMeta = document.querySelector('.game-meta');
  gameHeader.classList.toggle('without-game-icon', !gameIconVisible);
  gameHeader.classList.toggle('is-empty', !gameIconVisible && !gameTitleVisible && !consoleVisible && !progressVisible);
  gameInfo.classList.toggle('no-visible-content', !gameTitleVisible && !consoleVisible && !progressVisible);
  gameMeta.classList.toggle('no-visible-content', !consoleVisible && !progressVisible);

  const headingVisible = aesthetics.sectionHeading.enabled !== false;
  document.querySelector('.unlocks').classList.toggle('without-heading', !headingVisible);
  const badgeVisible = aesthetics.achievementIcons.enabled !== false;
  achievementCards.forEach((card) => {
    card.classList.toggle('without-badge', !badgeVisible);
    const titleVisible = aesthetics.achievementTitle.enabled !== false;
    const pointsVisible = aesthetics.achievementPoints.enabled !== false;
    card.querySelector('.achievement-title-row')?.classList.toggle('no-visible-content', !titleVisible && !pointsVisible);
  });
  scheduleDescriptionFit();
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent) return;
  if (event.data?.type !== 'ra-overlay-aesthetics-preview') return;
  previewAestheticsOverrideActive = true;
  applyAesthetics(event.data.aesthetics || {});
});

function earnedDate(achievement, mode) {
  return mode === 'softcore'
    ? (achievement.DateEarned || '')
    : (achievement.DateEarnedHardcore || '');
}

function latestAchievements(game, mode, count) {
  return Object.values(game.Achievements || {})
    .map((achievement) => ({
      title: String(achievement.Title || '').trim(),
      points: achievement.Points ?? achievement.points ?? null,
      description: String(achievement.Description || '').trim(),
      badgeName: String(achievement.BadgeName || '').trim(),
      badgeUrl: String(achievement.BadgeUrl || '').trim(),
      earnedAt: earnedDate(achievement, mode)
    }))
    .filter((achievement) => achievement.earnedAt && (achievement.badgeUrl || achievement.badgeName) && achievement.title)
    .sort((a, b) => String(b.earnedAt).localeCompare(String(a.earnedAt)))
    .slice(0, count);
}

function nextAchievements(game, mode, count) {
  return Object.values(game.Achievements || {})
    .map((achievement) => ({
      id: Number(achievement.ID) || 0,
      displayOrder: Number.isFinite(Number(achievement.DisplayOrder))
        ? Number(achievement.DisplayOrder)
        : Number.MAX_SAFE_INTEGER,
      title: String(achievement.Title || '').trim(),
      points: achievement.Points ?? achievement.points ?? null,
      description: String(achievement.Description || '').trim(),
      badgeName: String(achievement.BadgeName || '').trim(),
      badgeUrl: String(achievement.BadgeUrl || '').trim(),
      earnedAt: earnedDate(achievement, mode)
    }))
    .filter((achievement) => !achievement.earnedAt && achievement.title && (achievement.badgeUrl || achievement.badgeName))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
    .slice(0, count);
}

function normalizeImageUrl(value) {
  let source = String(value || '').trim();
  if (!source) return '';
  // Always show the colored achievement badge, even if the API supplies
  // the default locked image URL (for example: 744502_lock.png).
  source = source.replace(/_lock(?=\.[a-z0-9]+(?:[?#].*)?$)/i, '');
  if (/^https?:\/\//i.test(source)) return source;
  if (source.startsWith('//')) return `https:${source}`;
  if (source.startsWith('/')) return `https://retroachievements.org${source}`;
  return `https://retroachievements.org/${source.replace(/^\/+/, '')}`;
}

function setGameIcon(game) {
  const candidates = [game.ImageIcon, game.ParentImageIcon]
    .map(normalizeImageUrl)
    .filter((url, index, all) => url && all.indexOf(url) === index);
  const sourceKey = candidates.join('|');
  if (gameIcon.dataset.sourceKey === sourceKey) return;

  gameIcon.dataset.sourceKey = sourceKey;
  gameIcon.hidden = true;
  gameIcon.removeAttribute('src');
  if (candidates.length === 0) return;

  let candidateIndex = 0;
  const tryNext = () => {
    if (candidateIndex >= candidates.length) {
      gameIcon.hidden = true;
      gameIcon.removeAttribute('src');
      return;
    }
    const nextUrl = candidates[candidateIndex++];
    gameIcon.onload = () => { gameIcon.hidden = false; };
    gameIcon.onerror = tryNext;
    gameIcon.src = nextUrl;
  };
  tryNext();
}

function setText(id, value, fallback = '') {
  const element = document.getElementById(id);
  element.textContent = value || fallback;
}

function renderAchievement(card, achievement) {
  const image = card.querySelector('.badge');
  const title = card.querySelector('.achievement-title');
  const points = card.querySelector('.achievement-points');
  const description = card.querySelector('.achievement-description');
  const descriptionClip = card.querySelector('.achievement-description-clip');

  if (!achievement) {
    image.removeAttribute('src');
    title.textContent = '';
    points.textContent = '';
    description.textContent = '';
    descriptionClip.hidden = true;
    descriptionClip.style.height = '0px';
    card.hidden = true;
    return;
  }

  const unlockedBadgeName = String(achievement.badgeName || '').replace(/_lock$/i, '');
  const imageUrl = normalizeImageUrl(achievement.badgeUrl) ||
    `https://retroachievements.org/Badge/${encodeURIComponent(unlockedBadgeName)}.png`;
  image.onerror = () => {
    image.removeAttribute('src');
    image.alt = '';
  };
  if (image.getAttribute('src') !== imageUrl) image.setAttribute('src', imageUrl);

  title.textContent = achievement.title;
  const pointValue = achievement.points === null || achievement.points === undefined || achievement.points === ''
    ? null
    : Number(achievement.points);
  points.textContent = Number.isFinite(pointValue) && pointValue >= 0 ? String(pointValue) : '';
  description.textContent = achievement.description;
  descriptionClip.hidden = !String(achievement.description || '').trim();
  descriptionClip.style.height = '';
  card.hidden = false;
}

function render(data) {
  const game = data.game || {};
  if (data.aesthetics && !previewAestheticsOverrideActive) applyAesthetics(data.aesthetics);
  const mode = data.mode === 'softcore' ? 'softcore' : 'hardcore';
  displayMode = data.displayMode === 'next' ? 'next' : 'latest';
  nextAchievementCount = Math.max(1, Math.min(5, Number(data.nextAchievementCount) || 3));
  latestAchievementCount = Math.max(1, Math.min(5, Number(data.latestAchievementCount) || 3));

  const displayTitle = game.AchievementSetTitle
    ? `${game.Title || 'Unknown game'} [${game.AchievementSetTitle}]`
    : game.Title;

  setGameIcon(game);
  setText('game-title', displayTitle, 'Unknown game');
  setText('console', game.ConsoleName, 'Unknown console');

  const total = Number(game.NumAchievements) || 0;
  const earned = mode === 'softcore'
    ? (Number(game.NumAwardedToUser) || 0)
    : (Number(game.NumAwardedToUserHardcore) || 0);
  const percentage = total > 0 ? (earned / total) * 100 : 0;
  setText('progress', `${earned} / ${total}  ·  ${percentage.toFixed(1)}%`, '— / —');

  const heading = document.getElementById('unlocks-heading');
  heading.textContent = displayMode === 'next'
    ? 'Next Achievements to Unlock'
    : 'Latest Achievements Unlocked';

  const achievements = displayMode === 'next'
    ? nextAchievements(game, mode, nextAchievementCount)
    : latestAchievements(game, mode, latestAchievementCount);
  const achievementList = document.getElementById('achievement-list');
  achievementList.hidden = achievements.length === 0;
  achievementList.style.setProperty(
    '--visible-achievements', String(Math.max(1, achievements.length))
  );
  achievementCards.forEach((card, index) => renderAchievement(card, achievements[index]));

  const empty = document.getElementById('empty-state');
  if (displayMode === 'next' && total > 0 && earned >= total) {
    empty.textContent = 'All achievements unlocked';
    empty.hidden = false;
  } else if (achievements.length === 0) {
    empty.textContent = displayMode === 'next'
      ? 'No locked achievements found'
      : 'No achievements unlocked yet';
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }

  scheduleDescriptionFit();
}

// Browser Source resizing changes the available height for each achievement.
// Observe the cards so the description is recalculated for the new dimensions.
if ('ResizeObserver' in window) {
  const achievementResizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => fitAchievementDescription(entry.target));
  });
  achievementCards.forEach((card) => achievementResizeObserver.observe(card));
}

async function loadConfiguration() {
  try {
    const previousRevision = configRevision;
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) return;
    const config = await response.json();
    if (config.aesthetics && !previewAestheticsOverrideActive) applyAesthetics(config.aesthetics);
    configRevision = String(config.configRevision || '');
    const candidate = Number(config.refreshSeconds);
    if (Number.isFinite(candidate)) refreshSeconds = Math.max(15, Math.min(300, candidate));
    displayMode = config.displayMode === 'next' ? 'next' : 'latest';
    const count = Number(config.nextAchievementCount);
    if (Number.isFinite(count)) nextAchievementCount = Math.max(1, Math.min(5, Math.trunc(count)));
    const latestCount = Number(config.latestAchievementCount);
    if (Number.isFinite(latestCount)) latestAchievementCount = Math.max(1, Math.min(5, Math.trunc(latestCount)));
    if (lastRefreshAt > 0 && previousRevision && configRevision && previousRevision !== configRevision) refresh();
  } catch (_error) {
    // Keep defaults if the optional configuration request fails.
  }
}

async function refresh() {
  if (requestInProgress) return;
  requestInProgress = true;
  try {
    const response = await fetch(API_PATH, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    if (!data.game) throw new Error('No game data was returned by RetroAchievements.');
    render(data);
  } catch (error) {
    console.error('[RA OBS Tracker]', error.message || error);
    const empty = document.getElementById('empty-state');
    empty.textContent = error.message || 'Waiting for RetroAchievements configuration';
    empty.hidden = false;
  } finally {
    requestInProgress = false;
    lastRefreshAt = Date.now();
  }
}

(async function start() {
  await loadConfiguration();
  await refresh();
  // Check local settings periodically so mode and refresh changes apply without reloading OBS.
  window.setInterval(async () => {
    await loadConfiguration();
    if (Date.now() - lastRefreshAt >= refreshSeconds * 1000) refresh();
  }, 5000);
})();
