'use strict';

const form = document.getElementById('settings-form');
const statusEl = document.getElementById('save-status');
const saveButton = document.getElementById('save-test');
const keyInput = document.getElementById('apiKey');
const gameInput = document.getElementById('gameInput');
const setInput = document.getElementById('setId');
const latestCountWrap = document.getElementById('latest-count-wrap');
const nextCountWrap = document.getElementById('next-count-wrap');
const fixedGameFields = document.getElementById('fixed-game-fields');
const subsetFields = document.getElementById('subset-fields');
const gameInputLabel = document.getElementById('game-input-label');
const widthInput = document.getElementById('overlayWidth');
const heightInput = document.getElementById('overlayHeight');
const previewFrame = document.getElementById('overlay-preview');
const previewViewport = document.getElementById('preview-viewport');
const previewCanvasShell = document.getElementById('preview-canvas-shell');
const previewSizeLabel = document.getElementById('preview-size-label');
const achievementCountFitNote = document.getElementById('achievement-count-fit-note');
let savedRefreshSeconds = 30;

const AESTHETIC_DEFAULTS = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  gameTitle: { size: 26, color: '#ffffff', min: 14, max: 72 },
  console: { size: 20, color: '#f1f1f1', min: 12, max: 48 },
  progress: { size: 20, color: '#ffffff', min: 12, max: 64 },
  sectionHeading: { size: 20, color: '#ffffff', min: 12, max: 48 },
  achievementTitle: { size: 24, color: '#ffffff', min: 14, max: 96 },
  achievementPoints: { size: 24, color: '#ffffff', min: 14, max: 96 },
  achievementDescription: { size: 18, color: '#ededed', min: 12, max: 72 }
};
const ICON_BORDER_DEFAULTS = {
  gameIconBorder: { enabled: true, color: '#ffffff' },
  achievementIconBorder: { enabled: true, color: '#ffffff' }
};
const ELEMENT_VISIBILITY_DEFAULTS = {
  gameIcon: true,
  achievementIcons: true,
  emptyState: true
};
const FONT_FAMILIES = [
  'Arial, Helvetica, sans-serif',
  'Impact, sans-serif',
  'Verdana, Geneva, sans-serif',
  'Tahoma, Geneva, sans-serif',
  'Trebuchet MS, Arial, sans-serif',
  'Georgia, Times New Roman, serif',
  'Courier New, Courier, monospace',
  'Segoe UI, Arial, sans-serif'
];

function getAestheticsFromForm() {
  const aesthetics = {
    fontFamily: document.getElementById('aesthetic-font-family').value
  };
  for (const [key, defaults] of Object.entries(AESTHETIC_DEFAULTS)) {
    if (key === 'fontFamily') continue;
    const sizeInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="size"]`);
    const colorInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="color"]`);
    const rawSize = Number(sizeInput.value);
    const size = Number.isInteger(rawSize) ? rawSize : defaults.size;
    const enabledInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="enabled"]`);
    aesthetics[key] = {
      enabled: enabledInput ? enabledInput.checked : true,
      size,
      color: /^#[0-9a-f]{6}$/i.test(colorInput.value) ? colorInput.value.toLowerCase() : defaults.color
    };
  }
  for (const [key, defaultEnabled] of Object.entries(ELEMENT_VISIBILITY_DEFAULTS)) {
    const enabledInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="enabled"]`);
    aesthetics[key] = { enabled: enabledInput ? enabledInput.checked : defaultEnabled };
  }
  for (const [key, defaults] of Object.entries(ICON_BORDER_DEFAULTS)) {
    const enabledInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="enabled"]`);
    const colorInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="color"]`);
    aesthetics[key] = {
      enabled: enabledInput.checked,
      color: /^#[0-9a-f]{6}$/i.test(colorInput.value) ? colorInput.value.toLowerCase() : defaults.color
    };
  }
  return aesthetics;
}

