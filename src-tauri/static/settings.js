'use strict';

const $ = (id) => document.getElementById(id);

let hasApiKey = false;

const AESTHETIC_SPEC = [
  { key: 'gameTitle',              label: 'Game title',              min: 14, max: 72, size: 26, color: '#ffffff' },
  { key: 'console',                label: 'Console',                 min: 12, max: 48, size: 20, color: '#f1f1f1' },
  { key: 'progress',               label: 'Progress',                min: 12, max: 64, size: 20, color: '#ffffff' },
  { key: 'sectionHeading',         label: 'Section heading',         min: 12, max: 48, size: 20, color: '#ffffff' },
  { key: 'achievementTitle',       label: 'Achievement title',       min: 14, max: 96, size: 24, color: '#ffffff' },
  { key: 'achievementPoints',      label: 'Achievement points',      min: 14, max: 96, size: 24, color: '#ffffff' },
  { key: 'achievementDescription', label: 'Achievement description', min: 12, max: 72, size: 18, color: '#ededed' },
];

const BORDER_SPEC = [
  { key: 'gameIconBorder',        label: 'Game icon border' },
  { key: 'achievementIconBorder', label: 'Achievement icon border' },
];

const VISIBILITY_SPEC = [
  { key: 'gameIcon',         label: 'Game icon' },
  { key: 'achievementIcons', label: 'Achievement icons' },
  { key: 'emptyState',       label: 'Empty-state message' },
];

function buildAestheticGrid() {
  const grid = $('aesthetic-grid');
  for (const spec of AESTHETIC_SPEC) {
    const item = document.createElement('div');
    item.className = 'aesthetic-item';
    item.innerHTML = `
      <div class="aesthetic-header">
        <label>${spec.label}</label>
        <label class="vis-toggle"><input type="checkbox" data-vis="${spec.key}" checked> Show</label>
      </div>
      <div class="aesthetic-controls">
        <div><label>Size</label><input type="number" data-size="${spec.key}" min="${spec.min}" max="${spec.max}" value="${spec.size}"></div>
        <div><label>Color</label><input type="color" data-color="${spec.key}" value="${spec.color}"></div>
      </div>
    `;
    grid.appendChild(item);
  }
}

function buildBorderGrid() {
  const grid = $('border-grid');
  for (const spec of BORDER_SPEC) {
    const item = document.createElement('div');
    item.className = 'aesthetic-item';
    item.innerHTML = `
      <div class="aesthetic-header">
        <label>${spec.label}</label>
        <label class="vis-toggle"><input type="checkbox" data-vis="${spec.key}" checked> Show</label>
      </div>
      <div class="aesthetic-controls single">
        <div><label>Border color</label><input type="color" data-color="${spec.key}" value="#ffffff"></div>
      </div>
    `;
    grid.appendChild(item);
  }
  for (const spec of VISIBILITY_SPEC) {
    const item = document.createElement('div');
    item.className = 'aesthetic-item visibility-item';
    item.innerHTML = `
      <div class="aesthetic-header">
        <label>${spec.label}</label>
        <label class="vis-toggle"><input type="checkbox" data-vis="${spec.key}" checked> Show</label>
      </div>
    `;
    grid.appendChild(item);
  }
}

function syncDisabledStates() {
  document.querySelectorAll('.aesthetic-item').forEach((item) => {
    const vis = item.querySelector('input[data-vis]');
    if (vis) item.classList.toggle('is-disabled', !vis.checked);
  });
}

function readAestheticsFromForm() {
  const out = { fontFamily: $('font-family').value };
  for (const spec of AESTHETIC_SPEC) {
    const sizeInput = document.querySelector(`input[data-size="${spec.key}"]`);
    const parsed = parseInt(sizeInput.value, 10);
    out[spec.key] = {
      enabled: document.querySelector(`input[data-vis="${spec.key}"]`).checked,
      size: Number.isFinite(parsed) ? parsed : spec.size,
      color: document.querySelector(`input[data-color="${spec.key}"]`).value,
    };
  }
  for (const spec of BORDER_SPEC) {
    out[spec.key] = {
      enabled: document.querySelector(`input[data-vis="${spec.key}"]`).checked,
      color: document.querySelector(`input[data-color="${spec.key}"]`).value,
    };
  }
  for (const spec of VISIBILITY_SPEC) {
    out[spec.key] = {
      enabled: document.querySelector(`input[data-vis="${spec.key}"]`).checked,
    };
  }
  return out;
}

