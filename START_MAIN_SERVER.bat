@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title NUNES Stock Main Server
set "NUNES_STOCK_DATA_DIR=C:\ProgramData\NunesStock\data"
set "NUNES_STOCK_PORT=5000"
set "PY=%LOCALAPPDATA%\NunesStockRuntime\venv\Scripts\python.exe"
set "LOG=%NUNES_STOCK_DATA_DIR%\server.log"
set "EXPECTED="
if exist "%CD%\VERSION" set /p "EXPECTED="<"%CD%\VERSION"

if not exist "%PY%" (
  echo NUNES Stock runtime is not installed on this PC.
  echo Run SETUP_MAIN_SERVER.bat once as Administrator.
  if /I not "%~1"=="--hidden" pause
  exit /b 1
)

rem IMPORTANT v2.4.1 FIX:
rem Never accept "something is on port 5000" as proof that this version is running.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5000 .*LISTENING"') do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try{$r=Invoke-RestMethod -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:5000/api/system/health'; if(([string]$r.status -eq 'online') -and ([string]$r.version -eq '%EXPECTED%')){exit 0}else{exit 2}}catch{exit 3}"
  if not errorlevel 1 (
    if /I not "%~1"=="--hidden" start "" "http://127.0.0.1:5000/?release=%EXPECTED%"
    exit /b 0
  )
  echo.
  echo [ERROR] Port 5000 is already running a different/older server.
  echo Expected NUNES Stock version: %EXPECTED%
  echo Run 0_FORCE_UPDATE_RESET_AND_START.bat to replace the old server safely.
  if /I not "%~1"=="--hidden" pause
  exit /b 2
)

if not exist "%NUNES_STOCK_DATA_DIR%" mkdir "%NUNES_STOCK_DATA_DIR%" >nul 2>&1

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p=Start-Process -FilePath '%PY%' -ArgumentList 'scripts\server_process.py' -WorkingDirectory '%CD%' -WindowStyle Hidden -PassThru; Start-Sleep -Seconds 3; if($p.HasExited){exit 1}else{exit 0}"
if errorlevel 1 goto :failed

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$expected='%EXPECTED%'; $ok=$false; 1..15 | %% { try{$r=Invoke-RestMethod -UseBasicParsing -TimeoutSec 4 'http://127.0.0.1:5000/api/system/health'; if(([string]$r.status -eq 'online') -and ([string]$r.version -eq $expected)){$ok=$true;break}}catch{}; Start-Sleep -Seconds 1 }; if($ok){exit 0}else{exit 1}"
if errorlevel 1 goto :failed

if /I not "%~1"=="--hidden" start "" "http://127.0.0.1:5000/?release=%EXPECTED%"
exit /b 0

:failed
echo.
echo Failed to start the expected NUNES Stock version %EXPECTED%.
echo Diagnostic log:
echo %LOG%
echo.
if exist "%LOG%" powershell -NoProfile -Command "Get-Content -Path '%LOG%' -Tail 35"
if /I not "%~1"=="--hidden" pause
exit /b 1