function fillAestheticsForm(aesthetics = {}) {
  const family = FONT_FAMILIES.includes(aesthetics.fontFamily) ? aesthetics.fontFamily : AESTHETIC_DEFAULTS.fontFamily;
  document.getElementById('aesthetic-font-family').value = family;
  for (const [key, defaults] of Object.entries(AESTHETIC_DEFAULTS)) {
    if (key === 'fontFamily') continue;
    const saved = aesthetics[key] || {};
    const sizeInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="size"]`);
    const colorInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="color"]`);
    const size = Number(saved.size);
    sizeInput.value = String(Number.isInteger(size) && size >= defaults.min && size <= defaults.max ? size : defaults.size);
    sizeInput.setAttribute('aria-invalid', 'false');
    colorInput.value = /^#[0-9a-f]{6}$/i.test(String(saved.color || '')) ? saved.color.toLowerCase() : defaults.color;
    const enabledInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="enabled"]`);
    if (enabledInput) enabledInput.checked = typeof saved.enabled === 'boolean' ? saved.enabled : true;
  }
  for (const [key, defaultEnabled] of Object.entries(ELEMENT_VISIBILITY_DEFAULTS)) {
    const saved = aesthetics[key] || {};
    const enabledInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="enabled"]`);
    enabledInput.checked = typeof saved.enabled === 'boolean' ? saved.enabled : defaultEnabled;
  }
  for (const [key, defaults] of Object.entries(ICON_BORDER_DEFAULTS)) {
    const saved = aesthetics[key] || {};
    const enabledInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="enabled"]`);
    const colorInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="color"]`);
    enabledInput.checked = typeof saved.enabled === 'boolean' ? saved.enabled : defaults.enabled;
    colorInput.value = /^#[0-9a-f]{6}$/i.test(String(saved.color || '')) ? saved.color.toLowerCase() : defaults.color;
    colorInput.disabled = !enabledInput.checked;
  }
}

function syncIconBorderInputs() {
  for (const key of Object.keys(ICON_BORDER_DEFAULTS)) {
    const enabledInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="enabled"]`);
    const colorInput = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="color"]`);
    colorInput.disabled = !enabledInput.checked;
  }
}

function updatePreviewAesthetics() {
  syncIconBorderInputs();
  if (!previewFrame.contentWindow) return;
  previewFrame.contentWindow.postMessage({
    type: 'ra-overlay-aesthetics-preview',
    aesthetics: getAestheticsFromForm()
  }, window.location.origin);
}

function resetAestheticsToDefaults() {
  fillAestheticsForm({});
  updatePreviewAesthetics();
  showStatus('Aesthetics reset. Save to apply the defaults.', '');
}

function validateAesthetics() {
  const labels = { gameTitle: 'Game title', console: 'Console', progress: 'Progress', sectionHeading: 'Achievement section heading', achievementTitle: 'Achievement title', achievementPoints: 'Points', achievementDescription: 'Achievement description' };
  for (const [key, defaults] of Object.entries(AESTHETIC_DEFAULTS)) {
    if (key === 'fontFamily') continue;
    const input = document.querySelector(`[data-aesthetic-key="${key}"][data-aesthetic-field="size"]`);
    const value = Number(input.value);
    const valid = Number.isInteger(value) && value >= defaults.min && value <= defaults.max;
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    if (!valid) return { valid: false, input, message: `${labels[key]} size must be ${defaults.min}–${defaults.max} px.` };
  }
  return { valid: true };
}

function selectedValue(name) {
  return form.querySelector(`input[name="${name}"]:checked`)?.value || '';
}

function showStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = `save-status ${kind}`.trim();
}