function fillAestheticsForm(aes) {
  $('font-family').value = aes.fontFamily || 'Arial, Helvetica, sans-serif';
  for (const spec of AESTHETIC_SPEC) {
    const f = aes[spec.key] || {};
    document.querySelector(`input[data-vis="${spec.key}"]`).checked = f.enabled !== false;
    document.querySelector(`input[data-size="${spec.key}"]`).value = String(f.size ?? spec.size);
    document.querySelector(`input[data-color="${spec.key}"]`).value = f.color || spec.color;
  }
  for (const spec of BORDER_SPEC) {
    const f = aes[spec.key] || {};
    document.querySelector(`input[data-vis="${spec.key}"]`).checked = f.enabled !== false;
    document.querySelector(`input[data-color="${spec.key}"]`).value = f.color || '#ffffff';
  }
  for (const spec of VISIBILITY_SPEC) {
    const f = aes[spec.key] || {};
    document.querySelector(`input[data-vis="${spec.key}"]`).checked = f.enabled !== false;
  }
  syncDisabledStates();
}

function readPreviewOptions() {
  const dmInput = document.querySelector('input[name="display-mode"]:checked');
  return {
    displayMode: dmInput ? dmInput.value : 'latest',
    achievementMode: $('achievement-mode').value || 'hardcore',
    latestAchievementCount: parseInt($('latest-count').value, 10) || 3,
    nextAchievementCount: parseInt($('next-count').value, 10) || 3,
  };
}

function updatePreviewLive() {
  syncDisabledStates();
  const frame = $('preview-iframe');
  if (!frame || !frame.contentWindow) return;
  frame.contentWindow.postMessage({
    type: 'ra-overlay-aesthetics-preview',
    aesthetics: readAestheticsFromForm(),
    previewOptions: readPreviewOptions(),
  }, window.location.origin);
}

function bindAestheticInputs() {
  document.querySelectorAll(
    '#aesthetic-grid input, #border-grid input, #font-family, #achievement-mode, #latest-count, #next-count, input[name="display-mode"]'
  ).forEach((el) => {
    el.addEventListener('input', updatePreviewLive);
    el.addEventListener('change', updatePreviewLive);
  });
}

function readDimension(input, min, max) {
  const v = parseInt(input.value, 10);
  if (!Number.isFinite(v) || v < min || v > max) return null;
  return v;
}

function fitPreview() {
  const width = readDimension($('overlay-width'), 280, 1920);
  const height = readDimension($('overlay-height'), 200, 1200);

  if (width === null || height === null) {
    $('preview-size').textContent = 'Invalid dimensions';
    return;
  }

  $('preview-size').textContent = `${width} × ${height} px`;

  const viewport = $('preview-viewport');
  const shell = $('preview-shell');
  const frame = $('preview-iframe');

  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;

  const availW = Math.max(1, viewport.clientWidth - 24);
  const availH = Math.max(1, viewport.clientHeight - 24);
  const scale = Math.min(1, availW / width, availH / height);
  shell.style.width = `${(width * scale).toFixed(2)}px`;
  shell.style.height = `${(height * scale).toFixed(2)}px`;
  frame.style.transform = `scale(${scale})`;
}

function updateConditionalFields() {
  const dm = document.querySelector('input[name="display-mode"]:checked').value;
  $('latest-count-wrap').hidden = dm !== 'latest';
  $('next-count-wrap').hidden = dm !== 'next';

  const gs = document.querySelector('input[name="game-selection"]:checked').value;
  $('fixed-game-wrap').hidden = gs !== 'fixed';

  document.querySelectorAll('.choice-card').forEach((card) => {
    const r = card.querySelector('input[type=radio]');
    card.classList.toggle('is-selected', Boolean(r && r.checked));
  });
}

