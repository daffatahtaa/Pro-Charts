@echo off
setlocal
title MT5 Pro Chart - TradingView Engine (Dev Launcher)

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo ====================================================
echo   MT5 Pro Chart - TradingView Engine (Dev Launcher)
echo ====================================================
echo.

:: Prerequisites
where python >nul 2>nul || (echo [ERROR] Python not found on PATH. Install Python 3.10+ first. & pause & exit /b 1)
where npm    >nul 2>nul || (echo [ERROR] npm not found on PATH. Install Node.js 18+ first. & pause & exit /b 1)

:: Bootstrap backend venv if missing
if not exist "%ROOT%\backend\.venv\Scripts\uvicorn.exe" (
  echo [setup] Creating backend venv + installing requirements ^(first run only, may take a few minutes^)...
  python -m venv "%ROOT%\backend\.venv" || goto :fail
  "%ROOT%\backend\.venv\Scripts\python.exe" -m pip install -r "%ROOT%\backend\requirements.txt" || goto :fail
)

:: Bootstrap frontend deps if missing
if not exist "%ROOT%\frontend\node_modules" (
  echo [setup] Running npm install in frontend ^(first run only, may take a few minutes^)...
  pushd "%ROOT%\frontend"
  call npm install || (popd & goto :fail)
  popd
)

:: 1. Start Backend (FastAPI + Uvicorn on Port 8000)
echo [1/2] Starting Backend API on http://localhost:8000 ...
start "MT5 Backend API (Port 8000)" cmd /k "cd /d "%ROOT%\backend" && ".\.venv\Scripts\uvicorn.exe" main:app --host 0.0.0.0 --port 8000 --reload"

:: 2. Start Frontend (Vite React on Port 5173)
echo [2/2] Starting Frontend UI on http://localhost:5173 ...
start "MT5 Frontend UI (Port 5173)" cmd /k "cd /d "%ROOT%\frontend" && npm run dev"

echo.
echo Both servers launched! Opening http://localhost:5173 ...
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:5173"
exit /b 0

:fail
echo [ERROR] Setup failed. See the output above.
pause
exit /b 1
