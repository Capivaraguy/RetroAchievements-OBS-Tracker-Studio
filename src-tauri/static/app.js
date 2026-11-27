'use strict';
if (new URLSearchParams(location.search).has('preview')) {
  document.documentElement.classList.add('preview');
}

const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  gameTitle:              { enabled: true, size: 26, color: '#ffffff' },
  console:                { enabled: true, size: 20, color: '#f1f1f1' },
  progress:               { enabled: true, size: 20, color: '#ffffff' },
  sectionHeading:         { enabled: true, size: 20, color: '#ffffff' },
  achievementTitle:       { enabled: true, size: 24, color: '#ffffff' },
  achievementPoints:      { enabled: true, size: 24, color: '#ffffff' },
  achievementDescription: { enabled: true, size: 18, color: '#ededed' },
  gameIconBorder:         { enabled: true, color: '#ffffff' },
  achievementIconBorder:  { enabled: true, color: '#ffffff' },
  gameIcon:               { enabled: true },
  achievementIcons:       { enabled: true },
  emptyState:             { enabled: true },
};

const state = {
  data: null,
  override: null,
  previewOptions: null,
  aesthetics: null,
  refreshSeconds: 45,
  timer: null,
};

const cards = [];
for (let i = 0; i < 5; i++) {
  const c = document.createElement('article');
  c.className = 'achievement-card';
  c.hidden = true;
  c.innerHTML = `
    <img class="badge" alt="">
    <div class="achievement-copy">
      <div class="achievement-title-row">
        <div class="achievement-title"></div>
        <div class="achievement-points"></div>
      </div>
      <div class="achievement-description"></div>
    </div>
  `;
  cards.push(c);
  $('achievement-list').appendChild(c);
}

function mergeAesthetics(input) {
  const out = { fontFamily: input.fontFamily || DEFAULTS.fontFamily };
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'fontFamily') continue;
    out[key] = { ...DEFAULTS[key], ...(input[key] || {}) };
  }
  return out;
}

function fitFontSize(el, baseSize, minSize, fitsFn) {
  el.style.fontSize = `${baseSize}px`;
  if (fitsFn()) return baseSize;
  let lo = Math.min(minSize, baseSize);
  let hi = baseSize;
  let best = lo;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    el.style.fontSize = `${mid}px`;
    if (fitsFn()) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  el.style.fontSize = `${best}px`;
  return best;
}

function resetCardLayout(card, a) {
  const titleEl = card.querySelector('.achievement-title');
  const pointsEl = card.querySelector('.achievement-points');
  const descEl = card.querySelector('.achievement-description');
  titleEl.style.fontSize = `${a.achievementTitle.size}px`;
  pointsEl.style.fontSize = `${a.achievementPoints.size}px`;
  descEl.style.fontSize = `${a.achievementDescription.size}px`;
  descEl.style.display = (descEl.dataset.hasText === '1' && a.achievementDescription.enabled) ? '' : 'none';
}