function parseGameReference(raw) {
  const out = { gameId: '', setId: '' };
  raw = String(raw || '').trim();
  if (!raw) return out;

  if (/^\d+$/.test(raw)) {
    out.gameId = raw;
    return out;
  }

  const normalized = /^https?:\/\//i.test(raw)
    ? raw
    : raw.startsWith('/')
      ? `https://retroachievements.org${raw}`
      : /^\d+[?#]/.test(raw)
        ? `https://retroachievements.org/game/${raw}`
        : `https://${raw}`;

  try {
    const u = new URL(normalized);
    const m = u.pathname.match(/\/game\/(\d+)/i) || u.pathname.match(/\/(\d+)(?:[-/]|$)/);
    if (m) out.gameId = m[1];
    const setParam = u.searchParams.get('set');
    if (setParam && /^\d+$/.test(setParam)) out.setId = setParam;
  } catch (_err) {
    const gm = raw.match(/(?:\/game\/|^)(\d+)/i);
    if (gm) out.gameId = gm[1];
    const sm = raw.match(/[?&]set=(\d+)/i);
    if (sm) out.setId = sm[1];
  }
  return out;
}

function showStatus(msg, kind = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${kind}`.trim();
}

async function loadConfig() {
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const cfg = await r.json();
    hasApiKey = Boolean(cfg.hasApiKey);
    $('username').value = cfg.username || '';
    $('key-note').textContent = hasApiKey ? 'Key saved.' : 'No key saved.';
    $('achievement-mode').value = cfg.achievementMode || 'hardcore';
    const dm = cfg.displayMode === 'next' ? 'next' : 'latest';
    document.querySelector(`input[name="display-mode"][value="${dm}"]`).checked = true;
    $('latest-count').value = String(cfg.latestAchievementCount || 3);
    $('next-count').value = String(cfg.nextAchievementCount || 3);
    $('overlay-width').value = String(cfg.overlayWidth || 480);
    $('overlay-height').value = String(cfg.overlayHeight || 430);
    $('minimize-to-tray').checked = cfg.minimizeToTrayOnClose !== false;
    $('start-with-windows').checked = Boolean(cfg.startWithWindows);
    const gs = cfg.fixedGameId ? 'fixed' : 'automatic';
    document.querySelector(`input[name="game-selection"][value="${gs}"]`).checked = true;
    if (cfg.fixedGameId) {
      $('fixed-game-id').value = cfg.fixedAchievementSetId
        ? `https://retroachievements.org/game/${cfg.fixedGameId}?set=${cfg.fixedAchievementSetId}`
        : String(cfg.fixedGameId);
    }
    fillAestheticsForm(cfg.aesthetics || {});
    updateConditionalFields();
    fitPreview();
    updatePreviewLive();
    $('obs-url').value = window.location.origin + '/';
  } catch (e) {
    showStatus('Could not load config: ' + e.message, 'error');
  }
}

