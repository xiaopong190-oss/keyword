@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Install Node or add it to PATH.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo Dashboard already running at http://127.0.0.1:4173
  start "" "http://127.0.0.1:4173/"
  pause
  exit /b 0
)

echo Starting ASIN Radar dashboard...
echo URL: http://127.0.0.1:4173
echo.
echo Keep this window open. Close it to stop the server.
echo.

start "" "http://127.0.0.1:4173/"
node --env-file-if-exists=.env.local server.mjs
