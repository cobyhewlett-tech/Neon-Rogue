@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo Error: Node.js 22+ is required to run Neon Rogue.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
)

if not exist "dist\index.html" (
  echo Building Neon Rogue production bundle...
  call npm run build
)

set NODE_ENV=production
if "%PORT%"=="" set PORT=3000

echo Launching Neon Rogue on http://localhost:%PORT% ...
start "" "http://localhost:%PORT%"
node server.ts
pause
