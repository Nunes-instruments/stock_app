@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title NUNES Stock Main Server
set "NUNES_STOCK_DATA_DIR=C:\ProgramData\NunesStock\data"
set "NUNES_STOCK_PORT=5000"
set "PY=%LOCALAPPDATA%\NunesStockRuntime\venv\Scripts\python.exe"
set "LOG=%NUNES_STOCK_DATA_DIR%\server.log"

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

if not exist "%NUNES_STOCK_DATA_DIR%" mkdir "%NUNES_STOCK_DATA_DIR%" >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p=Start-Process -FilePath '%PY%' -ArgumentList 'scripts\server_process.py' -WorkingDirectory '%CD%' -WindowStyle Hidden -PassThru; Start-Sleep -Seconds 4; if($p.HasExited){exit 1}else{exit 0}"
if errorlevel 1 goto :failed

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try{$r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 'http://127.0.0.1:5000/api/system/health'; if($r.StatusCode -eq 200){exit 0}else{exit 1}}catch{exit 1}"
if errorlevel 1 goto :failed

if /I not "%~1"=="--hidden" start "" "http://127.0.0.1:5000"
exit /b 0

:failed
echo.
echo Failed to start NUNES Stock Server.
echo.
echo Diagnostic log:
echo %LOG%
echo.
if exist "%LOG%" (
  powershell -NoProfile -Command "Get-Content -Path '%LOG%' -Tail 35"
) else (
  echo No server log was created.
)
echo.
echo You can also run this diagnostic command manually:
echo "%PY%" scripts\server_process.py
if /I not "%~1"=="--hidden" pause
exit /b 1