function fitLayout() {
  const a = state.aesthetics || mergeAesthetics({});
  const overlayEl = document.querySelector('.overlay');
  const gameTitleEl = $('game-title');
  const consoleEl = $('console');
  const progressEl = $('progress');
  const headingEl = $('unlocks-heading');

  // 1. Reset header & heading to configured sizes
  gameTitleEl.style.fontSize = `${a.gameTitle.size}px`;
  consoleEl.style.fontSize = `${a.console.size}px`;
  progressEl.style.fontSize = `${a.progress.size}px`;
  headingEl.style.fontSize = `${a.sectionHeading.size}px`;

  for (const card of cards) {
    if (!card.hidden) resetCardLayout(card, a);
  }

  // 2. Fit horizontal single-line header/heading fields so characters don't truncate
  if (a.sectionHeading.enabled && headingEl.textContent) {
    fitFontSize(headingEl, a.sectionHeading.size, 10, () => headingEl.scrollWidth <= headingEl.clientWidth + 1);
  }
  if (a.console.enabled && consoleEl.textContent) {
    fitFontSize(consoleEl, a.console.size, 10, () => consoleEl.scrollWidth <= consoleEl.clientWidth + 1);
  }
  if (a.progress.enabled && progressEl.textContent) {
    fitFontSize(progressEl, a.progress.size, 10, () => progressEl.scrollWidth <= progressEl.clientWidth + 1);
  }
  if (a.gameTitle.enabled && gameTitleEl.textContent) {
    fitFontSize(gameTitleEl, a.gameTitle.size, 11, () =>
      gameTitleEl.scrollHeight <= gameTitleEl.clientHeight + 1 &&
      gameTitleEl.scrollWidth <= gameTitleEl.clientWidth + 1
    );
  }

  // 3. Ensure header + heading leave enough room for visible cards without vertical clipping
  const visibleCards = cards.filter((c) => !c.hidden);
  const listEl = $('achievement-list');
  if (visibleCards.length > 0 && overlayEl.clientHeight > 0) {
    const minListHeight = visibleCards.length * 64 + Math.max(0, visibleCards.length - 1) * 8;
    if (listEl.clientHeight < minListHeight || overlayEl.scrollHeight > overlayEl.clientHeight + 1) {
      for (let step = 0; step < 8; step++) {
        if (listEl.clientHeight >= minListHeight && overlayEl.scrollHeight <= overlayEl.clientHeight + 1) break;
        const curTitle = parseFloat(gameTitleEl.style.fontSize) || a.gameTitle.size;
        const curConsole = parseFloat(consoleEl.style.fontSize) || a.console.size;
        const curProgress = parseFloat(progressEl.style.fontSize) || a.progress.size;
        const curHeading = parseFloat(headingEl.style.fontSize) || a.sectionHeading.size;
        if (curTitle <= 12 && curConsole <= 10 && curProgress <= 10 && curHeading <= 10) break;
        gameTitleEl.style.fontSize = `${Math.max(12, Math.floor(curTitle * 0.88))}px`;
        consoleEl.style.fontSize = `${Math.max(10, Math.floor(curConsole * 0.88))}px`;
        progressEl.style.fontSize = `${Math.max(10, Math.floor(curProgress * 0.88))}px`;
        headingEl.style.fontSize = `${Math.max(10, Math.floor(curHeading * 0.88))}px`;
      }
    }
  }

  // 4. Fit each visible achievement card:
  //    - Title: always 1 line, fixed font size (CSS ellipsis handles overflow — no JS shrinking)
  //    - Description: always 2 lines, shrink font down to (baseSize - 2) if it overflows
  for (const card of visibleCards) {
    const copyEl = card.querySelector('.achievement-copy');
    const descEl = card.querySelector('.achievement-description');
    const maxH = card.clientHeight;
    if (maxH <= 0) continue;

    // Description: shrink up to 2px below chosen size to keep 2 lines without clipping
    const descVisible = descEl.style.display !== 'none';
    if (descVisible && a.achievementDescription.enabled) {
      const baseDescSize = a.achievementDescription.size;
      const minDescSize = baseDescSize - 2;
      fitFontSize(descEl, baseDescSize, minDescSize, () => copyEl.scrollHeight <= maxH + 1);
    }
  }
}

function applyAesthetics(aesInput) {
  const a = mergeAesthetics(aesInput || {});
  state.aesthetics = a;
  const root = document.documentElement.style;
  root.setProperty('--ra-font-family', a.fontFamily);

  for (const key of ['gameTitle','console','progress','sectionHeading','achievementTitle','achievementPoints','achievementDescription']) {
    root.setProperty(`--ra-${key}-size`, `${a[key].size}px`);
    root.setProperty(`--ra-${key}-color`, a[key].color);
  }
  root.setProperty('--ra-gameIconBorder-color', a.gameIconBorder.enabled ? a.gameIconBorder.color : 'transparent');
  root.setProperty('--ra-achievementIconBorder-color', a.achievementIconBorder.enabled ? a.achievementIconBorder.color : 'transparent');

  // Visibility per element
  $('game-title').classList.toggle('aesthetic-hidden', !a.gameTitle.enabled);
  $('console').classList.toggle('aesthetic-hidden', !a.console.enabled);
  $('progress').classList.toggle('aesthetic-hidden', !a.progress.enabled);
  $('unlocks-heading').classList.toggle('aesthetic-hidden', !a.sectionHeading.enabled);
  const iconEl = $('game-icon');
  iconEl.classList.toggle('aesthetic-hidden', !a.gameIcon.enabled);

  const metaVisible = a.console.enabled || a.progress.enabled;
  document.querySelector('.game-meta').classList.toggle('aesthetic-hidden', !metaVisible);
  const infoVisible = a.gameTitle.enabled || metaVisible;
  document.querySelector('.game-info').classList.toggle('aesthetic-hidden', !infoVisible);
  const headerEl = document.querySelector('.game-header');
  headerEl.classList.toggle('aesthetic-hidden', !a.gameIcon.enabled && !infoVisible);
  headerEl.classList.toggle('without-icon', !a.gameIcon.enabled || iconEl.hidden);

  cards.forEach((card) => {
    card.querySelector('.badge').classList.toggle('aesthetic-hidden', !a.achievementIcons.enabled);
    card.querySelector('.achievement-title').classList.toggle('aesthetic-hidden', !a.achievementTitle.enabled);
    card.querySelector('.achievement-points').classList.toggle('aesthetic-hidden', !a.achievementPoints.enabled);
    card.querySelector('.achievement-description').classList.toggle('aesthetic-hidden', !a.achievementDescription.enabled);
    card.querySelector('.achievement-title-row').classList.toggle('aesthetic-hidden',
      !a.achievementTitle.enabled && !a.achievementPoints.enabled);
    card.classList.toggle('without-badge', !a.achievementIcons.enabled);
  });

  $('empty-state').classList.toggle('aesthetic-hidden', !a.emptyState.enabled);
  fitLayout();
}

