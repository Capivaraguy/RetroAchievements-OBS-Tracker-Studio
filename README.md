# RetroAchievements OBS Tracker Studio

This is an Electron wrapper for RetroAchievements OBS Tracker Studio v1.0.2, a tracker tool for Retroachievements games that you're currently playing to show on your stream.

It's completely local and meant to use the OBS Browser overlay source.

[image1.png]

[image2.png]

## For users

1. Download `RetroAchievements-OBS-Tracker-Studio-Setup-1.0.2.exe` from **GitHub → Releases**.
2. Run the installer.
3. Launch **RetroAchievements OBS Tracker Studio** from the Start Menu or desktop shortcut.
4. Enter your RetroAchievements username and Web API key, configure the display, and use **Save & test connection**.
5. In OBS, add a **Browser Source** with URL `http://127.0.0.1:8765/`. Set its width and height to match the Studio preview.

Keep Tracker Studio open while OBS uses the overlay. Closing Tracker Studio stops its local server.

## Build the Windows installer

Requirements: Windows 10/11, Node.js 22 or newer, and npm.

```powershell
npm install
npm run dist
```

The installer is written to `dist/`.

For local development:

```powershell
npm start
```

## Publish on GitHub

1. Create a GitHub repository and push this project.
2. Create and push a version tag:

```bash
git tag v1.0.2
git push origin v1.0.2
```

3. The included GitHub Actions workflow builds the Windows x64 installer and attaches it to a GitHub Release. You can also run the workflow manually from the Actions tab; that produces a downloadable workflow artifact.

## Data and privacy

- The RetroAchievements API key is stored in the current Windows user's application data directory, not in the installation folder or repository.
- The repository includes only `config.example.json`, with blank credentials.
- The app contacts RetroAchievements services when configured to retrieve game and achievement information.
- The local overlay server listens on `127.0.0.1:8765`; it is not intended to be exposed to the public network.
- Uninstalling the application does not delete the saved configuration.

## Compatibility notes

- Windows x64 installer.
- OBS continues to consume the overlay through its Browser Source / embedded Chromium browser.
- The application still uses Windows PowerShell internally for its local API/server implementation, but users do not need to open a terminal or run a script manually.
- Port 8765 must be available. If another process is already using it, close that process before starting Tracker Studio.

## Project structure

- `main.js` — Electron desktop lifecycle and hidden server management.
- `tracker/` — original overlay, settings UI, API logic, and PowerShell server.
- `.github/workflows/windows-release.yml` — automated Windows installer and GitHub Release build.

## License

MIT. See [LICENSE](LICENSE).
