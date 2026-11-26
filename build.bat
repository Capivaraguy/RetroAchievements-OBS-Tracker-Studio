@echo off
setlocal
cd /d "%~dp0"

where cargo >nul 2>&1
if errorlevel 1 (
    echo Error: Rust/Cargo is not installed or not in PATH.
    pause
    exit /b 1
)

cargo tauri --version >nul 2>&1
if errorlevel 1 (
    echo Error: tauri-cli is not installed. Run:
    echo   cargo install tauri-cli --version "^2"
    pause
    exit /b 1
)

if not exist "src-tauri\icons\icon.ico" (
    echo Generating placeholder icon...
    powershell -ExecutionPolicy Bypass -Command ^
      "Add-Type -AssemblyName System.Drawing; ^
       $b = New-Object System.Drawing.Bitmap 1024,1024; ^
       $g = [System.Drawing.Graphics]::FromImage($b); ^
       $g.SmoothingMode = 'AntiAlias'; ^
       $g.Clear([System.Drawing.Color]::FromArgb(255,16,18,22)); ^
       $f = New-Object System.Drawing.Font('Arial', 280, [System.Drawing.FontStyle]::Bold); ^
       $g.DrawString('RA', $f, [System.Drawing.Brushes]::White, 160, 320); ^
       $b.Save('icon.png', [System.Drawing.Imaging.ImageFormat]::Png); ^
       $g.Dispose(); $b.Dispose()"
    pushd src-tauri
    cargo tauri icon ..\icon.png
    popd
    del icon.png
)

cd src-tauri
cargo tauri build
if errorlevel 1 ( pause & exit /b 1 )

echo.
echo Portable EXE: src-tauri\target\release\ra-obs-tracker.exe
echo Installers:   src-tauri\target\release\bundle\
explorer target\release\bundle
pause
