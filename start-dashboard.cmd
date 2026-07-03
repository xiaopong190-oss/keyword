@echo off
cd /d "%~dp0"
"C:\Users\15869\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --env-file-if-exists=.env.local server.mjs
