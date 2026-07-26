@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules (
  call npm install || exit /b 1
)
set OPEN_BROWSER=1
call npm run panel

