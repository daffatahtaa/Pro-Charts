@echo off
setlocal
title MT5 Pro Chart - TradingView Engine (Dev Launcher)

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo ====================================================
echo   MT5 Pro Chart - TradingView Engine (Dev Launcher)
echo ====================================================
echo.

:: 1. Start Backend (FastAPI + Uvicorn on Port 8000)
echo [1/2] Starting Backend API on http://localhost:8000 ...
start "MT5 Backend API (Port 8000)" cmd /k "cd /d "%ROOT%\backend" && ".\.venv\Scripts\uvicorn.exe" main:app --host 0.0.0.0 --port 8000 --reload"

:: 2. Start Frontend (Vite React on Port 5173)
echo [2/2] Starting Frontend UI on http://localhost:5173 ...
start "MT5 Frontend UI (Port 5173)" cmd /k "cd /d "%ROOT%\frontend" && npm run dev"

echo.
echo Both servers launched! Opening http://localhost:5173 ...
timeout /t 2 /nobreak >nul
start "" "http://localhost:5173"
exit /b 0
