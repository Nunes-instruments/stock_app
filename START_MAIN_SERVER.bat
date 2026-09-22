@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title NUNES Stock V3 Server 5055 Status

set "MODE=%~1"
if /I "%MODE%"=="--hidden" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\start_main_server.ps1" -Hidden
  exit /b %ERRORLEVEL%
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\start_main_server.ps1"
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo Server is running. Press any key to close this STATUS window.
  echo Closing this window WILL NOT stop the NUNES Stock server.
) else (
  echo Startup failed with code %RC%.
  echo The error above will remain here until you press a key.
)
pause >nul
exit /b %RC%