async function save(e) {
  e.preventDefault();
  const username = $('username').value.trim();
  if (!username) {
    showStatus('Enter your username.', 'error');
    $('username').focus();
    return;
  }

  const enteredKey = $('api-key').value.trim();
  if (!enteredKey && !hasApiKey) {
    showStatus('Enter your Web API key.', 'error');
    $('api-key').focus();
    return;
  }

  const displayMode = document.querySelector('input[name="display-mode"]:checked').value;
  const gameSelection = document.querySelector('input[name="game-selection"]:checked').value;

  let fixedGameId = '';
  let fixedAchievementSetId = '';
  if (gameSelection === 'fixed') {
    const parsed = parseGameReference($('fixed-game-id').value);
    if (!/^\d+$/.test(parsed.gameId) || parseInt(parsed.gameId, 10) <= 0) {
      showStatus('Enter a valid game ID, game URL, or subset URL.', 'error');
      $('fixed-game-id').focus();
      return;
    }
    fixedGameId = parsed.gameId;
    fixedAchievementSetId = parsed.setId;
  }

  const payload = {
    username,
    apiKey: enteredKey || undefined,
    fixedGameId,
    fixedAchievementSetId,
    achievementMode: $('achievement-mode').value,
    refreshSeconds: 45,
    nextAchievementCount: parseInt($('next-count').value, 10) || 3,
    latestAchievementCount: parseInt($('latest-count').value, 10) || 3,
    overlayWidth: Math.max(280, Math.min(1920, parseInt($('overlay-width').value, 10) || 480)),
    overlayHeight: Math.max(200, Math.min(1200, parseInt($('overlay-height').value, 10) || 430)),
    displayMode,
    minimizeToTrayOnClose: $('minimize-to-tray').checked,
    startWithWindows: $('start-with-windows').checked,
    aesthetics: readAestheticsFromForm(),
  };

  const btn = $('save-btn');
  btn.disabled = true;

  try {
    showStatus('Saving…');
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Save failed (${r.status}).`);

    hasApiKey = true;
    $('api-key').value = '';
    $('key-note').textContent = 'Key saved.';

    const targetVersion = body.configVersion || 0;
    showStatus('Testing connection…');

    let finalStatus = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((res) => setTimeout(res, 400));
      const statusR = await fetch('/api/status', { cache: 'no-store' });
      const statusBody = await statusR.json().catch(() => null);
      if (statusR.ok && statusBody && (statusBody.polledVersion || 0) >= targetVersion) {
        finalStatus = statusBody;
        break;
      }
    }

    if (!finalStatus) {
      throw new Error('Timed out waiting for RetroAchievements response.');
    }
    if (finalStatus.lastError) {
      throw new Error(finalStatus.lastError);
    }

    const title = finalStatus.gameTitle || 'game';
    showStatus(`Connected: ${title}.`, 'success');

    $('preview-iframe').contentWindow.location.reload();
  } catch (err) {
    showStatus(err.message || 'Save failed.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// Bootstrap
buildAestheticGrid();
buildBorderGrid();
bindAestheticInputs();

document.querySelectorAll('input[name="display-mode"], input[name="game-selection"]').forEach((el) => {
  el.addEventListener('change', updateConditionalFields);
});
$('settings-form').addEventListener('submit', save);

$('overlay-width').addEventListener('input', fitPreview);
$('overlay-height').addEventListener('input', fitPreview);

async function saveAppOptions(changedEl) {
  const note = $('app-options-status');
  note.textContent = 'Saving…';
  note.className = 'note';
  try {
    const r = await fetch('/api/app-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minimizeToTrayOnClose: $('minimize-to-tray').checked,
        startWithWindows: $('start-with-windows').checked,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Save failed (${r.status}).`);
    note.textContent = 'Tray & startup preference saved.';
    note.className = 'note success';
  } catch (err) {
    if (changedEl) changedEl.checked = !changedEl.checked;
    note.textContent = err.message || 'Could not update preference.';
    note.className = 'note error';
  }
}

$('minimize-to-tray').addEventListener('change', (e) => saveAppOptions(e.target));
$('start-with-windows').addEventListener('change', (e) => saveAppOptions(e.target));

$('reset-aesthetics').addEventListener('click', () => {
  fillAestheticsForm({});
  updatePreviewLive();
});

$('toggle-key').addEventListener('click', () => {
  const inp = $('api-key');
  const showing = inp.type === 'text';
  inp.type = showing ? 'password' : 'text';
  $('toggle-key').textContent = showing ? 'Show' : 'Hide';
});

$('copy-url').addEventListener('click', async () => {
  const input = $('obs-url');
  const text = input.value;
  try {
    await navigator.clipboard.writeText(text);
  } catch (_e) {
    input.select();
    try { document.execCommand('copy'); } catch (_e2) {}
  }
  $('copy-url').textContent = 'Copied';
  setTimeout(() => { $('copy-url').textContent = 'Copy'; }, 1500);
});

$('preview-iframe').addEventListener('load', () => {
  fitPreview();
  updatePreviewLive();
});

// Keep preview in sync with live data: poll /api/data every 15s and
// nudge the iframe to refresh whenever something changes.
let _previewPollLastGame = null;
let _previewPollTimer = null;
async function pollPreviewData() {
  try {
    const r = await fetch('/api/data', { cache: 'no-store' });
    if (r.ok) {
      const data = await r.json();
      const gameKey = `${data.game?.id ?? ''}:${data.game?.title ?? ''}`;
      if (gameKey !== _previewPollLastGame) {
        _previewPollLastGame = gameKey;
        const frame = $('preview-iframe');
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'ra-overlay-refresh' }, window.location.origin);
        }
      }
    }
  } catch (_) {}
  _previewPollTimer = setTimeout(pollPreviewData, 15_000);
}
pollPreviewData();

window.addEventListener('resize', fitPreview);

loadConfig();
