@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PROFILE=%~dp0.chrome-profile"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo Chrome not found. Please install Google Chrome.
  pause
  exit /b 1
)

echo Starting Chrome debug mode on port 9222...
echo Profile: %PROFILE%
start "ChromeDebug" "%CHROME%" --remote-debugging-port=9222 --user-data-dir="%PROFILE%"

echo.
echo Next steps:
echo   1. Open https://www.amazon.com in that Chrome window
echo   2. Open product page and keyword search pages
echo   3. Run collection: node --env-file-if-exists=.env.local run-collection.mjs
echo      Or click Collect Now in the dashboard
echo.
pause
