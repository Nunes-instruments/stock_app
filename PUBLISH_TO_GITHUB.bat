@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title NUNES Stock v3.2.12 - Unified Safe GitHub Main Publish

for %%I in ("%~dp0.") do set "SOURCE=%%~fI"
set "REPO=https://github.com/Nunes-instruments/stock_app.git"
set "TEMP_REPO=%TEMP%\NunesStock_v3212_Publish"
set "RUNTIME=%LOCALAPPDATA%\NunesStockRuntimeV31\venv\Scripts\python.exe"
set "PREFLIGHT_DATA=%TEMP%\NunesStock_v3212_publish_preflight_data"
set "OVERLAY=%SOURCE%\scripts\safe_publish_overlay.py"

if not exist "%OVERLAY%" set "OVERLAY=%SOURCE%\safe_publish_overlay.py"

echo ============================================================
echo  NUNES STOCK v3.2.12 - UNIFIED SAFE GITHUB MAIN PUBLISH
echo ============================================================
echo Repository : %REPO%
echo Source     : %SOURCE%
echo Version    : 3.2.12
echo Data files : NEVER PUBLISHED
echo Force push : NEVER USED
echo ============================================================

where git >nul 2>&1 || (echo ERROR: Git for Windows is required.& pause & exit /b 1)
if not exist "%OVERLAY%" (echo ERROR: Safe overlay helper is missing: %OVERLAY%& pause & exit /b 1)
if not exist "%SOURCE%\VERSION" (echo ERROR: VERSION file missing from live app.& pause & exit /b 1)
set /p LIVE_VERSION=<"%SOURCE%\VERSION"
if /I not "!LIVE_VERSION!"=="3.2.12" (
  echo ERROR: Live application version is !LIVE_VERSION!, not 3.2.12.
  echo Publish was stopped so the wrong release cannot reach GitHub main.
  pause
  exit /b 1
)

set "PYTHON="
if exist "%RUNTIME%" set "PYTHON=%RUNTIME%"
if not defined PYTHON (
  where py >nul 2>&1 || (echo ERROR: Python runtime was not found.& pause & exit /b 1)
  set "PYTHON=py -3"
)

if exist "%TEMP_REPO%" rmdir /s /q "%TEMP_REPO%"
if exist "%PREFLIGHT_DATA%" rmdir /s /q "%PREFLIGHT_DATA%"

echo [1/7] Cloning current GitHub main...
git clone "%REPO%" "%TEMP_REPO%"
if errorlevel 1 goto :FAIL

echo [2/7] Overlaying tested v3.2.12 unified code safely...
%PYTHON% "%OVERLAY%" overlay "%SOURCE%" "%TEMP_REPO%"
if errorlevel 1 goto :FAIL

echo [3/7] Staging and verifying no business/runtime data...
pushd "%TEMP_REPO%"
git add -A
%PYTHON% "%OVERLAY%" validate "%TEMP_REPO%"
if errorlevel 1 (popd & goto :FAIL)

echo [4/7] Running source and production preflight...
%PYTHON% -m compileall -q .
if errorlevel 1 (popd & goto :FAIL)
if exist "scripts\preflight.py" (
  set "NUNES_STOCK_DATA_DIR=%PREFLIGHT_DATA%"
  %PYTHON% scripts\preflight.py
  if errorlevel 1 (popd & goto :FAIL)
) else (
  echo ERROR: scripts\preflight.py is missing from the release.
  popd
  goto :FAIL
)

echo [5/7] Creating release commit...
git config user.name "Nunes Instruments Stock Server"
git config user.email "stock-server@nunes.local"
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "NUNES Stock v3.2.12 - Unified UI, history, shared Shelf Rack and clients"
  if errorlevel 1 (popd & goto :FAIL)
) else (
  echo No code changes to publish.
)

echo [6/7] Pushing normal fast-forward update to main...
git push origin HEAD:main
if errorlevel 1 (popd & goto :FAIL)

echo [7/7] Verifying GitHub main version...
git fetch origin main
if errorlevel 1 (popd & goto :FAIL)
set "REMOTE_VERSION="
for /f "usebackq delims=" %%V in (`git show origin/main:VERSION 2^>nul`) do if not defined REMOTE_VERSION set "REMOTE_VERSION=%%V"
if /I not "!REMOTE_VERSION!"=="3.2.12" (
  echo ERROR: GitHub main VERSION is !REMOTE_VERSION!, expected 3.2.12.
  popd
  goto :FAIL
)
for /f "delims=" %%H in ('git rev-parse HEAD') do set "PUBLISHED_COMMIT=%%H"
popd

if exist "%TEMP_REPO%" rmdir /s /q "%TEMP_REPO%"
if exist "%PREFLIGHT_DATA%" rmdir /s /q "%PREFLIGHT_DATA%"
echo.
echo ============================================================
echo  PUBLISH COMPLETE - VERIFIED
echo ============================================================
echo GitHub main version : 3.2.12
echo Commit              : !PUBLISHED_COMMIT!
echo Force push          : NOT USED
echo Database/data       : NOT PUBLISHED
echo ============================================================
echo The main server can now use its normal 5-minute Git updater.
echo ============================================================
pause
exit /b 0

:FAIL
set "ERR=%ERRORLEVEL%"
if "%ERR%"=="0" set "ERR=1"
if exist "%PREFLIGHT_DATA%" rmdir /s /q "%PREFLIGHT_DATA%" >nul 2>&1
echo.
echo ============================================================
echo  PUBLISH FAILED - ERROR CODE %ERR%
echo ============================================================
echo No force push was attempted.
echo Current live stock database was not changed.
if exist "%TEMP_REPO%" echo Temporary clone kept for inspection: %TEMP_REPO%
echo ============================================================
pause
exit /b %ERR%