function readDimension(input, minimum, maximum) {
  const value = Number(input.value);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function fitPreviewCanvas() {
  const width = readDimension(widthInput, 280, 1920);
  const height = readDimension(heightInput, 200, 1200);
  if (width === null || height === null) return;

  const availableWidth = previewViewport.clientWidth;
  const availableHeight = previewViewport.clientHeight;
  if (!availableWidth || !availableHeight) return;

  // Keep the iframe's real viewport at the selected dimensions. Only its
  // visual representation in Studio is scaled to fit the preview panel.
  const scale = Math.min(1, availableWidth / width, availableHeight / height);
  const displayWidth = Math.max(1, Math.round(width * scale));
  const displayHeight = Math.max(1, Math.round(height * scale));

  previewCanvasShell.style.width = `${displayWidth}px`;
  previewCanvasShell.style.height = `${displayHeight}px`;
  previewFrame.style.transform = `scale(${scale})`;
}

function updatePreviewDimensions() {
  const width = readDimension(widthInput, 280, 1920);
  const height = readDimension(heightInput, 200, 1200);

  widthInput.setAttribute('aria-invalid', width === null ? 'true' : 'false');
  heightInput.setAttribute('aria-invalid', height === null ? 'true' : 'false');

  if (width === null || height === null) {
    previewSizeLabel.textContent = 'Invalid dimensions';
    return;
  }

  previewFrame.width = String(width);
  previewFrame.height = String(height);
  previewFrame.style.width = `${width}px`;
  previewFrame.style.height = `${height}px`;
  previewSizeLabel.textContent = `${width} × ${height} px`;
  fitPreviewCanvas();
  updateAchievementCountFitNote();
}

function updateAchievementCountFitNote() {
  if (!achievementCountFitNote) return;
  const mode = selectedValue('displayMode');
  const countInput = document.getElementById(mode === 'next' ? 'nextAchievementCount' : 'latestAchievementCount');
  const count = Math.max(1, Math.min(5, Number(countInput.value) || 3));
  const height = readDimension(heightInput, 200, 1200);
  const recommendedHeight = Math.ceil((165 + count * 64 + Math.max(0, count - 1) * 6) / 10) * 10;
  const needsMoreHeight = count >= 4 && height !== null && height < recommendedHeight;
  achievementCountFitNote.hidden = !needsMoreHeight;
  achievementCountFitNote.textContent = needsMoreHeight
    ? `For ${count} achievements, increase Preview Height to about ${recommendedHeight} px so all 64 px icons fit.`
    : '';
}

function updateConditionalFields() {
  const mode = selectedValue('displayMode');
  const selection = selectedValue('gameSelection');
  latestCountWrap.hidden = mode !== 'latest';
  nextCountWrap.hidden = mode !== 'next';
  updateAchievementCountFitNote();

  const usesFixedGame = selection === 'game' || selection === 'subset';
  fixedGameFields.hidden = !usesFixedGame;
  subsetFields.hidden = selection !== 'subset';

  gameInputLabel.textContent = selection === 'subset'
    ? 'Parent game ID (optional with full subset URL)'
    : 'Game ID or URL';

  document.querySelectorAll('.choice-card').forEach((card) => {
    const radio = card.querySelector('input[type="radio"]');
    card.classList.toggle('is-selected', Boolean(radio && radio.checked));
  });
}

function parseGameReference(rawValue) {
  const raw = String(rawValue || '').trim();
  let gameId = '';
  let setId = '';
  if (!raw) return { gameId, setId };

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const match = url.pathname.match(/\/game\/(\d+)/i) || url.pathname.match(/\/(\d+)(?:[-/]|$)/);
      if (match) gameId = match[1];
      setId = url.searchParams.get('set') || '';
    } catch (_error) {
      return { gameId: '', setId: '' };
    }
  } else {
    const gameMatch = raw.match(/^(\d+)(?:$|[?/#\s])/);
    if (gameMatch) gameId = gameMatch[1];
    const setMatch = raw.match(/[?&]set=(\d+)/i);
    if (setMatch) setId = setMatch[1];
  }
  return { gameId, setId };
}

function selectedGameAndSet(selection) {
  const parentReference = parseGameReference(gameInput.value);
  if (selection === 'game') {
    return { gameId: parentReference.gameId, setId: '' };
  }

  const subsetRaw = setInput.value.trim();
  const subsetReference = parseGameReference(subsetRaw);
  const typedSetId = /^\d+$/.test(subsetRaw) ? subsetRaw : '';
  const subsetFieldIsUrl = /^https?:\/\//i.test(subsetRaw);
  return {
    gameId: parentReference.gameId || (subsetFieldIsUrl ? subsetReference.gameId : ''),
    setId: typedSetId || subsetReference.setId || parentReference.setId
  };
}

function fillForm(config) {
  document.getElementById('username').value = config.username || '';
  document.getElementById('key-note').textContent = config.hasApiKey ? 'Key saved.' : 'No key saved.';

  const displayMode = config.displayMode === 'next' ? 'next' : 'latest';
  form.querySelector(`input[name="displayMode"][value="${displayMode}"]`).checked = true;
  const selection = config.fixedGameId
    ? (config.fixedAchievementSetId ? 'subset' : 'game')
    : 'recent';
  form.querySelector(`input[name="gameSelection"][value="${selection}"]`).checked = true;
  gameInput.value = config.fixedGameId || '';
  setInput.value = config.fixedAchievementSetId || '';
  document.getElementById('achievementMode').value = config.achievementMode || 'hardcore';
  savedRefreshSeconds = Number.isInteger(Number(config.refreshSeconds))
    ? Math.max(15, Math.min(300, Number(config.refreshSeconds)))
    : 30;
  document.getElementById('nextAchievementCount').value = String(Math.max(1, Math.min(5, Math.trunc(Number(config.nextAchievementCount) || 3))));
  document.getElementById('latestAchievementCount').value = String(Math.max(1, Math.min(5, Math.trunc(Number(config.latestAchievementCount) || 3))));
  widthInput.value = String(config.overlayWidth || 480);
  heightInput.value = String(config.overlayHeight || 430);
  fillAestheticsForm(config.aesthetics || {});
  updateConditionalFields();
  updatePreviewDimensions();
  updatePreviewAesthetics();
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load settings.');
    fillForm(await response.json());
  } catch (error) {
    showStatus(error.message || 'Could not load settings.', 'error');
  }
}

async function saveAndTest(event) {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  if (!username) {
    showStatus('Enter your username.', 'error');
    document.getElementById('username').focus();
    return;
  }

  const selection = selectedValue('gameSelection');
  let fixedGameId = '';
  let fixedAchievementSetId = '';
  if (selection === 'game' || selection === 'subset') {
    const parsed = selectedGameAndSet(selection);
    fixedGameId = parsed.gameId;
    fixedAchievementSetId = selection === 'subset' ? parsed.setId : '';

    if (!/^\d+$/.test(fixedGameId) || Number(fixedGameId) <= 0) {
      showStatus(selection === 'subset'
        ? 'Enter the parent game ID or a full subset URL.'
        : 'Enter a valid game ID or URL.', 'error');
      gameInput.focus();
      return;
    }
    if (selection === 'subset' && (!/^\d+$/.test(fixedAchievementSetId) || Number(fixedAchievementSetId) <= 0)) {
      showStatus('Enter a subset ID or full subset URL.', 'error');
      setInput.focus();
      return;
    }
  }

  const overlayWidth = readDimension(widthInput, 280, 1920);
  const overlayHeight = readDimension(heightInput, 200, 1200);
  if (overlayWidth === null) {
    showStatus('Width must be 280–1920 px.', 'error');
    widthInput.focus();
    return;
  }
  if (overlayHeight === null) {
    showStatus('Height must be 200–1200 px.', 'error');
    heightInput.focus();
    return;
  }

  const aestheticValidation = validateAesthetics();
  if (!aestheticValidation.valid) {
    showStatus(aestheticValidation.message, 'error');
    aestheticValidation.input.focus();
    return;
  }

  const payload = {
    username,
    apiKey: keyInput.value.trim(),
    displayMode: selectedValue('displayMode'),
    fixedGameId,
    fixedAchievementSetId,
    achievementMode: document.getElementById('achievementMode').value,
    refreshSeconds: savedRefreshSeconds,
    nextAchievementCount: Number(document.getElementById('nextAchievementCount').value),
    latestAchievementCount: Number(document.getElementById('latestAchievementCount').value),
    overlayWidth,
    overlayHeight,
    aesthetics: getAestheticsFromForm()
  };

  saveButton.disabled = true;
  saveButton.querySelector('.button-label').textContent = 'Saving…';
  saveButton.querySelector('.spinner').hidden = false;
  showStatus('Saving and testing…');

  try {
    const saveResponse = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const saveResult = await saveResponse.json().catch(() => ({}));
    if (!saveResponse.ok) throw new Error(saveResult.error || `Save failed (${saveResponse.status}).`);

    keyInput.value = '';
    document.getElementById('key-note').textContent = 'Key saved.';

    const dataResponse = await fetch(`/api/data?check=${Date.now()}`, { cache: 'no-store' });
    const data = await dataResponse.json().catch(() => ({}));
    if (!dataResponse.ok) throw new Error(data.error || `Connection failed (${dataResponse.status}).`);
    if (!data.game) throw new Error('No game data returned. Check the game selection.');

    const gameTitle = data.game.AchievementSetTitle
      ? `${data.game.Title} [${data.game.AchievementSetTitle}]`
      : data.game.Title;
    showStatus(`Connected: ${gameTitle || 'game'}.`, 'success');
    previewFrame.contentWindow.location.reload();
  } catch (error) {
    showStatus(error.message || 'Could not save settings.', 'error');
  } finally {
    saveButton.disabled = false;
    saveButton.querySelector('.button-label').textContent = 'Save & test connection';
    saveButton.querySelector('.spinner').hidden = true;
  }
}

document.getElementById('reset-aesthetics').addEventListener('click', resetAestheticsToDefaults);

form.addEventListener('change', updateConditionalFields);
form.addEventListener('submit', saveAndTest);
widthInput.addEventListener('input', updatePreviewDimensions);
heightInput.addEventListener('input', updatePreviewDimensions);

document.querySelectorAll('[data-aesthetic-key], #aesthetic-font-family').forEach((input) => {
  input.addEventListener('input', updatePreviewAesthetics);
  input.addEventListener('change', updatePreviewAesthetics);
});

if ('ResizeObserver' in window) {
  const previewResizeObserver = new ResizeObserver(fitPreviewCanvas);
  previewResizeObserver.observe(previewViewport);
} else {
  window.addEventListener('resize', fitPreviewCanvas);
}
previewFrame.addEventListener('load', () => {
  fitPreviewCanvas();
  updatePreviewAesthetics();
});

document.getElementById('toggle-key').addEventListener('click', () => {
  const showing = keyInput.type === 'text';
  keyInput.type = showing ? 'password' : 'text';
  document.getElementById('toggle-key').textContent = showing ? 'Show' : 'Hide';
});

document.getElementById('copy-url').addEventListener('click', async () => {
  const url = document.getElementById('obs-url').value;
  try {
    await navigator.clipboard.writeText(url);
    document.getElementById('copy-url').textContent = 'Copied';
    window.setTimeout(() => { document.getElementById('copy-url').textContent = 'Copy'; }, 1600);
  } catch (_error) {
    document.getElementById('obs-url').select();
    showStatus('Copy the URL manually.', '');
  }
});

document.getElementById('refresh-preview').addEventListener('click', () => {
  previewFrame.contentWindow.location.reload();
});

gameInput.addEventListener('change', () => {
  const parsed = parseGameReference(gameInput.value);
  if (selectedValue('gameSelection') === 'subset' && parsed.setId && !setInput.value.trim()) {
    setInput.value = parsed.setId;
  }
});

setInput.addEventListener('change', () => {
  const parsed = parseGameReference(setInput.value);
  if (parsed.gameId && !gameInput.value.trim()) gameInput.value = parsed.gameId;
  if (parsed.setId) setInput.value = parsed.setId;
});

loadConfig();