function earned(ach, mode) {
  return mode === 'softcore' ? ach.dateEarnedSoftcore : ach.dateEarnedHardcore;
}

function renderAchievement(card, ach) {
  if (!ach) { card.hidden = true; return; }
  card.hidden = false;
  const img = card.querySelector('.badge');
  const title = card.querySelector('.achievement-title');
  const points = card.querySelector('.achievement-points');
  const desc = card.querySelector('.achievement-description');
  if (ach.badgeUrl) {
    if (img.getAttribute('src') !== ach.badgeUrl) img.src = ach.badgeUrl;
    img.style.visibility = '';
  } else {
    img.removeAttribute('src');
    img.style.visibility = 'hidden';
  }
  title.textContent = ach.title || '';
  points.textContent = ach.points != null ? String(ach.points) : '';
  const descText = (ach.description || '').trim();
  desc.textContent = ach.description || '';
  desc.dataset.hasText = descText ? '1' : '0';
  desc.style.display = descText ? '' : 'none';
}

function render() {
  const data = state.data;
  if (!data) return;

  const opts = state.previewOptions || {};
  const game = data.game || {};
  const mode = opts.achievementMode || data.mode || 'hardcore';
  const dm = opts.displayMode || data.displayMode || 'latest';
  const total = game.numAchievements || 0;
  const earnedCount = mode === 'softcore' ? (game.numAwardedSoftcore || 0) : (game.numAwardedHardcore || 0);
  const pct = total > 0 ? (earnedCount / total * 100).toFixed(1) : '0.0';

  $('game-title').textContent = game.title || 'Unknown game';
  $('console').textContent = game.consoleName || '';
  $('progress').textContent = total > 0 ? `${earnedCount} / ${total} · ${pct}%` : '';

  const icon = $('game-icon');
  if (game.imageIcon) {
    if (icon.getAttribute('src') !== game.imageIcon) icon.src = game.imageIcon;
    icon.hidden = false;
  } else {
    icon.removeAttribute('src');
    icon.hidden = true;
  }

  $('unlocks-heading').textContent = dm === 'next'
    ? 'Next Achievements to Unlock'
    : 'Latest Achievements Unlocked';

  const count = dm === 'next'
    ? (opts.nextAchievementCount ?? data.nextAchievementCount)
    : (opts.latestAchievementCount ?? data.latestAchievementCount);
  const achievements = (game.achievements || []).filter(a => a.title);

  let list;
  if (dm === 'next') {
    list = achievements
      .filter(a => !earned(a, mode))
      .sort((a, b) => (a.displayOrder - b.displayOrder) || (a.id - b.id))
      .slice(0, count);
  } else {
    list = achievements
      .filter(a => earned(a, mode))
      .sort((a, b) => {
        const da = String(earned(a, mode));
        const db = String(earned(b, mode));
        return db > da ? 1 : db < da ? -1 : b.id - a.id;
      })
      .slice(0, count);
  }

  $('achievement-list').style.setProperty('--visible-count', String(Math.max(1, list.length)));
  cards.forEach((c, i) => renderAchievement(c, list[i]));

  const empty = $('empty-state');
  if (dm === 'next' && total > 0 && earnedCount >= total) {
    empty.textContent = 'All achievements unlocked';
    empty.hidden = false;
  } else if (list.length === 0) {
    empty.textContent = dm === 'next' ? 'No locked achievements found' : 'No achievements unlocked yet';
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }

  applyAesthetics(state.override || data.aesthetics || {});
  state.refreshSeconds = Math.max(15, Math.min(300, data.refreshSeconds || 45));
}

async function refresh() {
  try {
    const r = await fetch('/api/data', { cache: 'no-store' });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP ${r.status}`);
    }
    state.data = await r.json();
    render();
  } catch (err) {
    if (!state.data) {
      const empty = $('empty-state');
      const isPreview = document.documentElement.classList.contains('preview');
      empty.textContent = isPreview && err && err.message
        ? err.message
        : 'Waiting for RetroAchievements configuration';
      empty.hidden = false;
      applyAesthetics(state.override || {});
    }
  } finally {
    schedule();
  }
}

function schedule() {
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(refresh, state.refreshSeconds * 1000);
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (!event.data) return;
  if (event.data.type === 'ra-overlay-aesthetics-preview') {
    state.override = event.data.aesthetics || null;
    state.previewOptions = event.data.previewOptions || null;
    if (state.data) {
      render();
    } else {
      applyAesthetics(state.override || {});
    }
  } else if (event.data.type === 'ra-overlay-refresh') {
    // Settings page requesting a data refresh (keeps preview in sync)
    if (state.timer) clearTimeout(state.timer);
    refresh();
  }
});

if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => fitLayout()).observe(document.querySelector('.overlay'));
}
window.addEventListener('resize', fitLayout);

refresh();
