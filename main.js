const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 8765;
const BASE_URL = `http://127.0.0.1:${PORT}`;
let serverProcess = null;
let mainWindow = null;
let shuttingDown = false;

function getTrackerDirectory() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tracker')
    : path.join(__dirname, 'tracker');
}

function startLocalServer() {
  const trackerDir = getTrackerDirectory();
  const scriptPath = path.join(trackerDir, 'server.ps1');
  if (!fs.existsSync(scriptPath)) throw new Error(`Server script not found: ${scriptPath}`);

  const configPath = path.join(app.getPath('userData'), 'config.json');
  const childEnv = { ...process.env, RA_CONFIG_PATH: configPath };
  serverProcess = spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath
  ], {
    cwd: trackerDir,
    env: childEnv,
    windowsHide: true,
    stdio: 'ignore'
  });
  serverProcess.on('error', (error) => {
    if (!shuttingDown) {
      dialog.showErrorBox(
        'Could not start Tracker Studio',
        `Windows PowerShell could not be started.\n\n${error.message}`
      );
      app.quit();
    }
  });
  serverProcess.on('exit', (code) => {
    if (!shuttingDown && code !== 0 && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        'Tracker server stopped',
        'The local tracker server stopped unexpectedly. Check whether port 8765 is already in use, then restart the application.'
      );
      app.quit();
    }
  });
}

async function waitForServer() {
  const deadline = Date.now() + 20000;
  let lastError;
  while (Date.now() < deadline) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error('The local server process exited before it became ready.');
    }
    try {
      const response = await fetch(`${BASE_URL}/settings`, { signal: AbortSignal.timeout(1200) });
      const html = await response.text();
      if (response.ok && html.includes('RetroAchievements OBS Tracker Studio')) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error(`The local tracker server did not become ready on port ${PORT}.\n${lastError ? lastError.message : ''}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: '#111318',
    title: 'RetroAchievements OBS Tracker Studio',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${BASE_URL}/`)) {
      event.preventDefault();
      if (url.startsWith('https://')) shell.openExternal(url);
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL(`${BASE_URL}/settings`);
}

app.whenReady().then(async () => {
  try {
    if (process.platform !== 'win32') {
      throw new Error('This packaged application is designed for Windows.');
    }
    startLocalServer();
    await waitForServer();
    createWindow();
  } catch (error) {
    dialog.showErrorBox('RetroAchievements OBS Tracker Studio', error.message);
    app.quit();
  }
});

app.on('before-quit', () => {
  shuttingDown = true;
  if (serverProcess && !serverProcess.killed) {
    try { serverProcess.kill(); } catch (_) {}
  }
});

app.on('window-all-closed', () => app.quit());
