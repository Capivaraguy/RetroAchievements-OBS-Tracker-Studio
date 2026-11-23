# Build and validation notes

This package is a source repository prepared for a Windows build. The current execution environment is not Windows and cannot produce or certify the final Windows NSIS installer.

Before publishing a public release, validate on a clean Windows 10/11 x64 machine:

- Installer completes and creates Start Menu / desktop shortcuts.
- App starts without a visible PowerShell or terminal window.
- Settings save and persist after app restart.
- API connection works with a real RetroAchievements account.
- OBS Browser Source loads `http://127.0.0.1:8765/`.
- Closing the desktop app stops the local server.
- Test a machine where port 8765 is already occupied and confirm the error is understandable.

The Electron wrapper intentionally preserves the v1.0.2 tracker implementation rather than rewriting its API and rendering logic.
