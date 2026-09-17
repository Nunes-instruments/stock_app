@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title NUNES Stock Main Server
set "NUNES_STOCK_DATA_DIR=C:\ProgramData\NunesStock\data"
set "NUNES_STOCK_PORT=5000"
set "PY=%LOCALAPPDATA%\NunesStockRuntime\venv\Scripts\python.exe"

if not exist "%PY%" (
  echo NUNES Stock runtime is not installed on this PC.
  echo Run SETUP_MAIN_SERVER.bat once as Administrator.
  pause
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5000 .*LISTENING"') do (
  if /I not "%~1"=="--hidden" start "" "http://127.0.0.1:5000"
  exit /b 0
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p=Start-Process -FilePath '%PY%' -ArgumentList 'scripts\server_process.py' -WorkingDirectory '%CD%' -WindowStyle Hidden -PassThru; Start-Sleep -Seconds 2; if($p.HasExited){exit 1}else{exit 0}"
if errorlevel 1 (
  echo Failed to start NUNES Stock Server.
  pause
  exit /b 1
)

if /I not "%~1"=="--hidden" start "" "http://127.0.0.1:5000"
exit /b 0
