@echo off
setlocal
cd /d "%~dp0"
set "PATH=%SystemRoot%\System32;%PATH%"
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24, then open this file again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing project dependencies. Internet access is required.
  call npm.cmd ci
  if errorlevel 1 (
    echo Dependency installation failed. Check the message above and try again.
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:5173 on this computer.
echo Keep this window open while using homie. Press Ctrl+C to stop.
call npm.cmd run dev -- --open
if errorlevel 1 (
  echo If port 5173 is already in use, open the existing preview in your browser.
  pause
  exit /b 1
)
