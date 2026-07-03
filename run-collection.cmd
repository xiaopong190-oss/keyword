@echo off
set ROOT=%~dp0
cd /d "%ROOT%"
"C:\Users\15869\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --env-file-if-exists=.env.local run-collection.mjs >> data\scheduler.log 2>&1
